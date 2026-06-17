"""
Ballot endpoints — REST, NOT ATProto.

Ballots are CMS-backed content (Payload). Unlike arguments/comments/likes,
they are not records on the PDS. This module exposes them as a flat REST
shape under `/api/ballots*` so the URL path itself reflects the architecture
split (basis-app REST vs. deliberation XRPC — see doc/RECORD_TRANSLATIONS.md
§5b).

Multilingual reads are forwarded transparently to Payload via `?locale=` on
the CMS REST API. `availableLangs` is computed from a second CMS call using
`?locale=all`.
"""

import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger
from src.core.languages import (
    DEFAULT_LANGUAGE,
    SUPPORTED_LANGUAGES,
    SUPPORTED_LANGUAGES_SET,
)
from src.routes.deliberation._lang import resolve_requested_lang

router = APIRouter(prefix="/api", tags=["poltr-ballots"])

CMS_INTERNAL_SERVER_URL = os.getenv("CMS_INTERNAL_SERVER_URL")


# -----------------------------------------------------------------------------
# CMS helpers
# -----------------------------------------------------------------------------


class CMSError(Exception):
    """Distinguishes network vs. HTTP-error vs. parse-error from the CMS so
    the route handler can return a useful (and never-empty) details string.

    `category` maps to a stable error code for the JSON response:
      - 'cms_unreachable'    network failure (DNS, refused, timeout) → 502
      - 'cms_http_error'     CMS responded but with non-2xx status → 502
      - 'cms_invalid_response' 2xx but body is not JSON / wrong shape → 502
    """

    def __init__(self, category: str, message: str, status_code: int | None = None):
        self.category = category
        self.status_code = status_code
        super().__init__(message)


def _cms_error_payload(err: CMSError) -> dict:
    return {
        "error": err.category,
        "details": str(err) or err.category,
        "cmsStatus": err.status_code,
    }


def _require_cms_url() -> str:
    """Fail fast (and visibly) if the CMS URL env var is missing — without this
    httpx silently builds a malformed URL and surfaces an opaque RequestError."""
    if not CMS_INTERNAL_SERVER_URL:
        raise CMSError(
            "cms_unreachable",
            "CMS_INTERNAL_SERVER_URL env var is not set on the appview pod",
        )
    return CMS_INTERNAL_SERVER_URL


async def _fetch_cms_ballots(locale: str, status: str = "published") -> list[dict]:
    """Fetch published ballots from CMS REST API in the requested locale.

    Payload returns localized text fields directly when `locale=<code>` is set;
    non-localized fields are returned as-is.
    """
    cms_url = _require_cms_url()
    url = (
        f"{cms_url}/api/ballots"
        f"?where[status][equals]={status}&sort=-voteDate&limit=100"
        f"&locale={locale}&fallback-locale={DEFAULT_LANGUAGE}"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
    except httpx.RequestError as err:
        # Network-layer failure — DNS, connection refused, timeout, etc.
        # `str(err)` is often empty for some httpx errors; fall back to repr.
        detail = str(err) or repr(err)
        raise CMSError(
            "cms_unreachable",
            f"CMS request to /api/ballots failed: {detail}",
        ) from err

    if resp.status_code != 200:
        body_preview = (resp.text or "").strip()[:300] or "<empty body>"
        raise CMSError(
            "cms_http_error",
            f"CMS /api/ballots returned {resp.status_code}: {body_preview}",
            status_code=resp.status_code,
        )

    try:
        return resp.json().get("docs", [])
    except ValueError as err:
        raise CMSError(
            "cms_invalid_response",
            f"CMS /api/ballots returned non-JSON body: {(resp.text or '').strip()[:200]!r}",
        ) from err


async def _fetch_cms_ballot(rkey: str, locale: str) -> dict | None:
    """Fetch a single ballot from CMS by rkey, in the requested locale."""
    cms_url = _require_cms_url()
    url = (
        f"{cms_url}/api/ballots"
        f"?where[rkey][equals]={rkey}&limit=1"
        f"&locale={locale}&fallback-locale={DEFAULT_LANGUAGE}"
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
    except httpx.RequestError as err:
        detail = str(err) or repr(err)
        raise CMSError(
            "cms_unreachable",
            f"CMS request to /api/ballots/{rkey} failed: {detail}",
        ) from err

    if resp.status_code != 200:
        body_preview = (resp.text or "").strip()[:300] or "<empty body>"
        raise CMSError(
            "cms_http_error",
            f"CMS /api/ballots/{rkey} returned {resp.status_code}: {body_preview}",
            status_code=resp.status_code,
        )

    try:
        docs = resp.json().get("docs", [])
    except ValueError as err:
        raise CMSError(
            "cms_invalid_response",
            f"CMS /api/ballots/{rkey} returned non-JSON body",
        ) from err

    return docs[0] if docs else None


async def _fetch_ballot_available_langs(rkey: str) -> list[str]:
    """Determine which locales are filled in for a ballot by asking the CMS
    for `?locale=all`. A locale counts as filled when its `title` is non-empty.

    Falls back to [DEFAULT_LANGUAGE] on errors (non-blocking for the main flow).
    """
    try:
        url = (
            f"{CMS_INTERNAL_SERVER_URL}/api/ballots"
            f"?where[rkey][equals]={rkey}&limit=1&locale=all&depth=0"
        )
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return [DEFAULT_LANGUAGE]
            docs = resp.json().get("docs", [])
            if not docs:
                return [DEFAULT_LANGUAGE]
            doc = docs[0]
            available: list[str] = []
            # Payload returns `title` as either {de: "...", fr: "..."} (preferred)
            # or per-locale subdocs depending on the version — handle both.
            title_field = doc.get("title")
            if isinstance(title_field, dict):
                for code in SUPPORTED_LANGUAGES:
                    val = title_field.get(code)
                    if isinstance(val, str) and val.strip():
                        available.append(code)
            else:
                for code in SUPPORTED_LANGUAGES:
                    slot = doc.get(code)
                    if isinstance(slot, dict):
                        val = slot.get("title")
                        if isinstance(val, str) and val.strip():
                            available.append(code)
            return available or [DEFAULT_LANGUAGE]
    except Exception as err:
        logger.warning(f"available-langs fetch failed for ballot {rkey}: {err}")
        return [DEFAULT_LANGUAGE]


def _extract_description_text(description) -> Optional[str]:
    """Pull plain text out of the Payload Lexical rich-text JSON shape."""
    if isinstance(description, str):
        return description
    if isinstance(description, dict):
        texts: list[str] = []
        for node in description.get("root", {}).get("children", []):
            for child in node.get("children", []):
                if child.get("text"):
                    texts.append(child["text"])
        return " ".join(texts) or None
    return None


def _serialize_ballot(
    doc: dict,
    counts: dict | None = None,
    viewer_like: str | None = None,
    available_langs: list[str] | None = None,
) -> dict:
    """Convert a CMS ballot document into the flat API shape.

    No `$type`, no `record` wrapper, no AT-URI, no CID — these are not
    ATProto records. `rkey` is the stable identifier; `communityDid` is the
    bridge to the (ATProto-backed) deliberation layer.
    """
    rkey = doc.get("rkey", str(doc.get("id", "")))
    origin_lang = doc.get("originLanguage") or DEFAULT_LANGUAGE
    avail = available_langs if available_langs else [origin_lang]

    out: dict = {
        "rkey": rkey,
        "title": doc.get("title", ""),
        "description": _extract_description_text(doc.get("description")),
        "topic": doc.get("topic"),
        "ballotType": doc.get("ballotType"),
        "voteDate": doc.get("voteDate", ""),
        "officialRef": doc.get("officialRef"),
        "originLanguage": origin_lang,
        "langs": [origin_lang],
        "availableLangs": avail,
        "createdAt": doc.get("createdAt"),
        "updatedAt": doc.get("updatedAt"),
        "communityDid": doc.get("communityDid"),
        "argumentCount": (counts or {}).get("argument_count", 0),
        "commentCount": (counts or {}).get("comment_count", 0),
        "likeCount": (counts or {}).get("like_count", 0),
        "viewer": {"like": viewer_like} if viewer_like else None,
    }
    return {k: v for k, v in out.items() if v is not None}


async def _get_ballot_counts(
    ballot_ids: list[str], viewer_did: str | None = None
) -> dict:
    """Get argument/comment/like counts for ballots from AppView DB.
    Returns {ballot_id: {argument_count, comment_count, like_count, viewer_like}}.
    """
    if not ballot_ids:
        return {}

    db_pool = await get_pool()
    async with db_pool.acquire() as conn:
        arg_rows = await conn.fetch(
            """
            SELECT ga.ballot_rkey, COUNT(*) AS cnt
            FROM app_arguments a
            JOIN auth.community_accounts ga ON ga.did = a.did
            WHERE ga.ballot_rkey = ANY($1) AND NOT a.deleted
            GROUP BY ga.ballot_rkey
            """,
            ballot_ids,
        )

        comment_rows = await conn.fetch(
            """
            SELECT ga.ballot_rkey, COUNT(*) AS cnt
            FROM app_comments c
            JOIN app_arguments a ON a.uri = c.argument_uri
            JOIN auth.community_accounts ga ON ga.did = a.did
            WHERE ga.ballot_rkey = ANY($1) AND NOT c.deleted
            GROUP BY ga.ballot_rkey
            """,
            ballot_ids,
        )

    result: dict = {}
    for bid in ballot_ids:
        result[bid] = {"argument_count": 0, "comment_count": 0, "like_count": 0}

    for row in arg_rows:
        result[row["ballot_rkey"]]["argument_count"] = row["cnt"]
    for row in comment_rows:
        result[row["ballot_rkey"]]["comment_count"] = row["cnt"]

    return result


# -----------------------------------------------------------------------------
# GET /api/ballots
# -----------------------------------------------------------------------------


@router.get("/ballots")
async def list_ballots(
    request: Request,
    since: Optional[str] = Query(None),
    limit: int = Query(50),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """List published ballots, localized to the requested language and
    enriched with argument/comment counts."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    viewer_did = session.did if session else None

    try:
        cms_ballots = await _fetch_cms_ballots(requested_lang)
    except CMSError as err:
        logger.error(f"list_ballots: {err.category} — {err}")
        return JSONResponse(status_code=502, content=_cms_error_payload(err))
    except Exception as err:
        logger.exception("list_ballots: unexpected error while fetching CMS")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "details": str(err) or repr(err)},
        )

    if not cms_ballots:
        return JSONResponse(status_code=200, content={"cursor": None, "ballots": []})

    ballot_rkeys = [b.get("rkey", str(b["id"])) for b in cms_ballots]

    try:
        counts = await _get_ballot_counts(ballot_rkeys, viewer_did)
    except Exception as err:
        logger.warning(f"Failed to get ballot counts: {err}")
        counts = {}

    # Fetch availableLangs for each ballot in parallel — these are independent
    # CMS calls and the page typically holds 5–10 ballots, so concurrent dispatch
    # keeps the overall response time close to a single CMS round-trip.
    import asyncio

    avail_map: dict[str, list[str]] = {}
    avail_results = await asyncio.gather(
        *[_fetch_ballot_available_langs(rkey) for rkey in ballot_rkeys],
        return_exceptions=True,
    )
    for rkey, res in zip(ballot_rkeys, avail_results):
        avail_map[rkey] = (
            res if isinstance(res, list) else [DEFAULT_LANGUAGE]
        )

    ballots = [
        _serialize_ballot(
            b,
            counts.get(b.get("rkey", str(b["id"]))),
            available_langs=avail_map.get(b.get("rkey", str(b["id"]))),
        )
        for b in cms_ballots
    ]

    return JSONResponse(status_code=200, content={"cursor": None, "ballots": ballots})


# -----------------------------------------------------------------------------
# GET /api/ballots/<rkey>
# -----------------------------------------------------------------------------


@router.get("/ballots/{rkey}")
async def get_ballot(
    rkey: str,
    request: Request,
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """Fetch a single ballot by rkey, localized to the requested language."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    viewer_did = session.did if session else None

    try:
        doc = await _fetch_cms_ballot(rkey, requested_lang)
    except CMSError as err:
        logger.error(f"get_ballot({rkey}): {err.category} — {err}")
        return JSONResponse(status_code=502, content=_cms_error_payload(err))
    except Exception as err:
        logger.exception(f"get_ballot({rkey}): unexpected error while fetching CMS")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "details": str(err) or repr(err)},
        )

    if not doc:
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "message": "Ballot not found"},
        )

    try:
        counts = await _get_ballot_counts([rkey], viewer_did)
    except Exception as err:
        logger.warning(f"Failed to get ballot counts: {err}")
        counts = {}

    avail = await _fetch_ballot_available_langs(rkey)

    ballot = _serialize_ballot(doc, counts.get(rkey), available_langs=avail)
    return JSONResponse(status_code=200, content={"ballot": ballot})
