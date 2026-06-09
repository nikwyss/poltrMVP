"""
Background translation worker (skeleton).

Polls app_arguments / app_comments for records whose translation_status is
'pending' or 'partial', figures out which SUPPORTED_LANGUAGES are still
missing, and (eventually) calls an LLM to produce translations. The
translation result is then written back to the PDS via `putRecord` on the
governance account so the firehose carries the update into the indexer.

The LLM call goes to Infomaniak AI Tools (Swiss-hosted, OpenAI-compatible
chat completions) using the Swiss open model Apertus by default — same
provider as the Calculator embeddings, chosen for data sovereignty. See
doc/infomaniak.md for the API quirks (no forced tool-use → JSON via prompt).

Controlled by APPVIEW_TRANSLATE_ENABLED (checked each iteration).
Asyncio poll-loop pattern (background task started in core/fastapi.py).
"""

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

import httpx

from src.atproto.governance import (
    get_did_for_ballot,
    get_governance_record,
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

# Circuit breaker. By the time a PDS write (putRecord) fails, the translation
# has already cost an LLM call. Retrying every poll would re-pay that call
# indefinitely, so instead we trip this breaker and stop the worker after a
# single failure. Stays tripped until appview restarts (a human is expected to
# fix the root cause first). TODO: send an email alert when it trips.
_halted: bool = False
_halt_reason: str = ""


class TranslatePersistError(Exception):
    """A PDS write failed *after* a translation was produced. Raised to trip the
    circuit breaker instead of retrying (which would re-incur LLM cost)."""


def _batch_size() -> int:
    return int(os.getenv("APPVIEW_TRANSLATE_BATCH_SIZE", "20"))


def _poll_interval() -> int:
    return int(os.getenv("APPVIEW_TRANSLATE_POLL_INTERVAL_SECONDS", "30"))


def _comments_enabled() -> bool:
    """Whether to translate comments too. Off by default: comments are
    high-volume, so keeping them off saves tokens while only arguments are
    translated. Set APPVIEW_TRANSLATE_COMMENTS_ENABLED=true to include them."""
    return os.getenv("APPVIEW_TRANSLATE_COMMENTS_ENABLED", "false").lower() == "true"


def _model_name() -> str:
    return os.getenv("APPVIEW_TRANSLATE_MODEL", "swiss-ai/Apertus-70B-Instruct-2509")


def _base_url() -> str:
    return os.getenv("APPVIEW_TRANSLATE_BASE_URL", "https://api.infomaniak.com").rstrip(
        "/"
    )


def _product_id() -> str:
    return os.getenv("APPVIEW_TRANSLATE_PRODUCT_ID", "").strip()


def _api_key() -> str:
    return os.getenv("APPVIEW_TRANSLATE_API_KEY", "").strip()


def _chat_url() -> str:
    return f"{_base_url()}/2/ai/{_product_id()}/openai/v1/chat/completions"


# Human-readable language names for the translation prompt. Keyed by our
# canonical region-flavoured locales — the region nuance (Swiss usage, British
# spelling) is meaningful instruction for the model. Bare-subtag fallbacks below.
_LANG_NAMES = {
    "de-CH": "Swiss Standard German (Hochdeutsch as written in Switzerland — use 'ss', never the letter 'ß')",
    "fr-CH": "French (Swiss usage and conventions)",
    "it-CH": "Italian (Swiss usage and conventions)",
    "rm": "Romansh (Rumantsch Grischun)",
    "en-GB": "British English (British spelling: colour, organise, …)",
    # Bare-subtag fallbacks if POLTR_LANGUAGES is configured without regions.
    "de": "German",
    "fr": "French",
    "it": "Italian",
    "en": "English",
}


def _lang_name(code: str) -> str:
    return _LANG_NAMES.get(code) or _LANG_NAMES.get(code.split("-", 1)[0], code)


# Transient gateway statuses worth retrying (see doc/infomaniak.md).
_TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504})
_BACKOFFS = (1, 2, 4)  # seconds; len => number of retries after the first try

# Strip ```json fences Apertus/Gemma sometimes wrap the JSON in.
_FENCE_RE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)


def _extract_json_object(content: str) -> dict:
    """Pull the first {...} object out of a chat completion, tolerating fences
    and surrounding prose. Raises ValueError if no object is found."""
    txt = _FENCE_RE.sub("", content).strip()
    start, end = txt.find("{"), txt.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"no JSON object in LLM response: {content[:120]!r}")
    obj = json.loads(txt[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError("LLM response is not a JSON object")
    return obj


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
# LLM call — Infomaniak AI Tools (OpenAI-compatible), Apertus by default
# -----------------------------------------------------------------------------


def _build_messages(src: str, tgt: str, title: str, body: str) -> list[dict]:
    system = (
        "You are a professional translator for a Swiss civic-participation "
        "platform where citizens debate referendum arguments. Translate the "
        f"user's text from {src} to {tgt}. Preserve the exact meaning, tone and "
        "every factual claim — do not summarise, soften, censor or add any "
        "commentary of your own. Keep the title concise. Reply with ONLY a "
        'single JSON object of the exact form {"title": "...", "body": "..."} '
        "and nothing else. If the input has an empty title, return an empty "
        'string for "title".'
    )
    user = f"TITLE: {title}\nBODY: {body}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def _translate_via_llm(
    client: httpx.AsyncClient,
    *,
    source_lang: str,
    target_lang: str,
    title: str,
    body: str,
) -> Optional[dict]:
    """Translate (title, body) from source_lang to target_lang via Infomaniak.

    Returns {title, body, source: 'ai', model, translatedAt} or None on failure
    (missing config, exhausted retries, or unparsable response). Transient
    gateway errors are retried with 1/2/4s backoff; permanent errors (400/401)
    fail fast — no silent fallback to another provider (see doc/infomaniak.md).
    """
    api_key, product_id = _api_key(), _product_id()
    if not api_key or not product_id:
        logger.warning(
            "translator: APPVIEW_TRANSLATE_API_KEY / _PRODUCT_ID not set — skipping"
        )
        return None

    payload = {
        "model": _model_name(),
        "messages": _build_messages(
            _lang_name(source_lang), _lang_name(target_lang), title, body
        ),
        "max_tokens": 2000,
        "temperature": 0.1,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    last_err: object = None
    for attempt in range(len(_BACKOFFS) + 1):
        try:
            resp = await client.post(_chat_url(), json=payload, headers=headers)
            if resp.status_code in _TRANSIENT_STATUS:
                last_err = f"HTTP {resp.status_code}"
            else:
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                obj = _extract_json_object(content)
                out_title = (
                    obj.get("title") if isinstance(obj.get("title"), str) else ""
                )
                out_body = obj.get("body") if isinstance(obj.get("body"), str) else ""
                if not out_body.strip():
                    raise ValueError("empty body in translation response")
                return {
                    "title": out_title,
                    "body": out_body,
                    "source": "ai",
                    "model": _model_name(),
                    "translatedAt": datetime.now(timezone.utc).isoformat(),
                }
        except httpx.HTTPStatusError as err:
            # Permanent (4xx other than the transient set) — do not retry.
            logger.error(
                f"translator: LLM {source_lang}->{target_lang} permanent error: {err}"
            )
            return None
        except Exception as err:  # network hiccup or unparsable body — retry
            last_err = err

        if attempt < len(_BACKOFFS):
            await asyncio.sleep(_BACKOFFS[attempt])

    logger.error(
        f"translator: LLM {source_lang}->{target_lang} failed after retries: {last_err}"
    )
    return None


# -----------------------------------------------------------------------------
# Pipeline helpers
# -----------------------------------------------------------------------------


async def _persist_record(
    client: httpx.AsyncClient, did: str, collection: str, rkey: str, record: dict
) -> None:
    """putRecord, converting any failure into TranslatePersistError so the poll
    loop trips the circuit breaker instead of re-translating next cycle."""
    try:
        await put_governance_record(client, did, collection, rkey, record)
    except Exception as err:
        raise TranslatePersistError(
            f"putRecord {collection}/{rkey} on {did} failed: {err}"
        ) from err


def _source_union_from_row(row: dict) -> Optional[dict]:
    """Rebuild the argument `source` union from the DB's flat source_* columns.

    Mirrors the indexer's parseArgumentSource in reverse. Used to repair records
    whose `source` was dropped by an earlier worker run (which violated the
    app_arguments_source_consistency CHECK). Returns None when a valid union
    can't be built (e.g. a 'user' record with no author_did)."""
    st = row.get("source_type") or "user"
    if st == "user":
        author = row.get("author_did")
        if not author:
            return None
        return {"$type": f"{ARGUMENT_NSID}#sourceUser", "authorDid": author}
    if st == "official":
        src = {"$type": f"{ARGUMENT_NSID}#sourceOfficial"}
        if row.get("source_doc_ref"):
            src["documentRef"] = row["source_doc_ref"]
        if row.get("source_section"):
            src["section"] = row["source_section"]
        return src
    if st == "organization":
        src = {"$type": f"{ARGUMENT_NSID}#sourceOrganization"}
        if row.get("source_org_key"):
            src["orgKey"] = row["source_org_key"]
        if row.get("source_doc_ref"):
            src["documentRef"] = row["source_doc_ref"]
        if row.get("source_verified_did"):
            src["verifiedDid"] = row["source_verified_did"]
        return src
    return None


async def _process_argument(
    client: httpx.AsyncClient,
    pool,
    row: dict,
) -> None:
    """Read-modify-write a single argument record on the PDS.

    We fetch the *live* record (getRecord), merge new translations into its
    existing `translations[]`, and write the whole thing back — never rebuild it
    from DB columns (that dropped `source`/`ballot`/`createdAt`). If the live
    record is missing `source` (corrupted by an earlier reconstruction run), we
    graft it back from the DB so the indexer's source-consistency CHECK passes.
    The DB is not touched directly — firehose + indexer re-sync the row."""
    uri = row["uri"]
    gov_did = row["did"]
    rkey = row["rkey"]

    record = await get_governance_record(client, gov_did, ARGUMENT_NSID, rkey)
    if record is None:
        logger.warning(f"translator: record not on PDS, skipping {uri}")
        return

    # Repair a dropped source union from the DB (still holds author_did etc.).
    repaired = False
    if not isinstance(record.get("source"), dict):
        src = _source_union_from_row(row)
        if src is None:
            logger.warning(f"translator: cannot rebuild source for {uri}, skipping")
            return
        record["source"] = src
        repaired = True

    langs = record.get("langs") or row["langs"] or [DEFAULT_LANGUAGE]
    by_lang: dict[str, dict] = {
        t["lang"]: t
        for t in _parse_translations(record.get("translations"))
        if isinstance(t, dict) and isinstance(t.get("lang"), str)
    }
    missing = _missing_languages(langs, list(by_lang.values()))

    source_lang = langs[0] if langs else DEFAULT_LANGUAGE
    added = 0
    for target in missing:
        translated = await _translate_via_llm(
            client,
            source_lang=source_lang,
            target_lang=target,
            title=record.get("title") or "",
            body=record.get("body") or "",
        )
        if translated is None:
            continue  # transient/permanent failure — try again next poll
        by_lang[target] = {
            "lang": target,
            "title": translated["title"],
            "body": translated["body"],
            "source": "ai",
            "model": _model_name(),
            "translatedAt": datetime.now(timezone.utc).isoformat(),
        }
        added += 1

    if added == 0 and not repaired:
        # Nothing new and nothing to fix → don't churn putRecord.
        return

    record["translations"] = list(by_lang.values())
    await _persist_record(client, gov_did, ARGUMENT_NSID, rkey, record)
    logger.info(
        "translator: wrote %d translation(s)%s for %s",
        added,
        " + repaired source" if repaired else "",
        uri,
    )


async def _process_batch() -> None:
    """Process both inline-translation (Arguments) and sidecar (Comments) paths.

    Arguments use putRecord on the governance-owned argument record (inline
    translations[]). Comments live in foreign repos — we publish sidecar
    translation records into the ballot's governance account instead. The two
    paths share the httpx client but use different PDS write primitives.

    The comment path is gated behind APPVIEW_TRANSLATE_COMMENTS_ENABLED (off by
    default) — comments are high-volume, so we translate only arguments unless
    explicitly opted in.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        await _process_arguments_batch(client)
        if _comments_enabled():
            await _process_comments_batch(client)


async def _process_arguments_batch(client: httpx.AsyncClient) -> None:
    pool = await get_pool()
    batch = _batch_size()

    async with pool.acquire() as conn:
        arg_rows = await conn.fetch(
            """
            SELECT uri, did, rkey, title, body, type, ballot_uri, created_at,
                   langs, translations, translation_status,
                   source_type, author_did, source_org_key, source_doc_ref,
                   source_section, source_verified_did
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
        except TranslatePersistError:
            raise  # trip the circuit breaker (handled in the poll loop)
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
        except TranslatePersistError:
            raise  # trip the circuit breaker (handled in the poll loop)
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
            client,
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

        # Idempotent overwrite at the composed rkey (create or replace).
        # Guarded so a write failure trips the circuit breaker.
        await _persist_record(
            client, gov_did, COMMENT_TRANSLATION_NSID, rkey, sidecar_record
        )

    # No direct DB write — firehose → indexer recomputes translation_status
    # via the new app.ch.poltr.comment.translation handler.


# -----------------------------------------------------------------------------
# Poll loop
# -----------------------------------------------------------------------------


async def _poll_loop() -> None:
    global _halted, _halt_reason
    logger.info("Translation poll loop started")
    while True:
        interval = _poll_interval()
        if os.getenv("APPVIEW_TRANSLATE_ENABLED", "false").lower() != "true":
            logger.debug("translator disabled, sleeping")
            await asyncio.sleep(interval)
            continue
        if _halted:
            logger.warning(
                "translator HALTED (%s) — skipping until appview restart", _halt_reason
            )
            await asyncio.sleep(interval)
            continue
        try:
            await _process_batch()
        except TranslatePersistError as err:
            _halted = True
            _halt_reason = str(err)
            logger.error(
                "TRANSLATOR CIRCUIT BREAKER TRIPPED — PDS write failed, halting to "
                "avoid repeated LLM spend: %s. Fix the root cause and restart "
                "appview to resume. TODO: email alert here.",
                err,
            )
            # TODO: send_email_alert(_halt_reason)
        except Exception as err:
            logger.error(f"translator poll error: {err}")
        await asyncio.sleep(interval)


def start_translation_loop() -> None:
    """Start the translation background task (idempotent). Resets the circuit
    breaker so a fresh start (e.g. after restart) resumes processing."""
    global _task, _halted, _halt_reason
    if _task is not None:
        return
    _halted = False
    _halt_reason = ""
    _task = asyncio.get_event_loop().create_task(_poll_loop())
    logger.info("Translation background task scheduled")


def stop_translation_loop() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
        logger.info("Translation background task cancelled")
