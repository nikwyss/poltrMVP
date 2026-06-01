"""
Background translation worker (skeleton).

Polls app_arguments / app_comments for records whose translation_status is
'pending' or 'partial', figures out which SUPPORTED_LANGUAGES are still
missing, and (eventually) calls an LLM to produce translations. The
translation result is then written back to the PDS via `putRecord` on the
governance account so the firehose carries the update into the indexer.

This iteration is a STUB: the LLM call is a TODO. Everything around it —
DB queries, batching, governance-session loading, PDS write path, status
flips — is wired so the loop is testable end-to-end with manual stubs.

Controlled by APPVIEW_TRANSLATE_ENABLED (checked each iteration).
Pattern mirrors src/arguments/peer_review.py.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

from src.atproto.governance import (
    create_governance_record,
    get_did_for_ballot,
    put_governance_record,
)
from src.core.db import get_pool
from src.core.languages import (
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    SUPPORTED_LANGUAGES_SET,
)

logger = logging.getLogger("translator")

_task: Optional[asyncio.Task] = None

ARGUMENT_NSID = "app.ch.poltr.ballot.argument"
COMMENT_TRANSLATION_NSID = "app.ch.poltr.comment.translation"


def _batch_size() -> int:
    return int(os.getenv("APPVIEW_TRANSLATE_BATCH_SIZE", "20"))


def _poll_interval() -> int:
    return int(os.getenv("APPVIEW_TRANSLATE_POLL_INTERVAL_SECONDS", "30"))


def _model_name() -> str:
    return os.getenv("APPVIEW_TRANSLATE_MODEL", "claude-haiku-4-5")


# -----------------------------------------------------------------------------
# Missing-language detection
# -----------------------------------------------------------------------------


def _missing_languages(langs: list, translations: list) -> list[str]:
    """Return the SUPPORTED_LANGUAGES that are neither in `langs` (original)
    nor in `translations[*].lang`. Dynamic — adding a language to
    SUPPORTED_LANGUAGES makes previously-complete records show up here on
    the next reindex."""
    covered: set[str] = set()
    for l in langs or []:
        if isinstance(l, str):
            covered.add(l)
    for t in translations or []:
        if isinstance(t, dict):
            l = t.get("lang")
            if isinstance(l, str):
                covered.add(l)
    return [l for l in SUPPORTED_LANGUAGES if l not in covered]


def _parse_translations(value) -> list:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (TypeError, ValueError):
            return []
    return value if isinstance(value, list) else []


# -----------------------------------------------------------------------------
# LLM call (TODO: actual Anthropic SDK integration)
# -----------------------------------------------------------------------------


async def _translate_via_llm(
    *,
    source_lang: str,
    target_lang: str,
    title: str,
    body: str,
) -> Optional[dict]:
    """Translate (title, body) from source_lang to target_lang via the LLM.

    Returns a dict {title, body, source: 'ai', model, translatedAt} or None on
    failure / when AI is not yet wired up.

    TODO: integrate Anthropic SDK (`anthropic` package, `claude-haiku-4-5` with
    prompt caching). For now this is intentionally a stub so the surrounding
    pipeline (DB → worker → PDS → indexer → DB) is testable end-to-end with
    manual "fake" translations injected via SQL.
    """
    logger.info(
        f"[translator stub] would translate {source_lang}->{target_lang}: {title[:40]!r}"
    )
    return None  # AI not yet wired up — caller skips.


# -----------------------------------------------------------------------------
# Pipeline helpers
# -----------------------------------------------------------------------------


async def _publish_translations(
    client: httpx.AsyncClient,
    *,
    gov_did: str,
    collection: str,
    rkey: str,
    existing_record: dict,
    new_translations: list[dict],
) -> None:
    """Merge new translations into the record and write it back via putRecord.

    `existing_record` is the full PDS record (as last seen) plus the new
    translations appended/merged. Same governance credentials used elsewhere
    in the codebase (see services/appview/src/atproto/governance.py).
    """
    existing_tx = existing_record.get("translations") or []
    by_lang: dict[str, dict] = {}
    for t in existing_tx:
        if isinstance(t, dict) and isinstance(t.get("lang"), str):
            by_lang[t["lang"]] = t
    for t in new_translations:
        by_lang[t["lang"]] = t

    merged_record = dict(existing_record)
    merged_record["translations"] = list(by_lang.values())

    await put_governance_record(client, gov_did, collection, rkey, merged_record)


async def _process_argument(
    client: httpx.AsyncClient,
    pool,
    row: dict,
) -> None:
    """Plan translations for a single argument row and (when wired up) write
    them back to the PDS. The DB is not updated directly here — the firehose
    + indexer path re-syncs the row when the PDS write lands."""
    uri = row["uri"]
    gov_did = row["did"]
    rkey = row["rkey"]
    langs = row["langs"] or [DEFAULT_LANGUAGE]
    translations = _parse_translations(row.get("translations"))
    missing = _missing_languages(langs, translations)
    if not missing:
        return  # nothing to do

    source_lang = langs[0] if langs else DEFAULT_LANGUAGE
    new_tx: list[dict] = []
    for target in missing:
        translated = await _translate_via_llm(
            source_lang=source_lang,
            target_lang=target,
            title=row["title"] or "",
            body=row["body"] or "",
        )
        if translated is None:
            continue
        new_tx.append(
            {
                "lang": target,
                "title": translated["title"],
                "body": translated["body"],
                "source": "ai",
                "model": _model_name(),
                "translatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )

    if not new_tx:
        # LLM stub hasn't produced anything yet — skip the PDS write so we
        # don't churn putRecord with the same content every poll. The record
        # stays at translation_status='pending' until the LLM is wired up.
        return

    existing_record = {
        "$type": ARGUMENT_NSID,
        "title": row["title"],
        "body": row["body"],
        "type": row["type"],
        "ballot": row["ballot_uri"],
        "langs": langs,
        "createdAt": row["created_at"].isoformat() if row.get("created_at") else None,
        "translations": translations,
    }
    existing_record = {k: v for k, v in existing_record.items() if v is not None}

    await _publish_translations(
        client,
        gov_did=gov_did,
        collection=ARGUMENT_NSID,
        rkey=rkey,
        existing_record=existing_record,
        new_translations=new_tx,
    )
    logger.info(f"translator: wrote {len(new_tx)} translation(s) for {uri}")


async def _process_batch() -> None:
    """Process both inline-translation (Arguments) and sidecar (Comments) paths.

    Arguments use putRecord on the governance-owned argument record (inline
    translations[]). Comments live in foreign repos — we publish sidecar
    translation records into the ballot's governance account instead. The two
    paths share the httpx client and the LLM stub but use different PDS write
    primitives.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        await _process_arguments_batch(client)
        await _process_comments_batch(client)


async def _process_arguments_batch(client: httpx.AsyncClient) -> None:
    pool = await get_pool()
    batch = _batch_size()

    async with pool.acquire() as conn:
        arg_rows = await conn.fetch(
            """
            SELECT uri, did, rkey, title, body, type, ballot_uri, created_at,
                   langs, translations, translation_status
            FROM app_arguments
            WHERE translation_status IN ('pending', 'partial')
              AND NOT deleted
            ORDER BY indexed_at ASC
            LIMIT $1
            """,
            batch,
        )

    if not arg_rows:
        logger.debug("translator: no arguments pending")
        return

    for r in arg_rows:
        try:
            await _process_argument(client, pool, dict(r))
        except Exception as err:
            logger.error(f"translator: failed for argument {r['uri']}: {err}")


async def _process_comments_batch(client: httpx.AsyncClient) -> None:
    """Sidecar variant: comments are not rewritten (foreign repos), instead
    we publish app.ch.poltr.comment.translation records into the governance
    account of the comment's ballot."""
    pool = await get_pool()
    batch = _batch_size()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT uri, rkey, did, text, ballot_rkey, langs
            FROM app_comments
            WHERE translation_status IN ('pending', 'partial')
              AND NOT deleted
            ORDER BY indexed_at ASC
            LIMIT $1
            """,
            batch,
        )

    if not rows:
        logger.debug("translator: no comments pending")
        return

    for r in rows:
        try:
            await _process_comment(client, pool, dict(r))
        except Exception as err:
            logger.error(f"translator: failed for comment {r['uri']}: {err}")


async def _process_comment(client: httpx.AsyncClient, pool, row: dict) -> None:
    """Plan + (when wired up) write sidecar translations for a single comment."""
    comment_uri = row["uri"]
    comment_rkey = row["rkey"]
    ballot_rkey = row.get("ballot_rkey")
    origin_langs = row["langs"] or [DEFAULT_LANGUAGE]
    body = row.get("text") or ""

    # Existing sidecars (which languages are already covered).
    async with pool.acquire() as conn:
        existing = await conn.fetch(
            """
            SELECT lang FROM app_comment_translations
            WHERE subject_uri = $1 AND NOT deleted
            """,
            comment_uri,
        )
    existing_langs = {r["lang"] for r in existing}

    missing = _missing_languages(origin_langs, [{"lang": l} for l in existing_langs])
    if not missing:
        return

    if not ballot_rkey:
        logger.warning(
            f"translator: comment {comment_uri} has no ballot_rkey, skipping"
        )
        return

    gov_did = await get_did_for_ballot(ballot_rkey)
    if not gov_did:
        logger.warning(
            f"translator: no governance account for ballot {ballot_rkey} (comment {comment_uri})"
        )
        return

    source_lang = origin_langs[0] if origin_langs else DEFAULT_LANGUAGE
    now_iso = datetime.now(timezone.utc).isoformat()

    for target_lang in missing:
        translated = await _translate_via_llm(
            source_lang=source_lang,
            target_lang=target_lang,
            title="",
            body=body,
        )
        if translated is None:
            continue

        sidecar_record = {
            "$type": COMMENT_TRANSLATION_NSID,
            "subject": {"uri": comment_uri},
            "ballot": str(ballot_rkey),
            "lang": target_lang,
            "body": translated["body"],
            "source": "ai",
            "model": _model_name(),
            "translatedAt": now_iso,
        }
        rkey = f"{comment_rkey}-{target_lang}"

        # Use put_governance_record (idempotent overwrite at the composed rkey).
        # If the rkey already exists from a previous partial run, putRecord
        # replaces it cleanly; if not, putRecord creates it.
        await put_governance_record(
            client, gov_did, COMMENT_TRANSLATION_NSID, rkey, sidecar_record
        )

    # No direct DB write — firehose → indexer recomputes translation_status
    # via the new app.ch.poltr.comment.translation handler.


# -----------------------------------------------------------------------------
# Poll loop
# -----------------------------------------------------------------------------


async def _poll_loop() -> None:
    logger.info("Translation poll loop started")
    while True:
        interval = _poll_interval()
        if os.getenv("APPVIEW_TRANSLATE_ENABLED", "false").lower() != "true":
            logger.debug("translator disabled, sleeping")
            await asyncio.sleep(interval)
            continue
        try:
            await _process_batch()
        except Exception as err:
            logger.error(f"translator poll error: {err}")
        await asyncio.sleep(interval)


def start_translation_loop() -> None:
    """Start the translation background task (idempotent)."""
    global _task
    if _task is not None:
        return
    _task = asyncio.get_event_loop().create_task(_poll_loop())
    logger.info("Translation background task scheduled")


def stop_translation_loop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
        logger.info("Translation background task cancelled")
