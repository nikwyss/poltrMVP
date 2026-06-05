"""
XRPC route: taxonomy.get — der Themen-Baum eines Ballots MIT den darin
eingeordneten Argumenten (für die Frontend-View „taxonomy", neben booklet/feed).

Liest die vom Calculator gepflegte Top-down-Hierarchie (app_topic_node /
app_topic_membership) und reichert jeden Knoten mit seinen Argumenten an: ein
Argument hängt über seine Open Codes an einem Knoten und kann — über mehrere
Codes — an mehreren Knoten erscheinen (Multi-Thema). Read-only, ATProto-
unabhängig (Analyse-Schicht; die Argumente selbst sind ATProto-Records).

Antwort:
  { ballotRkey, tree: Node }
  Node = { id, key, name, description, depth, argumentCount (Teilbaum, distinct),
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
from src.routes.deliberation._lang import pick_translation, resolve_requested_lang

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
    """Randomisiert rekursiv die Geschwister-Themen UND die Argumente jedes
    Knotens (gleiche Stufe → alle gemischt), user-stabil über den Seed.
    Offizielle Argumente kommen immer zuerst, aber innerhalb ihrer Gruppe
    (und der übrigen) ebenfalls user-stabil gemischt."""
    node["children"] = _seed_sort(
        node["children"], seed, lambda c: c.get("key") or str(c["id"])
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
        "description": child["description"], "depth": child["depth"],
        "children": [], "arguments": list(seen.values()), "argumentCount": 0,
    }


def _aggregate(node: dict, acc: set, arg_meta: dict) -> set:
    """Rekursiv: setzt je Knoten `argumentCount` (distinct im Teilbaum) und die
    relevanz-gewichtete Pro-Vorlage-Neigung `proLeaning` ∈ [-1, 1] (None, wenn
    keine bewerteten Argumente). PRO-Argumente zählen positiv, CONTRA negativ,
    gewichtet mit der Relevanz-Bewertung des Viewers. `arg_meta[uri] = (pref, sign)`
    für vom Viewer bewertete Argumente."""
    local: set = set()
    for a in node["arguments"]:
        local.add(a["uri"])
    for ch in node["children"]:
        _aggregate(ch, local, arg_meta)
    node["argumentCount"] = len(local)
    # relevanz-gewichtete Neigung + Dissens über die bewerteten Argumente.
    pro_w = 0.0   # Relevanz-Summe der PRO-Argumente
    contra_w = 0.0
    rated = 0
    for uri in local:
        meta = arg_meta.get(uri)
        if meta is None:
            continue
        pref, sign = meta
        if sign > 0:
            pro_w += pref
        else:
            contra_w += pref
        rated += 1
    total = pro_w + contra_w
    node["ratedCount"] = rated
    # proLeaning ∈ [-1,1]: -1 = ganz Gegner-Seite, +1 = ganz Befürworter-Seite.
    node["proLeaning"] = round((pro_w - contra_w) / total, 4) if total > 0 else None
    # dissent ∈ [0,1]: 1 = beide Pole gleich stark bewertet (gespalten), 0 = einseitig.
    node["dissent"] = round(2 * min(pro_w, contra_w) / total, 4) if total > 0 else 0.0
    acc |= local
    return local


@router.get("/app.ch.poltr.taxonomy.get")
async def get_taxonomy(
    ballot_rkey: str = Query(...),
    topic: Optional[str] = Query(None),
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

    Mit Session: je Knoten die relevanz-gewichtete Pro-Vorlage-Neigung des Viewers."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    viewer_did = session.did if session else None
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            nodes = await conn.fetch(
                """SELECT id, parent_id, key, name, description, depth
                   FROM app_topic_node WHERE ballot_rkey = $1
                   ORDER BY depth, id""",
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
                   FROM app_topic_membership m
                   JOIN app_arguments a ON a.uri = m.argument_uri
                   WHERE m.ballot_rkey = $1 AND NOT a.deleted""",
                ballot_rkey, viewer_did,
            )

        # node_id → { uri → arg }  (ein Argument je Knoten nur einmal)
        # arg_meta[uri] = (relevanz, sign) für vom Viewer bewertete Argumente.
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
                arg_meta[r["uri"]] = (float(pref), 1.0 if r["type"] == "PRO" else -1.0)

        by_id: dict[int, dict] = {
            n["id"]: {
                "id": n["id"], "key": n["key"], "name": n["name"],
                "description": n["description"], "depth": n["depth"],
                "children": [], "arguments": [], "argumentCount": 0,
            }
            for n in nodes
        }
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

        # Eine Ebene tiefer zusammenfassen: jedes direkte Kind wird zu einem flachen
        # Knoten mit allen Argumenten seines Teilbaums; die eigenen (direkt am Basis-
        # Knoten hängenden) Argumente bleiben als base["arguments"].
        base = {
            **base,
            "children": [_flatten_child(c) for c in base["children"]],
        }
        # Reihenfolge: user-stabiler Shuffle der Geschwister-Themen und der
        # Argumente jedes Knotens (wie booklet argument.list, offizielle zuerst).
        # Vor _aggregate, damit die Zähler unberührt bleiben.
        _shuffle_tree(base, viewer_did or "")
        _aggregate(base, set(), arg_meta)

        return JSONResponse(status_code=200,
                            content={"ballotRkey": ballot_rkey, "tree": base})
    except Exception as err:
        logger.error(f"taxonomy.get failed: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "details": str(err)})
