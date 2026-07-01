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


async def fetch_top_level_topics(ballot_rkey: str) -> list[str]:
    """Namen der HAUPTthemen (direkte Kinder der Wurzel) einer Vorlage, in
    Anzeige-Reihenfolge. Leer, wenn (noch) keine Taxonomie existiert. Für den
    Thematik-Check (Variante B) — der Stimmigkeits-LLM ordnet einem dieser
    Themen zu oder „ANDERES"."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT n.name
               FROM app_taxonomy_node n
               JOIN app_taxonomy_node p ON p.id = n.parent_id
               WHERE n.ballot_rkey = $1 AND p.parent_id IS NULL
               ORDER BY n.node_order, n.id""",
            ballot_rkey)
    return [r["name"] for r in rows if r["name"]]
