"""
XRPC route: taxonomy.get — der Themen-Baum eines Ballots MIT den darin
eingeordneten Argumenten (für die Frontend-View „taxonomy", neben booklet/feed).

Liest die vom Calculator gepflegte Top-down-Hierarchie (app_taxonomy_node /
app_taxonomy_membership) und reichert jeden Knoten mit seinen Argumenten an: ein
Argument wird direkt einem Hauptthema zugeordnet und kann mit gekappter
Multimembership zusätzlich an einem Nebenthema erscheinen (Multi-Thema).
Read-only, ATProto-unabhängig (Analyse-Schicht; die Argumente selbst sind
ATProto-Records).

Antwort:
  { ballotRkey, tree: Node }
  Node = { id, key, name, description (intern, LLM-Klassifikation),
           introduction (voter-facing), depth, argumentCount (Teilbaum, distinct),
           arguments: [{uri, rkey, title, type, sourceType, likeCount,
                        availableLangs}], children: [Node, …] }
"""

import hashlib
import json
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger
from src.routes.deliberation._lang import (
    pick_node_translation,
    pick_translation,
    resolve_requested_lang,
)

router = APIRouter(prefix="/xrpc", tags=["poltr-taxonomy"])


def _seed_sort(items: list, seed: str, ident) -> list:
    """Stabiler per-User-Shuffle (genau wie booklet `argument.list`): sortiert
    `items` nach md5(f"{seed}:{ident(item)}"). Jeder Viewer bekommt eine feste,
    aber zufällige Reihenfolge, die sich beim Hinzufügen neuer Einträge nicht
    umordnet. Anonym (seed = "") → eine stabile globale Reihenfolge."""
    return sorted(
        items,
        key=lambda it: hashlib.md5(f"{seed}:{ident(it)}".encode()).hexdigest(),
    )


def _shuffle_tree(node: dict, seed: str) -> None:
    """Ordnet rekursiv die Geschwister-Themen UND die Argumente jedes Knotens.

    Themen: zuerst nach `importance` (LLM-Prior 1–5, höher = wichtiger; NULL =
    am wenigsten wichtig), bei gleicher Stufe user-stabil gemischt (Seed).
    Argumente: offizielle zuerst, innerhalb ihrer Gruppe user-stabil gemischt."""
    node["children"] = sorted(
        node["children"],
        key=lambda c: (
            -(c.get("importance") or 0),  # höhere Wichtigkeit zuerst; NULL = 0
            hashlib.md5(
                f"{seed}:{c.get('key') or c['id']}".encode()
            ).hexdigest(),
        ),
    )
    node["arguments"] = sorted(
        node["arguments"],
        key=lambda a: (
            a["sourceType"] != "official",  # offizielle zuerst
            hashlib.md5(f"{seed}:{a['uri']}".encode()).hexdigest(),  # dann gemischt
        ),
    )
    for ch in node["children"]:
        _shuffle_tree(ch, seed)


def _flatten_child(child: dict) -> dict:
    """Fasst den Teilbaum von `child` zu EINEM flachen Knoten zusammen: alle
    Argumente des Teilbaums (Kind + alle Nachfahren) werden gesammelt, tiefere
    Ebenen entfallen. Multi-Membership innerhalb des Teilbaums wird per uri
    dedupliziert (Reihenfolge bleibt erhalten)."""
    seen: dict[str, dict] = {}

    def walk(n: dict) -> None:
        for a in n["arguments"]:
            seen.setdefault(a["uri"], a)
        for c in n["children"]:
            walk(c)

    walk(child)
    return {
        "id": child["id"], "key": child["key"], "name": child["name"],
        "description": child["description"], "introduction": child.get("introduction"),
        "depth": child["depth"], "importance": child.get("importance"),
        # Struktur wird abgeflacht (children: []), aber wir merken uns, ob es
        # ursprünglich eigene Unterthemen gab — das Frontend entscheidet damit
        # zwischen Drilldown („Mehr zum Unterthema") und inline „Mehr anzeigen".
        "hasChildren": len(child["children"]) > 0,
        "children": [], "arguments": list(seen.values()), "argumentCount": 0,
    }


def _slim(node: dict) -> dict:
    """Reduziert einen (bereits aggregierten) Knoten auf die fürs Sunburst nötigen
    Felder — und das rekursiv über den ganzen Baum. Hält den `shape=full`-Payload
    klein: nur Struktur + Aggregate, plus eine MINIMALE Argument-Projektion
    (`uri`/`type`/`viewerPreference`). Diese Projektion erlaubt es dem Frontend,
    nach einer Bewertung die Aggregate lokal neu zu rechnen (Sunburst zieht live
    mit), ohne die vollen Argument-Objekte (Titel/Body/…) zu übertragen."""
    return {
        "id": node["id"], "key": node["key"], "name": node["name"],
        "description": node["description"], "introduction": node.get("introduction"),
        "depth": node["depth"],
        "argumentCount": node.get("argumentCount", 0),
        "proLeaning": node.get("proLeaning"),
        "dissent": node.get("dissent", 0.0),
        "ratedCount": node.get("ratedCount", 0),
        "arguments": [
            {"uri": a["uri"], "type": a["type"],
             "viewerPreference": a.get("viewerPreference")}
            for a in node["arguments"]
        ],
        "children": [_slim(c) for c in node["children"]],
    }


def _aggregate(node: dict, acc: set, arg_meta: dict) -> set:
    """Rekursiv: setzt je Knoten `argumentCount` (distinct im Teilbaum) und die
    Pro-Vorlage-Neigung `proLeaning` ∈ [-1, 1] (None, wenn keine aussagekräftig
    bewerteten Argumente).

    Modell: die Bewertung eines Arguments ist ZUSTIMMUNG (1–100, 50 = neutral),
    nicht reines Gewicht. Pro Argument ist `arg_meta[uri]` der Pro-Vorlage-Beitrag
    ∈ [-1, 1] = Seite (PRO +1 / CONTRA −1) × zentrierter Zustimmung (pref−50)/50.
    Ein *abgelehntes* Contra (niedrige Bewertung) zählt also Richtung Befürworter,
    ein *bestätigtes* Contra Richtung Gegner — analog für Pro. Beiträge werden
    nach positiver/negativer Seite gebündelt und über die Gesamtmasse normiert."""
    local: set = set()
    for a in node["arguments"]:
        local.add(a["uri"])
    for ch in node["children"]:
        _aggregate(ch, local, arg_meta)
    node["argumentCount"] = len(local)
    # Zustimmungs-Beiträge der bewerteten Argumente in Richtung Befürworter (pos)
    # bzw. Gegner (neg) bündeln. Neutrale (Beitrag 0) zählen als bewertet, tragen
    # aber keine Richtung bei.
    pos = 0.0   # Masse Richtung Befürworter
    neg = 0.0   # Masse Richtung Gegner
    rated = 0
    for uri in local:
        contrib = arg_meta.get(uri)
        if contrib is None:
            continue
        if contrib > 0:
            pos += contrib
        elif contrib < 0:
            neg += -contrib
        rated += 1
    total = pos + neg
    node["ratedCount"] = rated
    # proLeaning ∈ [-1,1]: -1 = ganz Gegner-Seite, +1 = ganz Befürworter-Seite.
    node["proLeaning"] = round((pos - neg) / total, 4) if total > 0 else None
    # dissent ∈ [0,1]: 1 = beide Pole gleich stark (gespalten), 0 = einseitig.
    node["dissent"] = round(2 * min(pos, neg) / total, 4) if total > 0 else 0.0
    acc |= local
    return local


@router.get("/app.ch.poltr.taxonomy.get")
async def get_taxonomy(
    ballot_rkey: str = Query(...),
    topic: Optional[str] = Query(None),
    shape: Optional[str] = Query(None),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """Themen-Baum eines Ballots inkl. eingeordneter Argumente (lokalisiert).
    Immer Basis-Knoten + genau EINE Ebene Kinder; jedes Kind sammelt alle
    Argumente seines Teilbaums (tiefere Ebenen rollen hoch).

    - ohne `topic`: Basis = Wurzel → flache Sicht auf die Hauptthemen.
    - mit `topic` (Slug = node.key): Basis = dieses Topic → seine Subtopics; die
      3. Ebene entfällt (ihre Argumente landen im jeweiligen Subtopic).

    Mit Session: je Knoten die zustimmungs-gewichtete Pro-Vorlage-Neigung des Viewers."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    viewer_did = session.did if session else None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            nodes = await conn.fetch(
                """SELECT id, parent_id, key, name, description, introduction,
                          depth, importance, langs, translations
                   FROM app_taxonomy_node WHERE ballot_rkey = $1
                   ORDER BY depth, node_order, id""",
                ballot_rkey,
            )
            if not nodes:
                return JSONResponse(
                    status_code=404,
                    content={"error": "not_found",
                             "message": f"Keine Taxonomie für Ballot {ballot_rkey}."},
                )
            rows = await conn.fetch(
                """SELECT m.node_id,
                          a.uri, a.cid, a.rkey, a.title, a.body, a.type, a.source_type,
                          a.like_count, a.langs, a.translations,
                          CASE WHEN $2::text IS NULL THEN NULL ELSE (
                              SELECT preference FROM app_likes
                              WHERE subject_uri = a.uri AND did = $2 AND NOT deleted
                              LIMIT 1
                          ) END AS viewer_pref
                   FROM app_taxonomy_membership m
                   JOIN app_arguments a ON a.uri = m.argument_uri
                   WHERE m.ballot_rkey = $1 AND NOT a.deleted""",
                ballot_rkey, viewer_did,
            )

        # node_id → { uri → arg }  (ein Argument je Knoten nur einmal)
        # arg_meta[uri] = Pro-Vorlage-Beitrag ∈ [-1,1] (siehe _aggregate / unten).
        by_node: dict[int, dict[str, dict]] = {}
        arg_meta: dict[str, tuple] = {}
        for r in rows:
            bucket = by_node.setdefault(r["node_id"], {})
            if r["uri"] in bucket:
                continue
            tx = r["translations"]
            if isinstance(tx, str):
                try:
                    tx = json.loads(tx)
                except (TypeError, ValueError):
                    tx = None
            loc = pick_translation(r["langs"], tx, r["title"], r["body"], requested_lang)
            pref = r["viewer_pref"]
            bucket[r["uri"]] = {
                "uri": r["uri"],
                "cid": r["cid"],
                "rkey": r["rkey"],
                "title": loc["title"],
                "type": r["type"],                # 'PRO' | 'CONTRA'
                "sourceType": r["source_type"],
                "likeCount": r["like_count"] or 0,
                "viewerPreference": pref,          # Relevanz-Bewertung (0–100) oder None
                "availableLangs": loc.get("availableLangs"),
            }
            if pref is not None and r["uri"] not in arg_meta:
                # Präferenz 1–100 = Zustimmung zum Argument (50 = neutral). Auf
                # [-1,1] zentrieren und mit der Seite verrechnen → Pro-Vorlage-
                # Beitrag: bestätigtes PRO/abgelehntes CONTRA → +, sonst −.
                sign = 1.0 if r["type"] == "PRO" else -1.0
                arg_meta[r["uri"]] = sign * (float(pref) - 50.0) / 50.0

        def _node_dict(n) -> dict:
            ntx = n["translations"]
            if isinstance(ntx, str):
                try:
                    ntx = json.loads(ntx)
                except (TypeError, ValueError):
                    ntx = None
            loc = pick_node_translation(
                n["langs"], ntx, n["name"], n["introduction"], requested_lang
            )
            return {
                "id": n["id"], "key": n["key"], "name": loc["name"],
                # description stays internal/German (not translated, not shown).
                "description": n["description"], "introduction": loc["introduction"],
                "depth": n["depth"], "importance": n["importance"],
                "availableLangs": loc.get("availableLangs"),
                "children": [], "arguments": [], "argumentCount": 0,
            }

        by_id: dict[int, dict] = {n["id"]: _node_dict(n) for n in nodes}
        root = None
        for n in nodes:
            node = by_id[n["id"]]
            if n["parent_id"] is None:
                root = node
            else:
                parent = by_id.get(n["parent_id"])
                if parent:
                    parent["children"].append(node)

        for nid, args in by_node.items():
            node = by_id.get(nid)
            if not node:
                continue
            node["arguments"] = list(args.values())

        # Basis-Knoten wählen: ohne `topic` die Wurzel (Hauptthemen), mit `topic`
        # der Knoten mit passendem Slug (key). Unbekannter Slug → 404.
        if topic:
            base = next((by_id[n["id"]] for n in nodes if n["key"] == topic), None)
            if base is None:
                return JSONResponse(
                    status_code=404,
                    content={"error": "not_found",
                             "message": f"Kein Topic '{topic}' für Ballot {ballot_rkey}."},
                )
        else:
            base = root

        if base is None:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found",
                         "message": f"Keine Taxonomie für Ballot {ballot_rkey}."},
            )

        # Breadcrumb = Vorfahren-Pfad des Basis-Knotens (Wurzel/Ballot UND der
        # Basis-Knoten selbst ausgelassen). Erlaubt im Overlay das Hochnavigieren.
        # Bei Default (base = root) leer.
        raw_by_id = {n["id"]: n for n in nodes}
        breadcrumb: list[dict] = []
        parent_id = raw_by_id.get(base["id"], {}).get("parent_id")
        while parent_id is not None:
            p = raw_by_id.get(parent_id)
            if p is None or p["parent_id"] is None:  # Wurzel (Ballot) auslassen
                break
            breadcrumb.append(
                {"name": p["name"], "key": p["key"], "description": p["description"]}
            )
            parent_id = p["parent_id"]
        breadcrumb.reverse()

        # Eine Ebene tiefer zusammenfassen: jedes direkte Kind wird zu einem flachen
        # Knoten mit allen Argumenten seines Teilbaums; die eigenen (direkt am Basis-
        # Knoten hängenden) Argumente bleiben als base["arguments"].
        # Direkt am Wurzelknoten (parent_id IS NULL) hängende Argumente NICHT
        # ausliefern: das ist der Alt-„andere"-Topf (Codes, die in kein Oberthema
        # passen). Sie werden nur im CMS-„Nicht zugeordnet"-Bereich verwaltet.
        base_is_root = raw_by_id.get(base["id"], {}).get("parent_id") is None
        if shape == "full":
            # Sunburst: voller verschachtelter Baum (NICHT flachklappen). Aggregate
            # je Knoten über den ganzen Teilbaum, dann auf die Struktur-Felder
            # reduzieren (ohne Argument-Arrays).
            base = {**base, "arguments": [] if base_is_root else base["arguments"]}
            _shuffle_tree(base, viewer_did or "")
            _aggregate(base, set(), arg_meta)
            base = _slim(base)
        else:
            base = {
                **base,
                "arguments": [] if base_is_root else base["arguments"],
                "children": [_flatten_child(c) for c in base["children"]],
            }
            # Reihenfolge: user-stabiler Shuffle der Geschwister-Themen und der
            # Argumente jedes Knotens (wie booklet argument.list, offizielle zuerst).
            # Vor _aggregate, damit die Zähler unberührt bleiben.
            _shuffle_tree(base, viewer_did or "")
            _aggregate(base, set(), arg_meta)

        return JSONResponse(
            status_code=200,
            content={"ballotRkey": ballot_rkey, "tree": base, "breadcrumb": breadcrumb},
        )
    except Exception as err:
        logger.error(f"taxonomy.get failed: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "details": str(err)})
