"""
Cosine similarity queries over app_embeddings (pgvector).

  find_duplicates(argument_uri) — nearest arguments in the SAME ballot + language
                                  as the given argument (duplicate check).
  search(q)                     — embed a free-text query live, return nearest
                                  arguments (semantic search).
"""

from __future__ import annotations

import logging

from src import config
from src.core.db import get_pool
from src.core.languages import DEFAULT_LANGUAGE, normalize_lang
from src.embedding import infomaniak_client as ic
from src.embedding.text import vec_to_pg

logger = logging.getLogger("calculator.embedding.similarity")

# Query vector = the stored embedding of the given argument in `lang`; compare
# against all other arguments in the same ballot + language.
_DUP_SQL = """
WITH q AS (
    SELECT embedding, scope_rkey, lang FROM app_embeddings
    WHERE subject_type = 'argument' AND subject_ref = $1 AND lang = $2
)
SELECT a.uri, a.title, 1 - (e.embedding <=> q.embedding) AS similarity
FROM app_embeddings e
JOIN q ON e.scope_rkey = q.scope_rkey AND e.lang = q.lang
JOIN app_arguments a ON a.uri = e.subject_ref
WHERE e.subject_type = 'argument'
  AND e.subject_ref <> $1
  AND a.deleted = false
ORDER BY e.embedding <=> q.embedding
LIMIT $3
"""

_SEARCH_SQL = """
SELECT a.uri, a.title, 1 - (e.embedding <=> $1::vector) AS similarity
FROM app_embeddings e
JOIN app_arguments a ON a.uri = e.subject_ref
WHERE e.subject_type = 'argument'
  AND e.lang = $2
  AND a.deleted = false
  AND ($3::text IS NULL OR e.scope_rkey = $3)
ORDER BY e.embedding <=> $1::vector
LIMIT $4
"""


async def find_duplicates(argument_uri: str, *, lang: str | None = None,
                          limit: int = 5, threshold: float | None = None) -> list[dict]:
    lang = normalize_lang(lang) or DEFAULT_LANGUAGE
    threshold = config.DEDUP_SIM_THRESHOLD if threshold is None else threshold
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_DUP_SQL, argument_uri, lang, limit)
    return [
        {"uri": r["uri"], "title": r["title"], "similarity": float(r["similarity"])}
        for r in rows if float(r["similarity"]) >= threshold
    ]


async def search(q: str, *, lang: str | None = None, ballot_rkey: str | None = None,
                 limit: int = 20) -> list[dict]:
    lang = normalize_lang(lang) or DEFAULT_LANGUAGE
    vecs = await ic.embed_texts([q])
    qvec = vec_to_pg(vecs[0])
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SEARCH_SQL, qvec, lang, ballot_rkey, limit)
    return [
        {"uri": r["uri"], "title": r["title"], "similarity": float(r["similarity"])}
        for r in rows
    ]


# Duplikat-Check beim Verfassen: embeddet den Draft (title+body) und liefert die
# ähnlichsten Argumente DERSELBEN Vorlage + Sprache, inkl. Position (type) und
# body für die Anzeige. Gefiltert auf >= threshold (Anzeige-Schwelle, kein LLM).
_SIMILAR_SQL = """
SELECT a.uri, a.title, a.body, a.type, 1 - (e.embedding <=> $1::vector) AS similarity
FROM app_embeddings e
JOIN app_arguments a ON a.uri = e.subject_ref
WHERE e.subject_type = 'argument'
  AND e.scope_rkey = $2
  AND e.lang = $3
  AND a.deleted = false
  AND ($4::text IS NULL OR a.type = $4)
ORDER BY e.embedding <=> $1::vector
LIMIT $5
"""


async def similar_arguments(ballot_rkey: str, title: str, body: str, *,
                            lang: str | None = None, stance: str | None = None,
                            limit: int = 1, threshold: float | None = None) -> list[dict]:
    lang = normalize_lang(lang) or DEFAULT_LANGUAGE
    threshold = config.DEDUP_SIM_THRESHOLD if threshold is None else threshold
    # Nur gleichgesinnte Argumente vergleichen (PRO↔PRO / CONTRA↔CONTRA) —
    # löst den Gegenargument-Confound (gleiches Thema, andere Position ≠ Duplikat).
    stance = stance.upper() if isinstance(stance, str) else None
    if stance not in ("PRO", "CONTRA"):
        stance = None
    text = f"{(title or '').strip()}\n\n{(body or '').strip()}".strip()
    if not text:
        return []
    vecs = await ic.embed_texts([text])
    qvec = vec_to_pg(vecs[0])
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(_SIMILAR_SQL, qvec, ballot_rkey, lang, stance, limit)
    return [
        {"uri": r["uri"], "title": r["title"], "body": r["body"],
         "type": r["type"], "similarity": float(r["similarity"])}
        for r in rows if float(r["similarity"]) >= threshold
    ]
