"""
Embedding backfill: compute + store vectors for arguments and taxonomy nodes
that lack an up-to-date embedding.

Two throttle levels (see doc/LM_PEER_REVIEW.md):
  1. per cron run: at most EMBEDDING_RUN_LIMIT candidates per source query.
  2. per API call: texts are chunked to EMBEDDING_BATCH_SIZE inside embed_texts.

Idempotent via content_hash (re-embed only when the embedded text — or the
model/dimension — changes). One vector per (subject, SUPPORTED_LANGUAGE).
"""

from __future__ import annotations

import logging

from src import config
from src.core.db import get_pool
from src.core.languages import SUPPORTED_LANGUAGES
from src.embedding import infomaniak_client as ic
from src.embedding.text import content_hash, texts_by_lang, vec_to_pg

logger = logging.getLogger("calculator.embedding.backfill")

ARGUMENT = "argument"
TAXONOMY_NODE = "taxonomy_node"

_UPSERT = """
INSERT INTO app_embeddings
    (subject_type, subject_ref, lang, scope_rkey, model, embedding, content_hash, generated_at)
VALUES ($1, $2, $3, $4, $5, $6::vector, $7, now())
ON CONFLICT (subject_type, subject_ref, lang) DO UPDATE SET
    scope_rkey   = EXCLUDED.scope_rkey,
    model        = EXCLUDED.model,
    embedding    = EXCLUDED.embedding,
    content_hash = EXCLUDED.content_hash,
    generated_at = now()
"""


async def _existing_hashes(conn, subject_type: str, refs: list[str]) -> dict:
    if not refs:
        return {}
    rows = await conn.fetch(
        "SELECT subject_ref, lang, content_hash FROM app_embeddings "
        "WHERE subject_type = $1 AND subject_ref = ANY($2::text[])",
        subject_type, refs)
    return {(r["subject_ref"], r["lang"]): r["content_hash"] for r in rows}


def _plan(subject_type, ref, scope_rkey, by_lang, existing) -> list[tuple]:
    """(subject_type, ref, lang, scope_rkey, text, hash) for langs needing (re)embed."""
    work = []
    for lang in SUPPORTED_LANGUAGES:
        text = by_lang.get(lang)
        if not text:
            continue  # no text in this language yet (translator fills it later)
        h = content_hash(config.EMBEDDING_MODEL, config.EMBEDDING_DIMENSIONS, text)
        if existing.get((ref, lang)) == h:
            continue  # up to date
        work.append((subject_type, ref, lang, scope_rkey, text, h))
    return work


async def _collect_arguments(conn) -> list[tuple]:
    rows = await conn.fetch(
        "SELECT uri, ballot_rkey, langs, translations, title, body "
        "FROM app_arguments WHERE NOT deleted "
        "ORDER BY indexed_at ASC LIMIT $1",
        config.EMBEDDING_RUN_LIMIT)
    existing = await _existing_hashes(conn, ARGUMENT, [r["uri"] for r in rows])
    work: list[tuple] = []
    for r in rows:
        by_lang = texts_by_lang(r["langs"], r["translations"],
                                r["title"], r["body"], "title", "body")
        work += _plan(ARGUMENT, r["uri"], r["ballot_rkey"], by_lang, existing)
    return work


async def _collect_taxonomy(conn) -> list[tuple]:
    rows = await conn.fetch(
        "SELECT id, ballot_rkey, langs, translations, name, introduction "
        "FROM app_taxonomy_node "
        "ORDER BY id ASC LIMIT $1",
        config.EMBEDDING_RUN_LIMIT)
    existing = await _existing_hashes(conn, TAXONOMY_NODE, [str(r["id"]) for r in rows])
    work: list[tuple] = []
    for r in rows:
        by_lang = texts_by_lang(r["langs"], r["translations"],
                                r["name"], r["introduction"], "name", "introduction")
        work += _plan(TAXONOMY_NODE, str(r["id"]), r["ballot_rkey"], by_lang, existing)
    return work


async def run_backfill() -> dict:
    """One backfill pass. Returns {"processed": <n (subject,lang) pairs>}."""
    if not ic.is_configured():
        logger.warning("embedding backfill: not configured — skipping")
        return {"processed": 0, "configured": False}

    pool = await get_pool()
    async with pool.acquire() as conn:
        work = await _collect_arguments(conn) + await _collect_taxonomy(conn)

    if not work:
        return {"processed": 0}

    vecs = await ic.embed_texts([w[4] for w in work])

    async with pool.acquire() as conn:
        async with conn.transaction():
            for (stype, ref, lang, scope, _text, h), vec in zip(work, vecs):
                await conn.execute(
                    _UPSERT, stype, ref, lang, scope,
                    config.EMBEDDING_MODEL, vec_to_pg(vec), h)

    logger.info("embedding backfill: processed %d (subject,lang) pairs", len(work))
    return {"processed": len(work)}
