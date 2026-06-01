"""
XRPC routes for comments: comment.list, comment.get, comment.create.

Comments are ATProto records (`app.ch.poltr.comment`) that live in user repos
(intern) or foreign Bluesky repos (extern). Translations are NOT inline on the
record — POLTR cannot write into foreign repos. Instead they live as sidecar
records `app.ch.poltr.comment.translation` in the ballot's governance account
and are indexed into `app_comment_translations`; the serializer LEFT JOINs to
pull the requested-language body in one roundtrip.
"""

import hashlib
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse

from src.atproto.atproto_api import pds_create_record
from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger
from src.core.languages import DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES_SET
from src.core.lib import get_date_iso, get_number, get_string
from src.routes.deliberation._lang import resolve_requested_lang

router = APIRouter(prefix="/xrpc", tags=["poltr-comments"])


def _serialize_comment_row(row: dict, requested_lang: str) -> dict:
    """Convert an app_comments row (with sidecar-translation LEFT JOIN) into
    the API comment shape, localized to `requested_lang`.

    The query is expected to provide:
      - c.* (incl. langs, translation_status)
      - p.* (profile fields, prefixed profile_)
      - viewer_like (NULL or AT-URI)
      - t_lang, t_body, t_source (LEFT JOIN on the sidecar for requested_lang)
      - translation_langs (text[] of all available sidecar langs)
    """
    origin_type = get_string(row, "origin") or "intern"

    if origin_type == "extern":
        author_raw = {
            "did": get_string(row, "did") or "",
            "handle": get_string(row, "handle"),
            "displayName": get_string(row, "display_name"),
        }
    else:
        author_raw = {
            "did": get_string(row, "did") or "",
            "displayName": get_string(row, "profile_display_name"),
            "canton": get_string(row, "profile_canton"),
            "color": get_string(row, "profile_color"),
        }
    author = {k: v for k, v in author_raw.items() if v is not None}

    viewer_obj = {}
    if row.get("viewer_like"):
        viewer_obj["like"] = row["viewer_like"]

    origin_langs = row.get("langs")
    if not isinstance(origin_langs, list) or not origin_langs:
        origin_langs = [DEFAULT_LANGUAGE]

    translation_langs = row.get("translation_langs") or []
    if not isinstance(translation_langs, list):
        translation_langs = []

    available_langs: list[str] = []
    seen: set[str] = set()
    for l in origin_langs:
        if l and l not in seen:
            available_langs.append(l)
            seen.add(l)
    for l in translation_langs:
        if l and l not in seen:
            available_langs.append(l)
            seen.add(l)

    title = get_string(row, "title") or ""
    original_body = get_string(row, "text") or ""

    body_out = original_body
    translation_source: Optional[str] = None
    translated_from: Optional[str] = None

    if requested_lang in origin_langs:
        body_out = original_body
    elif row.get("t_body"):
        body_out = row["t_body"]
        translation_source = row.get("t_source") or "ai"
        translated_from = origin_langs[0] if origin_langs else DEFAULT_LANGUAGE
    # else: fallback to original (already set)

    record: dict = {
        "$type": "app.ch.poltr.comment",
        "title": title,
        "body": body_out,
        "argument": get_string(row, "argument_uri") or "",
        "createdAt": get_date_iso(row, "created_at"),
        "langs": origin_langs,
    }
    if translation_source is not None:
        record["translatedFrom"] = translated_from
        record["translationSource"] = translation_source

    comment_raw = {
        "uri": get_string(row, "uri") or "",
        "cid": get_string(row, "cid") or "",
        "record": record,
        "author": author,
        "origin": origin_type,
        "parentUri": get_string(row, "parent_uri"),
        "argumentUri": get_string(row, "argument_uri") or "",
        "likeCount": get_number(row, "like_count"),
        "indexedAt": get_date_iso(row, "indexed_at"),
        "viewer": viewer_obj if viewer_obj else None,
        "availableLangs": available_langs,
        "translationSource": translation_source,
    }
    return {k: v for k, v in comment_raw.items() if v is not None}


# Shared SELECT fragment used by both list and get. `$N` placeholders are
# filled in by the caller via _build_translation_join(requested_lang, idx).
_COMMENT_BASE_COLUMNS = """
    c.uri, c.cid, c.did, c.rkey, c.origin, c.title, c.text, c.langs,
    c.translation_status, c.ballot_uri, c.ballot_rkey, c.parent_uri,
    c.argument_uri, c.like_count, c.created_at, c.indexed_at,
    c.handle, c.display_name,
    p.display_name AS profile_display_name,
    p.canton       AS profile_canton,
    p.color        AS profile_color
"""


def _translation_join(lang_param: str) -> str:
    """SQL fragment: LEFT JOIN one sidecar row for the requested language
    plus an aggregate of all sidecar langs. `lang_param` is the $N placeholder
    string for the requested language (e.g. "$2")."""
    return f"""
        LEFT JOIN app_comment_translations ct
          ON ct.subject_uri = c.uri AND ct.lang = {lang_param} AND NOT ct.deleted
    """


def _translation_select() -> str:
    """Columns produced by the sidecar JOIN. Always include these in SELECT."""
    return """
        ct.lang   AS t_lang,
        ct.body   AS t_body,
        ct.source AS t_source,
        (SELECT array_agg(DISTINCT x.lang)
           FROM app_comment_translations x
           WHERE x.subject_uri = c.uri AND NOT x.deleted) AS translation_langs
    """


# -----------------------------------------------------------------------------
# app.ch.poltr.comment.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.comment.list")
async def list_comments(
    request: Request,
    argument_uri: str = Query(...),
    limit: int = Query(50),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """List comments for an argument, localized to the requested language."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    params: list = [argument_uri, requested_lang]   # $1 = argument_uri, $2 = requested_lang

    viewer_did = session.did if session else None
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = c.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like"""
    else:
        viewer_select = ",\n            NULL AS viewer_like"

    sql = f"""
        SELECT
            {_COMMENT_BASE_COLUMNS},
            {_translation_select()}
            {viewer_select}
        FROM app_comments c
        LEFT JOIN app_profiles p ON p.did = c.did
        {_translation_join("$2")}
        WHERE c.argument_uri = $1 AND NOT c.deleted
        ORDER BY c.created_at ASC, c.uri;
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        comments = [_serialize_comment_row(dict(r), requested_lang) for r in rows]

        seed = viewer_did or ""
        comments.sort(
            key=lambda c: hashlib.md5(f"{seed}:{c['uri']}".encode()).hexdigest()
        )
        comments = comments[:limit]

        return JSONResponse(status_code=200, content={"comments": comments})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.comment.get
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.comment.get")
async def get_comment(
    request: Request,
    uri: str = Query(...),
    lang: Optional[str] = Query(None),
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """Get a single comment by URI with its parent argument info."""
    requested_lang = resolve_requested_lang(lang, accept_language)
    params: list = [uri, requested_lang]   # $1 = comment uri, $2 = requested_lang

    viewer_did = session.did if session else None
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = c.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like"""
    else:
        viewer_select = ",\n            NULL::text AS viewer_like"

    sql = f"""
        SELECT
            {_COMMENT_BASE_COLUMNS},
            {_translation_select()}
            {viewer_select},
            a.uri AS arg_uri, a.rkey AS arg_rkey, a.title AS arg_title,
            a.body AS arg_body, a.type AS arg_type,
            a.like_count AS arg_like_count, a.comment_count AS arg_comment_count,
            a.review_status AS arg_review_status, a.ballot_rkey AS arg_ballot_rkey
        FROM app_comments c
        LEFT JOIN app_profiles p ON p.did = c.did
        LEFT JOIN app_arguments a ON a.uri = c.argument_uri
        {_translation_join("$2")}
        WHERE c.uri = $1 AND NOT c.deleted;
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)

        if not row:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Comment not found"},
            )

        row = dict(row)
        comment = _serialize_comment_row(row, requested_lang)

        argument_raw = {
            "uri": get_string(row, "arg_uri") or "",
            "rkey": get_string(row, "arg_rkey") or "",
            "title": get_string(row, "arg_title") or "",
            "body": get_string(row, "arg_body"),
            "type": get_string(row, "arg_type"),
            "likeCount": get_number(row, "arg_like_count"),
            "commentCount": get_number(row, "arg_comment_count"),
            "reviewStatus": get_string(row, "arg_review_status"),
            "ballotRkey": get_string(row, "arg_ballot_rkey") or "",
        }
        argument = {k: v for k, v in argument_raw.items() if v is not None}

        return JSONResponse(
            status_code=200, content={"comment": comment, "argument": argument}
        )
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.comment.create
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.comment.create")
async def create_comment(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Create a comment record on the PDS.

    Accepts an optional `langs` array (BCP-47); defaults to [DEFAULT_LANGUAGE].
    """
    body = await request.json()
    argument_uri = body.get("argument")
    title = body.get("title", "")
    comment_body = body.get("body", "")
    parent_uri = body.get("parent")

    raw_langs = body.get("langs")
    if isinstance(raw_langs, list):
        langs = [l for l in raw_langs if isinstance(l, str) and l in SUPPORTED_LANGUAGES_SET]
    elif isinstance(raw_langs, str) and raw_langs in SUPPORTED_LANGUAGES_SET:
        langs = [raw_langs]
    else:
        langs = [DEFAULT_LANGUAGE]
    if not langs:
        langs = [DEFAULT_LANGUAGE]

    if not argument_uri:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "argument URI required"},
        )
    if not comment_body:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "body required"},
        )

    # Validate argument exists
    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT uri FROM app_arguments WHERE uri = $1 AND NOT deleted",
                argument_uri,
            )
        if not row:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Argument not found"},
            )
    except Exception as err:
        logger.error(f"DB lookup failed: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "details": str(err)},
        )

    record = {
        "$type": "app.ch.poltr.comment",
        "title": title,
        "body": comment_body,
        "argument": argument_uri,
        "langs": langs,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if parent_uri:
        record["parent"] = parent_uri

    # PDS failures raise PDSError → handled centrally (see core/fastapi.py).
    result = await pds_create_record(session, "app.ch.poltr.comment", record)
    return JSONResponse(status_code=200, content=result)
