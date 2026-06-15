"""
Postgres-Pool (AppView-Schema) für die Top-down Themen-Hierarchie.

Nach dem Vorbild von services/appview/src/core/db.py. Der Calculator liest
`app_arguments` und liest/schreibt die Top-down-Hierarchie
(`app_taxonomy_node` / `app_taxonomy_membership`).
"""

from __future__ import annotations
import json
import logging
import re

import asyncpg

from src import config

logger = logging.getLogger("calculator.db")

pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global pool
    if not config.POSTGRES_URL:
        raise ValueError("CALCULATOR_POSTGRES_URL / APPVIEW_POSTGRES_URL not set")
    pool = await asyncpg.create_pool(config.POSTGRES_URL)
    return pool


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        await init_pool()
    return pool


async def check_db_connection() -> bool:
    global pool
    try:
        if pool is None:
            await init_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        logger.info("DB connection ok")
        return True
    except Exception as err:
        logger.warning("DB connection failed: %s", err)
        return False


async def close_pool() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None


def lexical_to_text(value) -> str:
    """Wandelt das Payload-/Lexical-richText-JSON (wie es in der CMS-DB-Spalte
    `ballots_locales.description` steht) in einfachen Text um. Akzeptiert ein
    dict, einen JSON-String oder bereits Plaintext. Absätze → Leerzeile,
    Zeilenumbrüche bleiben erhalten."""
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return value.strip()  # war schon Plaintext
    if not isinstance(value, dict):
        return ""
    root = value.get("root")
    if not isinstance(root, dict):
        return ""
    parts: list[str] = []

    def walk(node) -> None:
        if not isinstance(node, dict):
            return
        ntype = node.get("type")
        if ntype == "text":
            parts.append(node.get("text", ""))
            return
        if ntype == "linebreak":
            parts.append("\n")
            return
        children = node.get("children")
        if isinstance(children, list):
            for ch in children:
                walk(ch)
        # Block-Elemente durch Leerzeile trennen.
        if ntype in ("paragraph", "heading", "listitem", "quote"):
            parts.append("\n\n")

    for ch in root.get("children", []) or []:
        walk(ch)
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()


async def fetch_ballot_description(ballot_rkey: str) -> str | None:
    """Liest die amtliche Vorlagen-Beschreibung (richText) aus der CMS-DB und gibt
    sie als Plaintext zurück — bevorzugt in der Quellsprache (`origin_language`),
    sonst Deutsch. `None`, wenn keine CMS-DB konfiguriert ist oder nichts vorliegt."""
    if not config.CMS_POSTGRES_URL:
        return None
    conn = await asyncpg.connect(config.CMS_POSTGRES_URL)
    try:
        row = await conn.fetchrow(
            """SELECT
                   (SELECT l.description FROM ballots_locales l
                      WHERE l._parent_id = b.id
                        AND l._locale::text = b.origin_language::text)
                     AS desc_origin,
                   (SELECT l.description FROM ballots_locales l
                      WHERE l._parent_id = b.id AND l._locale::text = 'de')
                     AS desc_de
               FROM ballots b
               WHERE b.rkey = $1""",
            ballot_rkey)
    except asyncpg.PostgresError as err:
        logger.warning("Vorlagen-Beschreibung nicht lesbar (%s)", err)
        return None
    finally:
        await conn.close()
    if not row:
        return None
    text = lexical_to_text(row["desc_origin"] or row["desc_de"])
    return text or None


# =========================================================================
#  Top-down Themen-Hierarchie (app_taxonomy_node / app_taxonomy_membership)
# =========================================================================
_UMLAUT = str.maketrans({
    "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
    "Ä": "ae", "Ö": "oe", "Ü": "ue",
})


def _slugify(name: str) -> str:
    """Knotenname → Slug mit '-' als Trenner (Schweizer Umlaut-Auflösung)."""
    s = (name or "").translate(_UMLAUT).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "thema"


def _unique_slug(base: str, used: set[str]) -> str:
    """Eindeutigen Slug innerhalb `used` erzeugen (Kollision → -2, -3, …)."""
    slug, i = base, 2
    while slug in used:
        slug = f"{base}-{i}"
        i += 1
    used.add(slug)
    return slug


async def fetch_topic_tree(ballot_rkey: str) -> dict | None:
    """Liest den Baum eines Ballots (Knoten flach + Memberships) und baut die
    Nested-Struktur zusammen. Rückgabe: root-Knoten oder None."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        nodes = await conn.fetch(
            """SELECT id, parent_id, key, name, description, introduction, depth, importance
               FROM app_taxonomy_node WHERE ballot_rkey = $1
               ORDER BY depth, node_order, id""",
            ballot_rkey)
        if not nodes:
            return None
        mems = await conn.fetch(
            """SELECT node_id, argument_uri, confidence, stance
               FROM app_taxonomy_membership WHERE ballot_rkey = $1""", ballot_rkey)

    by_id: dict[int, dict] = {
        n["id"]: {"id": n["id"], "key": n["key"], "name": n["name"],
                  "description": n["description"], "introduction": n["introduction"],
                  "depth": n["depth"], "importance": n["importance"],
                  "children": [], "arguments": []}
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
    for m in mems:
        node = by_id.get(m["node_id"])
        if node:
            node["arguments"].append({
                "argument_uri": m["argument_uri"],
                "confidence": m["confidence"], "stance": m["stance"]})
    return root


async def fetch_arguments(ballot_rkey: str, *, limit: int | None = None) -> list[dict]:
    """Alle nicht gelöschten Argumente eines Ballots MIT Text — die Einheit der
    Klassifikation. Rückgabe:
    [{argument_uri, text, stance, source_type}], OFFIZIELLE zuerst (sie bestimmen
    die Wurzelstruktur und beim Einsortieren die Platzierung)."""
    pool = await get_pool()
    sql = """SELECT uri, title, body, type, source_type FROM app_arguments
             WHERE ballot_rkey = $1 AND NOT deleted
             ORDER BY (source_type = 'official') DESC, created_at ASC"""
    params: list = [ballot_rkey]
    if limit:
        params.append(limit)
        sql += f" LIMIT ${len(params)}"
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    out: list[dict] = []
    for r in rows:
        title, body = (r["title"] or ""), (r["body"] or "")
        stance = (r["type"] or "").strip().lower()
        out.append({
            "argument_uri": r["uri"],
            "text": f"{title}\n\n{body}".strip(),
            "stance": stance if stance in ("pro", "contra") else None,
            "source_type": r["source_type"],
        })
    return out


async def fetch_argument_texts(ballot_rkey: str) -> dict[str, str]:
    """{argument_uri: text} für alle Argumente eines Ballots. Für /grow und
    /branch_unplaced, die aus dem Editor-Baum nur uris haben, aber zum
    Re-Klassifizieren den Argumenttext brauchen."""
    return {a["argument_uri"]: a["text"] for a in await fetch_arguments(ballot_rkey)}


async def fetch_unplaced_arguments(ballot_rkey: str) -> list[dict]:
    """argument_uris OHNE Membership an einem echten (Nicht-Wurzel-)Knoten
    — d.h. noch nicht in ein Thema eingehängt. Rückgabe: [{argument_uri}]."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT a.uri FROM app_arguments a
               WHERE a.ballot_rkey = $1 AND NOT a.deleted
                 AND NOT EXISTS (
                     SELECT 1 FROM app_taxonomy_membership m
                     JOIN app_taxonomy_node n ON n.id = m.node_id
                     WHERE m.ballot_rkey = $1 AND m.argument_uri = a.uri
                       AND n.parent_id IS NOT NULL)
            """, ballot_rkey)
    return [{"argument_uri": r["uri"]} for r in rows]


async def fetch_unplaced_detailed(ballot_rkey: str) -> list[dict]:
    """Argumente ohne Thema in einem echten Ast — für den „Nicht zugeordnet"-
    Bereich im CMS-Panel. Ein Argument gilt als platziert, wenn seine Membership
    an einem Nicht-Wurzelknoten (parent_id IS NOT NULL) hängt; Memberships an der
    Wurzel sind der „andere"-Topf und zählen NICHT als platziert.
    Rückgabe pro nicht platziertem Argument:
        {argument_uri, title, type, source_type, stance, fully_missing}
    (fully_missing = gar keine Membership). Sortierung: ganz fehlende zuerst,
    dann offizielle."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT a.uri, a.title, a.body, a.type, a.source_type, a.created_at,
                      m.node_id, n.parent_id
               FROM app_arguments a
               LEFT JOIN app_taxonomy_membership m
                      ON m.ballot_rkey = $1 AND m.argument_uri = a.uri
               LEFT JOIN app_taxonomy_node n ON n.id = m.node_id
               WHERE a.ballot_rkey = $1 AND NOT a.deleted
               ORDER BY (a.source_type = 'official') DESC, a.created_at ASC
            """, ballot_rkey)
    args: dict[str, dict] = {}
    for r in rows:
        key = r["uri"]
        entry = args.get(key)
        if entry is None:
            title = (r["title"] or "").strip() or (r["body"] or "").strip()[:120]
            stance = (r["type"] or "").strip().lower()
            entry = {
                "argument_uri": key,
                "title": title,
                "type": r["type"],
                "source_type": r["source_type"],
                "stance": stance if stance in ("pro", "contra") else None,
                "_placed": False,   # Membership an einem echten (Nicht-Wurzel-)Thema
                "_has_membership": False,
            }
            args[key] = entry
        if r["node_id"] is not None:
            entry["_has_membership"] = True
            if r["parent_id"] is not None:
                entry["_placed"] = True
    out: list[dict] = []
    for e in args.values():
        if e["_placed"]:
            continue  # in einem echten Thema → nicht „nicht zugeordnet"
        e["fully_missing"] = not e.pop("_has_membership")
        e.pop("_placed", None)
        out.append(e)
    out.sort(key=lambda e: not e["fully_missing"])  # ganz fehlende zuerst (stabil)
    return out


async def fetch_overfull_nodes(ballot_rkey: str, threshold: int,
                               max_depth: int) -> list[dict]:
    """Knoten, deren DIREKTE Argumente (Memberships, die genau auf diesen Knoten
    zeigen — nicht auf Nachfahren) eine Schwelle überschreiten und die noch
    vertieft werden dürfen (depth < max_depth). Der Wurzelknoten ist dabei mit
    drin → seine Direkt-Argumente sind der „andere"-Topf, dessen Split neue
    Hauptäste erzeugt. Rückgabe: [{node_id, name, depth, arguments:[uri,…]}],
    grösste zuerst."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT n.id, n.name, n.depth,
                      array_agg(DISTINCT m.argument_uri) AS args
               FROM app_taxonomy_node n
               JOIN app_taxonomy_membership m ON m.node_id = n.id
               WHERE n.ballot_rkey = $1 AND n.depth < $2
               GROUP BY n.id, n.name, n.depth
               HAVING count(DISTINCT m.argument_uri) >= $3
               ORDER BY count(DISTINCT m.argument_uri) DESC""",
            ballot_rkey, max_depth, threshold)
    return [{"node_id": r["id"], "name": r["name"], "depth": r["depth"],
             "arguments": list(r["args"])} for r in rows]


async def split_node(ballot_rkey: str, parent_id: int, parent_depth: int,
                     subtopics: list[dict], arg_to_sub: dict[str, str]) -> dict:
    """Unterteilt einen überladenen Knoten: legt Kind-Knoten für die Unterthemen
    an und hängt die betroffenen PRIMÄR-Argumente vom Eltern- auf den Kind-Knoten
    um. Argumente mit Ziel 'andere' bleiben am Elternknoten. `arg_to_sub` =
    argument_uri → subtopic-name."""
    used = {t for t in arg_to_sub.values() if t != "andere"}
    pool = await get_pool()
    created = 0
    moved = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Bestehende Keys des Ballots laden → neue Slugs kollisionsfrei
            # (set-once: bestehende Knoten/Keys werden NIE angefasst).
            used_slugs = {r["key"] for r in await conn.fetch(
                "SELECT key FROM app_taxonomy_node WHERE ballot_rkey = $1 AND key IS NOT NULL",
                ballot_rkey)}
            name_to_id: dict[str, int] = {}
            for s in subtopics:
                if s["name"] not in used:
                    continue  # leeres Unterthema nicht anlegen
                key = _unique_slug(_slugify(s["name"]), used_slugs)
                cid = await conn.fetchval(
                    """INSERT INTO app_taxonomy_node
                           (ballot_rkey, parent_id, key, name, description, depth)
                       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
                    ballot_rkey, parent_id, key, s["name"], s.get("description"),
                    parent_depth + 1)
                name_to_id[s["name"]] = cid
                created += 1
            for arg, sub in arg_to_sub.items():
                child = name_to_id.get(sub)
                if not child:
                    continue  # 'andere' oder leeres Unterthema → bleibt am Eltern
                await conn.execute(
                    """UPDATE app_taxonomy_membership SET node_id = $1, updated_at = now()
                       WHERE ballot_rkey = $2 AND argument_uri = $3 AND node_id = $4""",
                    child, ballot_rkey, arg, parent_id)
                moved += 1
            await conn.execute(
                "UPDATE app_taxonomy_node SET updated_at = now() WHERE id = $1", parent_id)
    return {"children": created, "moved_arguments": moved}


async def add_topic_memberships(ballot_rkey: str, placements: dict[str, int],
                                args_by_uri: dict[str, dict]) -> int:
    """Inkrementell: hängt neue Argument-Memberships an die per `placements`
    (argument_uri → node_id) bestimmten Knoten. `args_by_uri` liefert die Haltung
    (stance) je Argument. Nur für NOCH NICHT verortete Argumente gedacht (sonst
    verletzt ein zweiter Knoten das ein-Knoten-pro-Argument-Constraint).
    Idempotent (ON CONFLICT)."""
    rows = [
        (ballot_rkey, node_id, uri,
         (args_by_uri.get(uri) or {}).get("confidence"),
         (args_by_uri.get(uri) or {}).get("stance"))
        for uri, node_id in placements.items()
    ]
    if not rows:
        return 0
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """INSERT INTO app_taxonomy_membership
                   (ballot_rkey, node_id, argument_uri, confidence, stance)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (ballot_rkey, argument_uri, node_id) DO UPDATE
                 SET confidence = EXCLUDED.confidence, stance = EXCLUDED.stance,
                     updated_at = now()""",
            rows)
    return len(rows)
