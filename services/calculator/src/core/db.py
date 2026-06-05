"""
Postgres-Pool (AppView-Schema) für den Open-Coding-Worker.

Nach dem Vorbild von services/appview/src/core/db.py. Der Calculator liest
`app_arguments` und schreibt `app_argument_open_codes` (siehe
doc/argument_clustering.md §9 / README „Roadmap").
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


async def fetch_codeable_ballot_rkeys() -> list[str] | None:
    """rkeys der Ballots aus der CMS-DB, deren Status codierbar ist
    (OPENCODING_CODEABLE_STATUSES). Rückgabe `None`, wenn keine CMS-DB
    konfiguriert ist → der Worker filtert dann NICHT nach Status.

    Eigene Kurzverbindung zur cms-DB (getrennte DB; kein Cross-DB-Join möglich).
    Wirft bei Fehlern (z.B. fehlender Grant) — der Batch schlägt dann fehl und
    wird beim nächsten Cron erneut versucht, statt versehentlich archivierte
    Ballots zu codieren.
    """
    if not config.CMS_POSTGRES_URL:
        return None
    conn = await asyncpg.connect(config.CMS_POSTGRES_URL)
    try:
        rows = await conn.fetch(
            "SELECT rkey FROM ballots WHERE status::text = ANY($1::text[])",
            config.OPENCODING_CODEABLE_STATUSES)
    finally:
        await conn.close()
    return [r["rkey"] for r in rows]


async def fetch_open_codes_for_ballot(ballot_rkey: str, *,
                                      limit: int | None = None,
                                      source_type: str | None = None) -> list[dict]:
    """Persistierte Open Codes (status='done') eines Ballots für die axiale
    Induktion (/induce-batch). Open Coding selbst macht der Cron-Worker — dieser
    Endpoint generiert nichts mehr, sondern liest hier.

    `source_type` (z.B. 'official') filtert optional auf eine Argument-Quelle —
    der Top-down-Baum wird initial nur aus den offiziellen Argumenten gebaut.

    Rückgabe: [{argument_uri, text, stance, codes:[{code,note,confidence}]}],
    offizielle Argumente zuerst, dann nach created_at. `stance` = Haltung des
    Arguments (`app_arguments.type`, normalisiert auf 'pro'/'contra'/None).
    """
    pool = await get_pool()
    sql = """
        SELECT oc.argument_uri, oc.codes, a.title, a.body, a.type
        FROM app_argument_open_codes oc
        JOIN app_arguments a ON a.uri = oc.argument_uri
        WHERE oc.ballot_rkey = $1 AND oc.status = 'done' AND NOT a.deleted
    """
    params: list = [ballot_rkey]
    if source_type:
        params.append(source_type)
        sql += f" AND a.source_type = ${len(params)}"
    sql += " ORDER BY (a.source_type = 'official') DESC, a.created_at ASC"
    if limit:
        params.append(limit)
        sql += f" LIMIT ${len(params)}"
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)

    out: list[dict] = []
    for r in rows:
        codes = r["codes"]
        if isinstance(codes, str):
            try:
                codes = json.loads(codes)
            except (TypeError, ValueError):
                codes = []
        if not isinstance(codes, list):
            codes = []
        title, body = r["title"] or "", r["body"] or ""
        stance = (r["type"] or "").strip().lower()
        out.append({
            "argument_uri": r["argument_uri"],
            "text": f"{title}\n\n{body}".strip(),
            "stance": stance if stance in ("pro", "contra") else None,
            "codes": codes,
        })
    return out


async def ballot_coding_coverage(ballot_rkey: str,
                                 current_sig: str | None = None) -> dict:
    """Open-Coding-Abdeckung eines Ballots — rein informativ für die
    /induce-batch-Antwort. Zeigt, über wie viele Argumente die Achsen gebaut
    wurden und ob die Code-Basis vollständig/aktuell ist (z.B. ob gerade ein
    Re-Code läuft, der nur einen Teil als `done` zurücklässt).

    `done` (= `done_current_sig` + `done_stale_sig`) entspricht dem, was
    `fetch_open_codes_for_ballot` liest, also dem axialen Input. Eine Zeile gilt
    als *current*, wenn sie `done` ist, die aktuelle Open-Coder-Signatur trägt
    UND ihr `argument_cid` noch zum Argument passt (nicht nachträglich editiert).
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
        """
        SELECT
          count(*)                                                      AS arguments_total,
          count(*) FILTER (WHERE oc.status = 'done')                    AS done,
          count(*) FILTER (WHERE oc.status = 'done'
                             AND oc.coder_signature = $2
                             AND oc.argument_cid = a.cid)               AS done_current_sig,
          count(*) FILTER (WHERE oc.status = 'done'
                             AND (oc.coder_signature IS DISTINCT FROM $2
                                  OR oc.argument_cid <> a.cid))         AS done_stale_sig,
          count(*) FILTER (WHERE oc.status = 'empty')                   AS empty,
          count(*) FILTER (WHERE oc.status = 'processing')              AS processing,
          count(*) FILTER (WHERE oc.status IN ('failed','failed_permanent')) AS failed,
          count(*) FILTER (WHERE oc.argument_uri IS NULL)               AS uncoded
        FROM app_arguments a
        LEFT JOIN app_argument_open_codes oc ON oc.argument_uri = a.uri
        WHERE a.ballot_rkey = $1 AND a.deleted = false
        """,
        ballot_rkey, current_sig,
    )
    cov = dict(row)
    cov["current_open_coder_signature"] = current_sig
    return cov


async def persist_taxonomy(ballot_rkey: str, data: dict, *,
                           axial_model: str | None, code_count: int,
                           run_metrics: dict | None = None) -> int:
    """Schreibt einen Taxonomie-Lauf in die 4 Tabellen (run/axis/bundle/
    membership) und gibt die `run_id` zurück. `data` = TagSystem
    .taxonomy_for_persistence(); `run_metrics` = Lauf-weite Qualitätsindikatoren
    (bundled + stage0_* + prebundle_*). Versioniert: jeder Lauf = ein neuer Run.
    """
    m = run_metrics or {}
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            run_id = await conn.fetchval(
                """INSERT INTO app_taxonomy_run (ballot_rkey, axial_model,
                       code_count, bundled,
                       stage0_applied, stage0_min_frequency, stage0_kept, stage0_margin,
                       prebundle_backend, prebundle_target, prebundle_rounds,
                       prebundle_final_floor, prebundle_capped, prebundle_max_size,
                       prebundle_max_bundle, arguments_total, arguments_unassigned)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                           $15, $16, $17)
                   RETURNING id""",
                ballot_rkey, axial_model, code_count, m.get("bundled"),
                m.get("stage0_applied"), m.get("stage0_min_frequency"),
                m.get("stage0_kept"), m.get("stage0_margin"),
                m.get("prebundle_backend"), m.get("prebundle_target"),
                m.get("prebundle_rounds"), m.get("prebundle_final_floor"),
                m.get("prebundle_capped"), m.get("prebundle_max_size"),
                m.get("prebundle_max_bundle"), m.get("arguments_total"),
                m.get("arguments_unassigned"))

            axis_db: dict[str, int] = {}      # local_id -> db id
            for a in data["axes"]:
                axis_db[a["local_id"]] = await conn.fetchval(
                    """INSERT INTO app_taxonomy_axis
                           (run_id, label, description, pole_a, pole_b, kind,
                            bundle_count, argument_count, code_count, pro_share)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id""",
                    run_id, a["label"], a["description"],
                    a.get("pole_a"), a.get("pole_b"), a["kind"],
                    a.get("bundle_count", 0), a.get("argument_count", 0),
                    a.get("code_count", 0), a.get("pro_share"))

            bundle_db: dict[str, int] = {}
            for b in data["bundles"]:
                axis_id = axis_db.get(b["axis_local_id"])
                bundle_db[b["local_id"]] = await conn.fetchval(
                    """INSERT INTO app_taxonomy_bundle
                           (run_id, axis_id, representative, code_count,
                            cohesion, avg_confidence)
                       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
                    run_id, axis_id, b["representative"], b.get("code_count", 0),
                    b.get("cohesion"), b.get("avg_confidence"))

            rows = [
                (run_id, mb["argument_uri"], mb["code"],
                 bundle_db.get(mb["bundle_local_id"]), axis_db[mb["axis_local_id"]],
                 mb.get("pole"), mb.get("stance"), mb.get("confidence"))
                for mb in data["memberships"]
            ]
            if rows:
                await conn.executemany(
                    """INSERT INTO app_taxonomy_membership
                           (run_id, argument_uri, code, bundle_id, axis_id,
                            pole, stance, confidence)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                    rows)

            # Rollup Argument → Achse (Pol aus Code-Polen abgeleitet, kein LLM).
            aa_rows = [
                (run_id, r["argument_uri"], axis_db[r["axis_local_id"]],
                 r.get("pole"), r.get("stance"), r.get("code_count", 0),
                 r.get("confidence"), bool(r.get("conflict")))
                for r in data.get("argument_axes", [])
                if r["axis_local_id"] in axis_db
            ]
            if aa_rows:
                await conn.executemany(
                    """INSERT INTO app_arguments_axis
                           (run_id, argument_uri, axis_id, pole, stance,
                            code_count, confidence, conflict)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)""",
                    aa_rows)
    return run_id


# =========================================================================
#  Top-down Themen-Hierarchie (app_topic_node / app_topic_membership)
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


async def persist_topic_tree(ballot_rkey: str, tree: dict,
                             entries: list[tuple]) -> dict:
    """Vollständiges Ersetzen: löscht den bestehenden Baum des Ballots und
    schreibt den neuen. `tree` = Nested-Dict (name/description/children/own_codes),
    `entries` = [(argument_uri, code, confidence, stance)]. Ein Code hängt an dem
    Knoten, in dessen `own_codes` er steht. Rückgabe: {nodes, memberships}.
    """
    pool = await get_pool()
    code_to_node: dict[str, int] = {}
    stats = {"nodes": 0}
    used_slugs: set[str] = set()

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Alten Baum entfernen (CASCADE räumt die Memberships ab).
            await conn.execute(
                "DELETE FROM app_topic_node WHERE ballot_rkey = $1", ballot_rkey)

            async def insert(node: dict, parent_id, depth: int):
                name = node.get("name") or "(Wurzel)"
                key = _unique_slug(_slugify(name), used_slugs)
                nid = await conn.fetchval(
                    """INSERT INTO app_topic_node
                           (ballot_rkey, parent_id, key, name, description, depth)
                       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
                    ballot_rkey, parent_id, key, name,
                    node.get("description"), depth)
                stats["nodes"] += 1
                for code in node.get("own_codes", []):
                    code_to_node[code] = nid
                for child in node.get("children", []):
                    await insert(child, nid, depth + 1)

            await insert(tree, None, 0)

            rows = [
                (ballot_rkey, code_to_node[code], arg, code, conf, stance)
                for (arg, code, conf, stance) in entries
                if code in code_to_node
            ]
            if rows:
                await conn.executemany(
                    """INSERT INTO app_topic_membership
                           (ballot_rkey, node_id, argument_uri, code, confidence, stance)
                       VALUES ($1, $2, $3, $4, $5, $6)
                       ON CONFLICT (ballot_rkey, argument_uri, code) DO UPDATE
                         SET node_id = EXCLUDED.node_id,
                             confidence = EXCLUDED.confidence,
                             stance = EXCLUDED.stance, updated_at = now()""",
                    rows)
    return {"nodes": stats["nodes"], "memberships": len(rows)}


async def fetch_topic_tree(ballot_rkey: str) -> dict | None:
    """Liest den Baum eines Ballots (Knoten flach + Memberships) und baut die
    Nested-Struktur zusammen. Rückgabe: root-Knoten oder None."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        nodes = await conn.fetch(
            """SELECT id, parent_id, key, name, description, depth
               FROM app_topic_node WHERE ballot_rkey = $1 ORDER BY depth, id""",
            ballot_rkey)
        if not nodes:
            return None
        mems = await conn.fetch(
            """SELECT node_id, argument_uri, code, confidence, stance
               FROM app_topic_membership WHERE ballot_rkey = $1""", ballot_rkey)

    by_id: dict[int, dict] = {
        n["id"]: {"id": n["id"], "key": n["key"], "name": n["name"],
                  "description": n["description"], "depth": n["depth"],
                  "children": [], "codes": []}
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
            node["codes"].append({
                "code": m["code"], "argument_uri": m["argument_uri"],
                "confidence": m["confidence"], "stance": m["stance"]})
    return root


async def fetch_unplaced_entries(ballot_rkey: str) -> list[dict]:
    """Codes/Argumente (status='done'), die noch NICHT im Themenbaum hängen
    (für das inkrementelle Einsortieren). Rückgabe: [{argument_uri, code,
    confidence, stance}]."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT oc.argument_uri, oc.codes, a.type
               FROM app_argument_open_codes oc
               JOIN app_arguments a ON a.uri = oc.argument_uri
               WHERE oc.ballot_rkey = $1 AND oc.status = 'done' AND NOT a.deleted
                 AND NOT EXISTS (
                     SELECT 1 FROM app_topic_membership m
                     WHERE m.ballot_rkey = $1 AND m.argument_uri = oc.argument_uri)
            """, ballot_rkey)
    out: list[dict] = []
    for r in rows:
        codes = r["codes"]
        if isinstance(codes, str):
            try:
                codes = json.loads(codes)
            except (TypeError, ValueError):
                codes = []
        if not isinstance(codes, list):
            codes = []
        stance = (r["type"] or "").strip().lower()
        stance = stance if stance in ("pro", "contra") else None
        seen: set[str] = set()
        for c in codes:
            lbl = (c.get("code") or "").strip()
            if not lbl or lbl in seen:
                continue
            seen.add(lbl)
            out.append({"argument_uri": r["argument_uri"], "code": lbl,
                        "confidence": float(c.get("confidence", 1.0)), "stance": stance})
    return out


async def fetch_overfull_nodes(ballot_rkey: str, threshold: int,
                               max_depth: int) -> list[dict]:
    """Knoten, deren DIREKTE Codes (Memberships, die genau auf diesen Knoten
    zeigen — nicht auf Nachfahren) eine Schwelle überschreiten und die noch
    vertieft werden dürfen (depth < max_depth). Der Wurzelknoten ist dabei mit
    drin → seine Direkt-Codes sind der „andere"-Topf, dessen Split neue Hauptäste
    erzeugt. Rückgabe: [{node_id, name, depth, codes:[label,...]}], grösste zuerst."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT n.id, n.name, n.depth,
                      array_agg(DISTINCT m.code) AS codes
               FROM app_topic_node n
               JOIN app_topic_membership m ON m.node_id = n.id
               WHERE n.ballot_rkey = $1 AND n.depth < $2
               GROUP BY n.id, n.name, n.depth
               HAVING count(DISTINCT m.code) >= $3
               ORDER BY count(DISTINCT m.code) DESC""",
            ballot_rkey, max_depth, threshold)
    return [{"node_id": r["id"], "name": r["name"], "depth": r["depth"],
             "codes": list(r["codes"])} for r in rows]


async def split_node(ballot_rkey: str, parent_id: int, parent_depth: int,
                     subtopics: list[dict], code_to_sub: dict[str, str]) -> dict:
    """Unterteilt einen überladenen Knoten: legt Kind-Knoten für die Unterthemen
    an und hängt die betroffenen Codes (Memberships) vom Eltern- auf den
    Kind-Knoten um. Codes mit Ziel 'andere' bleiben am Elternknoten."""
    used = {t for t in code_to_sub.values() if t != "andere"}
    pool = await get_pool()
    created = 0
    moved = 0
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Bestehende Keys des Ballots laden → neue Slugs kollisionsfrei
            # (set-once: bestehende Knoten/Keys werden NIE angefasst).
            used_slugs = {r["key"] for r in await conn.fetch(
                "SELECT key FROM app_topic_node WHERE ballot_rkey = $1 AND key IS NOT NULL",
                ballot_rkey)}
            name_to_id: dict[str, int] = {}
            for s in subtopics:
                if s["name"] not in used:
                    continue  # leeres Unterthema nicht anlegen
                key = _unique_slug(_slugify(s["name"]), used_slugs)
                cid = await conn.fetchval(
                    """INSERT INTO app_topic_node
                           (ballot_rkey, parent_id, key, name, description, depth)
                       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
                    ballot_rkey, parent_id, key, s["name"], s.get("description"),
                    parent_depth + 1)
                name_to_id[s["name"]] = cid
                created += 1
            for code, sub in code_to_sub.items():
                child = name_to_id.get(sub)
                if not child:
                    continue  # 'andere' oder leeres Unterthema → bleibt am Eltern
                await conn.execute(
                    """UPDATE app_topic_membership SET node_id = $1, updated_at = now()
                       WHERE ballot_rkey = $2 AND code = $3 AND node_id = $4""",
                    child, ballot_rkey, code, parent_id)
                moved += 1
            await conn.execute(
                "UPDATE app_topic_node SET updated_at = now() WHERE id = $1", parent_id)
    return {"children": created, "moved_codes": moved}


async def add_topic_memberships(ballot_rkey: str, placements: dict[str, int],
                                entries: list[dict]) -> int:
    """Inkrementell: hängt neue (Argument, Code)-Memberships an die per
    `placements` (code → node_id) bestimmten Knoten. Idempotent (ON CONFLICT)."""
    rows = [
        (ballot_rkey, placements[e["code"]], e["argument_uri"], e["code"],
         e.get("confidence"), e.get("stance"))
        for e in entries if e["code"] in placements
    ]
    if not rows:
        return 0
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(
            """INSERT INTO app_topic_membership
                   (ballot_rkey, node_id, argument_uri, code, confidence, stance)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (ballot_rkey, argument_uri, code) DO UPDATE
                 SET node_id = EXCLUDED.node_id, confidence = EXCLUDED.confidence,
                     stance = EXCLUDED.stance, updated_at = now()""",
            rows)
    return len(rows)
