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
doc/infomaniak.md for the API quirks (no forced tool-use). Output is requested
in a plain TITLE:/BODY: shape — robust against the model's occasional malformed
JSON on long bodies; the parser still accepts JSON as a fallback.

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
from src.shared.db import get_pool
from src.shared.languages import (
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    SUPPORTED_LANGUAGES_SET,
    normalize_lang,
)

logger = logging.getLogger("translator")

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


def _topics_enabled() -> bool:
    """Whether to translate taxonomy topic nodes. On by default — the taxonomy
    is low-volume (a few dozen nodes per ballot). Set
    APPVIEW_TRANSLATE_TOPICS_ENABLED=false to disable."""
    return os.getenv("APPVIEW_TRANSLATE_TOPICS_ENABLED", "true").lower() == "true"


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
    # strict=False tolerates raw control chars (literal newlines/tabs) inside
    # string values — the model often emits multi-paragraph bodies with real
    # newlines instead of \n escapes, which strict JSON would reject.
    obj = json.loads(txt[start : end + 1], strict=False)
    if not isinstance(obj, dict):
        raise ValueError("LLM response is not a JSON object")
    return obj


# Fallback shape: Apertus sometimes ignores the JSON instruction and echoes the
# prompt's plain 'TITLE: …\nBODY: …' structure instead.
_TITLE_BODY_RE = re.compile(
    r"TITLE:\s*(?P<title>.*?)\s*BODY:\s*(?P<body>.*)", re.IGNORECASE | re.DOTALL
)


def _extract_title_body(content: str) -> tuple[str, str]:
    """Pull (title, body) from a completion — JSON {title,body} or the plain
    'TITLE: …/BODY: …' shape the model sometimes returns. Returns possibly-empty
    strings; raises ValueError only if neither format is recognisable at all
    (so callers decide which fields are required)."""
    title, body, found = "", "", False
    try:
        obj = _extract_json_object(content)
        found = True
        if isinstance(obj.get("title"), str):
            title = obj["title"]
        if isinstance(obj.get("body"), str):
            body = obj["body"]
    except ValueError:
        pass  # not (complete) JSON — try the plain-text fallback below

    if not (title.strip() or body.strip()):
        m = _TITLE_BODY_RE.search(content)
        if m:
            found = True
            title, body = m.group("title").strip(), m.group("body").strip()

    if not found:
        raise ValueError(f"unrecognised LLM response: {content[:120]!r}")
    return title, body


def _parse_translation_response(content: str) -> dict:
    """Argument/comment parse: requires a non-empty body."""
    title, body = _extract_title_body(content)
    if not body.strip():
        raise ValueError(f"no translation in LLM response: {content[:120]!r}")
    return {"title": title, "body": body}


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


def _derive_status(langs: list, translations: list) -> str:
    """Mirror the indexer's deriveTranslationStatus (db.js) in Python — used for
    direct-to-DB writes (taxonomy), which don't go through the firehose/indexer.

      pending     : only original language(s)
      partial     : some translations but not all SUPPORTED covered
      complete    : every SUPPORTED code is original or translated
      manual_only : complete and every translation is source='manual'
    """
    covered = set(l for l in (langs or []) if isinstance(l, str))
    tx = [t for t in (translations or []) if isinstance(t, dict)]
    covered.update(t.get("lang") for t in tx if isinstance(t.get("lang"), str))
    if all(l in covered for l in SUPPORTED_LANGUAGES):
        all_manual = bool(tx) and all(t.get("source") == "manual" for t in tx)
        return "manual_only" if all_manual else "complete"
    return "partial" if tx else "pending"


# -----------------------------------------------------------------------------
# LLM call — Infomaniak AI Tools (OpenAI-compatible), Apertus by default
# -----------------------------------------------------------------------------


def _build_messages(src: str, tgt: str, title: str, body: str) -> list[dict]:
    system = (
        "You are a professional translator for a Swiss civic-participation "
        "platform where citizens debate referendum arguments. Translate the "
        f"user's text from {src} to {tgt}. Preserve the exact meaning, tone and "
        "every factual claim — do not summarise, soften, censor or add any "
        "commentary of your own. Keep the title concise.\n\n"
        "Reply in EXACTLY this format and nothing else — no JSON, no code "
        "fences, no extra lines before or after:\n"
        "TITLE: <translated title>\n"
        "BODY: <translated body>\n"
        "If the input title is empty, write 'TITLE:' with nothing after it. The "
        "body may span multiple lines/paragraphs."
    )
    user = f"TITLE: {title}\nBODY: {body}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def _chat_completion(
    client: httpx.AsyncClient, messages: list[dict], *, label: str
) -> Optional[str]:
    """POST a chat completion to Infomaniak; return the raw message content.

    Retries transient gateway/network errors (1/2/4s backoff). 4xx fails fast.
    Returns None on failure. `label` (e.g. 'de-CH->en-GB') is for logging only.
    Parsing is the caller's job — a 200 is returned even if unparseable so the
    caller can fail without retrying (deterministic output, no token re-spend).
    """
    api_key, product_id = _api_key(), _product_id()
    if not api_key or not product_id:
        logger.warning(
            "translator: APPVIEW_TRANSLATE_API_KEY / _PRODUCT_ID not set — skipping"
        )
        return None

    payload = {
        "model": _model_name(),
        "messages": messages,
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
        except httpx.RequestError as err:  # network/timeout — retry
            last_err = err
            if attempt < len(_BACKOFFS):
                await asyncio.sleep(_BACKOFFS[attempt])
            continue

        if resp.status_code in _TRANSIENT_STATUS:  # 429/5xx — retry
            last_err = f"HTTP {resp.status_code}"
            if attempt < len(_BACKOFFS):
                await asyncio.sleep(_BACKOFFS[attempt])
            continue

        if resp.status_code != 200:  # permanent (4xx) — fail fast
            logger.error(f"translator: LLM {label} permanent error: HTTP {resp.status_code}")
            return None

        try:
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as err:
            logger.error(f"translator: LLM {label} malformed response envelope: {err}")
            return None

    logger.error(f"translator: LLM {label} failed after retries: {last_err}")
    return None


async def _translate_via_llm(
    client: httpx.AsyncClient,
    *,
    source_lang: str,
    target_lang: str,
    title: str,
    body: str,
) -> Optional[dict]:
    """Translate (title, body) source_lang→target_lang for arguments/comments.
    Returns {title, body, source:'ai', model, translatedAt} or None."""
    label = f"{source_lang}->{target_lang}"
    messages = _build_messages(
        _lang_name(source_lang), _lang_name(target_lang), title, body
    )
    content = await _chat_completion(client, messages, label=label)
    if content is None:
        return None
    try:
        parsed = _parse_translation_response(content)
    except Exception as err:
        logger.error(f"translator: LLM {label} unparseable response: {err}")
        return None
    return {
        "title": parsed["title"],
        "body": parsed["body"],
        "source": "ai",
        "model": _model_name(),
        "translatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _build_topic_messages(src: str, tgt: str, name: str, introduction: str) -> list[dict]:
    system = (
        "You are a professional translator for a Swiss civic-participation "
        "platform. You translate topics in a hierarchy of referendum themes from "
        f"{src} to {tgt}. TITLE is the short topic name; BODY is a voter-facing "
        "introduction explaining why the topic matters and for whom. Preserve "
        "meaning and tone; do not summarise or add commentary. Keep the title "
        "short.\n\n"
        "Reply in EXACTLY this format and nothing else — no JSON, no code "
        "fences, no extra lines:\n"
        "TITLE: <translated topic name>\n"
        "BODY: <translated introduction>\n"
        "If the input BODY is empty, write 'BODY:' with nothing after it."
    )
    user = f"TITLE: {name}\nBODY: {introduction}"
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def _translate_topic_via_llm(
    client: httpx.AsyncClient,
    *,
    source_lang: str,
    target_lang: str,
    name: str,
    introduction: str,
) -> Optional[dict]:
    """Translate a topic node (name + optional introduction). `name` is required;
    `introduction` may be empty. Returns {name, introduction, source, model,
    translatedAt} or None."""
    label = f"topic {source_lang}->{target_lang}"
    messages = _build_topic_messages(
        _lang_name(source_lang), _lang_name(target_lang), name, introduction or ""
    )
    content = await _chat_completion(client, messages, label=label)
    if content is None:
        return None
    try:
        t_name, t_intro = _extract_title_body(content)
    except Exception as err:
        logger.error(f"translator: LLM {label} unparseable response: {err}")
        return None
    if not t_name.strip():
        logger.error(f"translator: LLM {label} returned empty topic name")
        return None
    return {
        "name": t_name,
        # Only keep an introduction translation when the source had one.
        "introduction": t_intro if (introduction or "").strip() else "",
        "source": "ai",
        "model": _model_name(),
        "translatedAt": datetime.now(timezone.utc).isoformat(),
    }


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

    # Origin language(s): from the record, else the DB, else default — and
    # canonicalised (bare 'de' → 'de-CH'). The record must carry `langs` so it
    # is self-describing (inline-translation design); backfill it when missing
    # or non-canonical, even if no new translation is needed.
    raw_langs = record.get("langs")
    origin_src = raw_langs or row["langs"] or [DEFAULT_LANGUAGE]
    langs = [
        normalize_lang(l) or l for l in origin_src if isinstance(l, str)
    ] or [DEFAULT_LANGUAGE]
    langs_fixed = raw_langs != langs

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

    if added == 0 and not repaired and not langs_fixed:
        # Nothing new and nothing to fix → don't churn putRecord.
        return

    record["langs"] = langs
    record["translations"] = list(by_lang.values())
    await _persist_record(client, gov_did, ARGUMENT_NSID, rkey, record)
    fixes = []
    if repaired:
        fixes.append("repaired source")
    if langs_fixed:
        fixes.append(f"set langs={langs}")
    logger.info(
        "translator: wrote %d translation(s)%s for %s",
        added,
        (" + " + ", ".join(fixes)) if fixes else "",
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
        if _topics_enabled():
            await _process_topics_batch(client)


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
# Taxonomy topic nodes (direct-to-DB — no PDS/firehose)
# -----------------------------------------------------------------------------


async def _process_topics_batch(client: httpx.AsyncClient) -> None:
    """Translate voter-facing topic-node fields (name + introduction).

    The taxonomy lives only in app_taxonomy_node (built by the calculator), so —
    unlike arguments/comments — there is no PDS round-trip: we UPDATE the row
    directly and recompute translation_status here. That means the status flips
    to 'complete' immediately (no indexer lag), so a node is never re-fetched
    once done — no re-translation loop."""
    pool = await get_pool()
    batch = _batch_size()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, introduction, langs, translations
            FROM app_taxonomy_node
            WHERE translation_status IN ('pending', 'partial')
            ORDER BY id ASC
            LIMIT $1
            """,
            batch,
        )

    if not rows:
        logger.debug("translator: no topics pending")
        return

    for r in rows:
        try:
            await _process_topic(client, pool, dict(r))
        except Exception as err:
            logger.error(f"translator: failed for topic {r['id']}: {err}")


async def _process_topic(client: httpx.AsyncClient, pool, row: dict) -> None:
    """Translate one topic node into the missing languages and UPDATE the row."""
    node_id = row["id"]
    raw_langs = row["langs"]
    langs = [
        normalize_lang(l) or l for l in (raw_langs or [DEFAULT_LANGUAGE]) if isinstance(l, str)
    ] or [DEFAULT_LANGUAGE]
    langs_fixed = raw_langs != langs

    by_lang: dict[str, dict] = {
        t["lang"]: t
        for t in _parse_translations(row.get("translations"))
        if isinstance(t, dict) and isinstance(t.get("lang"), str)
    }
    missing = _missing_languages(langs, list(by_lang.values()))

    source_lang = langs[0] if langs else DEFAULT_LANGUAGE
    name = row.get("name") or ""
    introduction = row.get("introduction") or ""
    added = 0
    for target in missing:
        translated = await _translate_topic_via_llm(
            client,
            source_lang=source_lang,
            target_lang=target,
            name=name,
            introduction=introduction,
        )
        if translated is None:
            continue
        by_lang[target] = {
            "lang": target,
            "name": translated["name"],
            "introduction": translated["introduction"],
            "source": "ai",
            "model": _model_name(),
            "translatedAt": translated["translatedAt"],
        }
        added += 1

    translations = list(by_lang.values())
    status = _derive_status(langs, translations)

    if added == 0 and not langs_fixed and status == row.get("translation_status"):
        return  # nothing changed → no write

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE app_taxonomy_node
            SET langs = $1, translations = $2::jsonb, translation_status = $3
            WHERE id = $4
            """,
            langs,
            json.dumps(translations),
            status,
            node_id,
        )
    logger.info(
        "translator: topic %s → %d translation(s), status=%s", node_id, added, status
    )


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


async def run_translation_forever() -> None:
    """Foreground translation loop for the standalone writer process
    (src.main). Resets the circuit breaker so a fresh start resumes
    processing. The internal write-side owns governance writes now."""
    global _halted, _halt_reason
    _halted = False
    _halt_reason = ""
    await _poll_loop()
