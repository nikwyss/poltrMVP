"""
Participation endpoints: ballots, arguments, comments, likes, activity.

Ballots are sourced from the CMS (Payload) and enriched with counts from
the AppView database. Arguments/comments/reviews are ATProto records.
"""

import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.fastapi import logger
from src.core.db import get_pool
from src.core.cursor import encode_cursor
from src.core.lib import get_string, get_date_iso, get_number, get_array, get_object
from src.atproto.atproto_api import (
    pds_create_record,
    pds_delete_record,
    pds_put_record_session,
)
from src.atproto.governance import create_governance_record, get_did_for_ballot

router = APIRouter(prefix="/xrpc", tags=["poltr"])

CMS_INTERNAL_SERVER_URL = os.getenv("CMS_INTERNAL_SERVER_URL")


# -----------------------------------------------------------------------------
# CMS helpers
# -----------------------------------------------------------------------------


async def _fetch_cms_ballots(status: str = "published") -> list[dict]:
    """Fetch published ballots from CMS REST API."""
    url = f"{CMS_INTERNAL_SERVER_URL}/api/ballots?where[status][equals]={status}&sort=-voteDate&limit=100"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            logger.error(
                f"CMS ballot fetch failed ({resp.status_code}): {resp.text[:200]}"
            )
            return []
        return resp.json().get("docs", [])


async def _fetch_cms_ballot(rkey: str) -> dict | None:
    """Fetch a single ballot from CMS by rkey."""
    url = f"{CMS_INTERNAL_SERVER_URL}/api/ballots?where[rkey][equals]={rkey}&limit=1"
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None
        docs = resp.json().get("docs", [])
        return docs[0] if docs else None


def _serialize_cms_ballot(
    doc: dict, counts: dict | None = None, viewer_like: str | None = None
) -> dict:
    """Convert a CMS ballot document to the API ballot shape."""
    ballot_rkey = doc.get("rkey", str(doc.get("id", "")))

    record = {
        "$type": "app.ch.poltr.ballot.entry",
        "title": doc.get("title", ""),
        "voteDate": doc.get("voteDate", ""),
        "createdAt": doc.get("createdAt", ""),
    }
    if doc.get("topic"):
        record["topic"] = doc["topic"]
    if doc.get("ballotType"):
        record["ballotType"] = doc["ballotType"]
    if doc.get("description"):
        # Rich text from CMS — extract plain text for preview
        desc = doc["description"]
        if isinstance(desc, dict):
            # Lexical JSON — extract text from root children
            texts = []
            for node in desc.get("root", {}).get("children", []):
                for child in node.get("children", []):
                    if child.get("text"):
                        texts.append(child["text"])
            record["text"] = " ".join(texts)
        elif isinstance(desc, str):
            record["text"] = desc
    if doc.get("officialRef"):
        record["officialRef"] = doc["officialRef"]
    if doc.get("language"):
        record["language"] = doc["language"]

    c = counts or {}
    viewer_obj = {"like": viewer_like} if viewer_like else None

    ballot_raw = {
        "uri": f"cms://ballots/{ballot_rkey}",
        "cid": "",
        "record": record,
        "indexedAt": doc.get("updatedAt") or doc.get("createdAt"),
        "likeCount": c.get("like_count", 0),
        "argumentCount": c.get("argument_count", 0),
        "commentCount": c.get("comment_count", 0),
        "viewer": viewer_obj,
        "governanceDid": doc.get("governanceDid"),
    }
    return {k: v for k, v in ballot_raw.items() if v is not None}


async def _get_ballot_counts(
    ballot_ids: list[str], viewer_did: str | None = None
) -> dict:
    """Get argument/comment/like counts for ballots from AppView DB.
    Returns {ballot_id: {argument_count, comment_count, like_count, viewer_like}}."""
    if not ballot_ids:
        return {}

    db_pool = await get_pool()
    async with db_pool.acquire() as conn:
        # Argument counts per governance DID
        arg_rows = await conn.fetch(
            """
            SELECT ga.ballot_rkey, COUNT(*) AS cnt
            FROM app_arguments a
            JOIN auth.governance_accounts ga ON ga.did = a.did
            WHERE ga.ballot_rkey = ANY($1) AND NOT a.deleted
            GROUP BY ga.ballot_rkey
            """,
            ballot_ids,
        )

        # Comment counts per ballot_rkey
        comment_rows = await conn.fetch(
            """
            SELECT ga.ballot_rkey, COUNT(*) AS cnt
            FROM app_comments c
            JOIN app_arguments a ON a.uri = c.argument_uri
            JOIN auth.governance_accounts ga ON ga.did = a.did
            WHERE ga.ballot_rkey = ANY($1) AND NOT c.deleted
            GROUP BY ga.ballot_rkey
            """,
            ballot_ids,
        )

    result = {}
    for bid in ballot_ids:
        result[bid] = {"argument_count": 0, "comment_count": 0, "like_count": 0}

    for row in arg_rows:
        result[row["ballot_rkey"]]["argument_count"] = row["cnt"]
    for row in comment_rows:
        result[row["ballot_rkey"]]["comment_count"] = row["cnt"]

    return result


# -----------------------------------------------------------------------------
# app.ch.poltr.ballot.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.ballot.list")
async def list_ballots(
    request: Request,
    since: str = Query(None),
    limit: int = Query(50),
    session: TSession = Depends(verify_session_token),
):
    """List published ballots from CMS, enriched with argument/comment counts."""
    try:
        cms_ballots = await _fetch_cms_ballots()
    except Exception as err:
        logger.error(f"CMS fetch failed: {err}")
        return JSONResponse(
            status_code=502, content={"error": "cms_error", "details": str(err)}
        )

    if not cms_ballots:
        return JSONResponse(status_code=200, content={"cursor": None, "ballots": []})

    ballot_rkeys = [b.get("rkey", str(b["id"])) for b in cms_ballots]
    viewer_did = session.did if session else None

    try:
        counts = await _get_ballot_counts(ballot_rkeys, viewer_did)
    except Exception as err:
        logger.warning(f"Failed to get ballot counts: {err}")
        counts = {}

    ballots = [_serialize_cms_ballot(b, counts.get(b.get("rkey", str(b["id"])))) for b in cms_ballots]

    return JSONResponse(status_code=200, content={"cursor": None, "ballots": ballots})


# -----------------------------------------------------------------------------
# app.ch.poltr.ballot.get
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.ballot.get")
async def get_ballot(
    request: Request,
    rkey: str = Query(...),
    session: TSession = Depends(verify_session_token),
):
    """Get a single ballot from CMS by ID."""
    try:
        doc = await _fetch_cms_ballot(rkey)
    except Exception as err:
        logger.error(f"CMS fetch failed: {err}")
        return JSONResponse(
            status_code=502, content={"error": "cms_error", "details": str(err)}
        )

    if not doc or doc.get("status") != "published":
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "message": "Ballot not found"},
        )

    try:
        ballot_rkey = doc.get("rkey", str(doc["id"]))
        counts = await _get_ballot_counts([ballot_rkey])
        ballot_counts = counts.get(ballot_rkey)
    except Exception:
        ballot_counts = None

    ballot = _serialize_cms_ballot(doc, ballot_counts)
    return JSONResponse(status_code=200, content={"ballot": ballot})


# -----------------------------------------------------------------------------
# Argument row → JSON serialization (shared by argument.list and argument.get)
# -----------------------------------------------------------------------------


def _serialize_argument_row(row: dict, peer_review_on: bool) -> dict:
    """Convert a row from app_arguments (joined with profile + viewer_like)
    into the API argument shape."""
    source_type = get_string(row, "source_type") or "user"
    if source_type == "official":
        source_obj_raw = {
            "$type": "app.ch.poltr.ballot.argument#sourceOfficial",
            "documentRef": get_string(row, "source_doc_ref"),
            "section": get_string(row, "source_section"),
        }
    elif source_type == "organization":
        source_obj_raw = {
            "$type": "app.ch.poltr.ballot.argument#sourceOrganization",
            "orgKey": get_string(row, "source_org_key"),
            "documentRef": get_string(row, "source_doc_ref"),
            "verifiedDid": get_string(row, "source_verified_did"),
        }
    else:
        source_obj_raw = {
            "$type": "app.ch.poltr.ballot.argument#sourceUser",
            "authorDid": get_string(row, "author_did"),
        }
    source_obj = {k: v for k, v in source_obj_raw.items() if v is not None}

    record_raw = {
        "$type": "app.ch.poltr.ballot.argument",
        "title": get_string(row, "title"),
        "body": get_string(row, "body"),
        "type": get_string(row, "type"),
        "ballot": get_string(row, "ballot_uri"),
        "createdAt": get_date_iso(row, "created_at"),
        "source": source_obj,
    }
    record = {k: v for k, v in record_raw.items() if v is not None}

    viewer_obj = {}
    if row.get("viewer_like"):
        viewer_obj["like"] = row["viewer_like"]
    viewer_preference = row.get("viewer_preference")
    if viewer_preference is not None:
        viewer_obj["preference"] = get_number(row, "viewer_preference")

    if source_type == "user":
        author_raw = {
            "did": get_string(row, "author_did") or "",
            "displayName": get_string(row, "author_display_name"),
            "canton": get_string(row, "author_canton"),
            "color": get_string(row, "author_color"),
        }
        author = {k: v for k, v in author_raw.items() if v is not None}
    else:
        author = None

    arg_raw = {
        "uri": get_string(row, "uri") or "",
        "cid": get_string(row, "cid") or "",
        "record": record,
        "author": author,
        "likeCount": get_number(row, "like_count"),
        "commentCount": get_number(row, "comment_count"),
        "reviewStatus": (
            get_string(row, "review_status") if peer_review_on else None
        ),
        "indexedAt": get_date_iso(row, "indexed_at"),
        "viewer": viewer_obj if viewer_obj else None,
    }
    return {k: v for k, v in arg_raw.items() if v is not None}


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.argument.list")
async def list_arguments(
    request: Request,
    ballot_rkey: str = Query(...),
    sort: str = Query("random"),
    type: Optional[str] = Query(None),
    source: Optional[str] = Query(
        None,
        description="Filter by argument source: 'user', 'official', 'organization' or 'all' (default).",
    ),
    limit: int = Query(100),
    session: TSession = Depends(verify_session_token),
):
    """List arguments for a ballot."""
    params = [ballot_rkey]

    viewer_did = session.did if session else None
    peer_review_on = os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"

    # Type filter
    type_filter = ""
    if type in ("PRO", "CONTRA"):
        params.append(type)
        type_filter = f"AND a.type = ${len(params)}"

    # Source filter
    source_filter = ""
    if source in ("user", "official", "organization"):
        params.append(source)
        source_filter = f"AND a.source_type = ${len(params)}"

    # Filter: when peer review is enabled, show approved + preliminary;
    # show rejected only to the author. Curated content (official/organization)
    # bypasses the review filter entirely. When peer review is disabled, show all.
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like,
            (
                SELECT preference FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_preference"""
        if peer_review_on:
            review_filter = (
                f"AND (a.source_type IN ('official','organization') "
                f"     OR a.review_status IN ('approved', 'preliminary') "
                f"     OR a.author_did = {viewer_param})"
            )
        else:
            review_filter = ""
    else:
        viewer_select = ",\n            NULL AS viewer_like,\n            NULL AS viewer_preference"
        if peer_review_on:
            review_filter = (
                "AND (a.source_type IN ('official','organization') "
                "     OR a.review_status IN ('approved', 'preliminary'))"
            )
        else:
            review_filter = ""

    # Sort order. Explicit sorts run in SQL; the default ("random") is a stable
    # per-user shuffle applied in Python (see below) so each user gets their own
    # fixed ordering that never reshuffles when arguments are added.
    sort_map = {
        "top": "a.like_count DESC",
        "new": "a.created_at DESC",
        "discussed": "a.comment_count DESC",
    }
    seeded_shuffle = sort not in sort_map
    if seeded_shuffle:
        # Deterministic fetch order; the per-user permutation is applied after
        # serialization. LIMIT is applied post-sort to keep a stable top-N.
        order_by = "a.created_at ASC, a.uri"
        limit_clause = ""
    else:
        order_by = sort_map[sort]
        params.append(limit)
        limit_clause = f"LIMIT ${len(params)}"

    sql = f"""
        SELECT a.*,
               p.display_name AS author_display_name,
               p.canton AS author_canton,
               p.color AS author_color
               {viewer_select}
        FROM app_arguments a
        LEFT JOIN app_profiles p ON p.did = a.author_did
        WHERE a.ballot_rkey = $1 AND NOT a.deleted
          {type_filter}
          {source_filter}
          {review_filter}
        ORDER BY {order_by}
        {limit_clause};
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        arguments = [
            _serialize_argument_row(dict(r), peer_review_on) for r in rows
        ]

        if seeded_shuffle:
            # Per-row key depends only on the viewer DID and the argument's own
            # uri, so the order is stable per user and inserting a new argument
            # never moves the others. viewer_did is realistically always set
            # (verify_session_token rejects anonymous requests with 401).
            seed = viewer_did or ""
            arguments.sort(
                key=lambda a: hashlib.md5(
                    f"{seed}:{a['uri']}".encode()
                ).hexdigest()
            )
            arguments = arguments[:limit]

        return JSONResponse(status_code=200, content={"arguments": arguments})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.get
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.argument.get")
async def get_argument(
    request: Request,
    ballot_rkey: str = Query(...),
    rkey: str = Query(...),
    session: TSession = Depends(verify_session_token),
):
    """Fetch a single argument by (ballot_rkey, rkey).

    Direct lookup that bypasses the random-sort + 100-limit semantics of
    `argument.list` — the detail page needs guaranteed access to the specific
    record the user clicked on, regardless of dataset size.
    """
    viewer_did = session.did if session else None
    peer_review_on = os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"

    params: list = [ballot_rkey, rkey]
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like,
            (
                SELECT preference FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_preference"""
    else:
        viewer_select = ",\n            NULL AS viewer_like,\n            NULL AS viewer_preference"

    sql = f"""
        SELECT a.*,
               p.display_name AS author_display_name,
               p.canton AS author_canton,
               p.color AS author_color
               {viewer_select}
        FROM app_arguments a
        LEFT JOIN app_profiles p ON p.did = a.author_did
        WHERE a.ballot_rkey = $1 AND a.rkey = $2 AND NOT a.deleted
        LIMIT 1;
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)

        if row is None:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Argument not found"},
            )

        argument = _serialize_argument_row(dict(row), peer_review_on)
        return JSONResponse(status_code=200, content={"argument": argument})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.comment.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.comment.list")
async def list_comments(
    request: Request,
    argument_uri: str = Query(...),
    limit: int = Query(50),
    session: TSession = Depends(verify_session_token),
):
    """List comments for an argument."""
    params = [argument_uri]

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
        viewer_select = ",\n            NULL AS viewer_like,\n            NULL AS viewer_preference"

    # Deterministic fetch order; the per-user permutation is applied in Python
    # below (same stable per-user shuffle as argument.list) so each user gets
    # their own fixed ordering that never reshuffles when comments are added.
    sql = f"""
        SELECT c.*,
               p.display_name AS profile_display_name,
               p.canton AS profile_canton,
               p.color AS profile_color
               {viewer_select}
        FROM app_comments c
        LEFT JOIN app_profiles p ON p.did = c.did
        WHERE c.argument_uri = $1 AND NOT c.deleted
        ORDER BY c.created_at ASC, c.uri;
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        comments = []
        for r in rows:
            row = dict(r)
            origin = get_string(row, "origin") or "intern"

            if origin == "extern":
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

            comment_raw = {
                "uri": get_string(row, "uri") or "",
                "cid": get_string(row, "cid") or "",
                "record": {
                    "$type": "app.ch.poltr.comment",
                    "title": get_string(row, "title") or "",
                    "body": get_string(row, "text") or "",
                    "argument": get_string(row, "argument_uri") or "",
                    "createdAt": get_date_iso(row, "created_at"),
                },
                "author": author,
                "origin": origin,
                "parentUri": get_string(row, "parent_uri"),
                "argumentUri": get_string(row, "argument_uri") or "",
                "likeCount": get_number(row, "like_count"),
                "indexedAt": get_date_iso(row, "indexed_at"),
                "viewer": viewer_obj if viewer_obj else None,
            }
            comment = {k: v for k, v in comment_raw.items() if v is not None}
            comments.append(comment)

        # Stable per-user shuffle: each comment's key depends only on the viewer
        # DID and its own uri, so the order is stable per user and adding a
        # comment never moves the others. viewer_did is realistically always set.
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
    session: TSession = Depends(verify_session_token),
):
    """Get a single comment by URI with its parent argument info."""
    params: list = [uri]

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
            c.*,
            p.display_name AS profile_display_name,
            p.canton AS profile_canton,
            p.color AS profile_color
            {viewer_select},
            a.uri AS arg_uri, a.rkey AS arg_rkey, a.title AS arg_title,
            a.body AS arg_body, a.type AS arg_type,
            a.like_count AS arg_like_count, a.comment_count AS arg_comment_count,
            a.review_status AS arg_review_status, a.ballot_rkey AS arg_ballot_rkey
        FROM app_comments c
        LEFT JOIN app_profiles p ON p.did = c.did
        LEFT JOIN app_arguments a ON a.uri = c.argument_uri
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
        origin = get_string(row, "origin") or "intern"

        if origin == "extern":
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

        comment_raw = {
            "uri": get_string(row, "uri") or "",
            "cid": get_string(row, "cid") or "",
            "record": {
                "$type": "app.ch.poltr.comment",
                "title": get_string(row, "title") or "",
                "body": get_string(row, "text") or "",
                "argument": get_string(row, "argument_uri") or "",
                "createdAt": get_date_iso(row, "created_at"),
            },
            "author": author,
            "origin": origin,
            "parentUri": get_string(row, "parent_uri"),
            "argumentUri": get_string(row, "argument_uri") or "",
            "likeCount": get_number(row, "like_count"),
            "indexedAt": get_date_iso(row, "indexed_at"),
            "viewer": viewer_obj if viewer_obj else None,
        }
        comment = {k: v for k, v in comment_raw.items() if v is not None}

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
    """Create a comment record on the PDS."""
    body = await request.json()
    argument_uri = body.get("argument")
    title = body.get("title", "")
    comment_body = body.get("body", "")
    parent_uri = body.get("parent")

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
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if parent_uri:
        record["parent"] = parent_uri

    # PDS failures raise PDSError → handled centrally (see core/fastapi.py).
    result = await pds_create_record(session, "app.ch.poltr.comment", record)
    return JSONResponse(status_code=200, content=result)


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.create
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.argument.create")
async def create_argument(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Create an argument record on the PDS."""
    body = await request.json()
    ballot_id = body.get("ballot")
    title = body.get("title", "")
    arg_body = body.get("body", "")
    arg_type = body.get("type")

    if not ballot_id:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "ballot ID required"},
        )
    if arg_type not in ("PRO", "CONTRA"):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "type must be PRO or CONTRA",
            },
        )
    if not title or not arg_body:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "title and body required"},
        )

    # Look up the governance DID for this ballot (via ballot_rkey = CMS ID)
    gov_did = await get_did_for_ballot(str(ballot_id))
    if not gov_did:
        return JSONResponse(
            status_code=404,
            content={
                "error": "not_found",
                "message": "No governance account for this ballot",
            },
        )

    record = {
        "$type": "app.ch.poltr.ballot.argument",
        "title": title,
        "body": arg_body,
        "type": arg_type,
        "ballot": ballot_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "$type": "app.ch.poltr.ballot.argument#sourceUser",
            "authorDid": session.did,
        },
    }

    # PDS failures raise PDSError → handled centrally (see core/fastapi.py).
    async with httpx.AsyncClient(timeout=30.0) as client:
        result = await create_governance_record(
            client, gov_did, "app.ch.poltr.ballot.argument", record
        )

    return JSONResponse(status_code=200, content=result)


# -----------------------------------------------------------------------------
# app.ch.poltr.content.rating / unrating
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.content.rating")
async def create_like(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Create/update a rating record on the PDS for the authenticated user.

    Generic content rating: `preference` is the user's preference on a canonical
    0–100 scale (a binary "like" is simply preference=100). Differing input
    scales (binary, 5-grade, 100) are normalised to 0–100 by the caller.

    The rating is written at a deterministic rkey derived from the subject, so
    re-rating the same content overwrites in place (idempotent) — independent of
    indexer lag. One rating per (user, subject).
    """
    body = await request.json()
    subject = body.get("subject")

    if not subject or not subject.get("uri") or not subject.get("cid"):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "subject.uri and subject.cid required",
            },
        )

    # Normalise/clamp preference to the canonical 0–100 range.
    try:
        preference = max(0, min(100, int(body.get("preference", 100))))
    except (TypeError, ValueError):
        preference = 100

    record = {
        "$type": "app.ch.poltr.content.rating",
        "subject": subject,
        "preference": preference,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    # Deterministic rkey = subject's rkey (a TID, unique per record), so a given
    # user has at most one rating per subject and re-rating is an in-place update.
    rkey = subject["uri"].rstrip("/").split("/")[-1]

    # PDS failures raise PDSError → handled centrally (see core/fastapi.py).
    result = await pds_put_record_session(
        session, "app.ch.poltr.content.rating", rkey, record
    )
    return JSONResponse(status_code=200, content=result)


@router.post("/app.ch.poltr.content.unrating")
async def delete_like(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Delete a like record from the PDS for the authenticated user."""
    body = await request.json()
    like_uri = body.get("likeUri")

    if not like_uri:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "likeUri required"},
        )

    # Extract rkey from AT-URI: at://did/collection/rkey
    parts = like_uri.split("/")
    rkey = parts[-1] if parts else None
    if not rkey:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "Could not extract rkey from likeUri",
            },
        )

    # Look up the bsky cross-like URI before deleting
    bsky_like_uri = None
    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT bsky_like_uri FROM app_likes WHERE uri = $1 AND did = $2",
                like_uri,
                session.did,
            )
            if row:
                bsky_like_uri = row["bsky_like_uri"]
    except Exception as err:
        logger.warning(f"Failed to look up bsky_like_uri (non-blocking): {err}")

    # PDS failures raise PDSError → handled centrally (see core/fastapi.py).
    await pds_delete_record(session, "app.ch.poltr.content.rating", rkey)

    # Best-effort delete the Bluesky cross-like
    if bsky_like_uri:
        try:
            bsky_rkey = bsky_like_uri.split("/")[-1]
            await pds_delete_record(session, "app.bsky.feed.like", bsky_rkey)
            logger.info(f"Bsky cross-like deleted: {bsky_like_uri}")
        except Exception as err:
            logger.warning(f"Bsky cross-like delete failed (non-blocking): {err}")

    return JSONResponse(status_code=200, content={"success": True})


# -----------------------------------------------------------------------------
# app.ch.poltr.activity.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.activity.list")
async def list_activity(
    request: Request,
    ballot_rkey: str = Query(...),
    filter: str = Query("all"),
    limit: int = Query(30),
    cursor: Optional[str] = Query(None),
    session: TSession = Depends(verify_session_token),
):
    """List activity feed for a ballot (comments, replies, new arguments, milestones)."""
    params: list = [ballot_rkey]  # $1

    viewer_did = session.did if session else None

    # Viewer context selects
    if viewer_did:
        params.append(viewer_did)
        vp = f"${len(params)}"
        viewer_like_select = (
            f"(SELECT uri FROM app_likes WHERE subject_uri = act.argument_uri"
            f" AND did = {vp} AND NOT deleted LIMIT 1) AS viewer_argument_like"
        )
        viewer_seen_select = (
            f"EXISTS(SELECT 1 FROM app_activity_seen WHERE activity_uri = act.activity_uri"
            f" AND did = {vp}) AS viewer_seen"
        )
    else:
        viewer_like_select = "NULL::text AS viewer_argument_like"
        viewer_seen_select = "false AS viewer_seen"

    # Outer WHERE conditions
    outer_conditions: list[str] = []
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor.replace("Z", "+00:00"))
            params.append(cursor_dt)
            outer_conditions.append(f"act.activity_at < ${len(params)}")
        except Exception:
            pass

    if filter == "comments":
        outer_conditions.append("act.activity_type IN ('comment', 'reply')")
    elif filter == "arguments":
        outer_conditions.append("act.activity_type IN ('new_argument', 'milestone')")

    outer_where = (
        ("WHERE " + " AND ".join(outer_conditions)) if outer_conditions else ""
    )

    params.append(limit)
    limit_param = f"${len(params)}"

    sql = f"""
        WITH activities AS (
            SELECT
                a.uri AS activity_uri,
                'new_argument'::text AS activity_type,
                a.created_at AS activity_at,
                a.uri AS argument_uri,
                a.author_did AS actor_did,
                a.title AS argument_title,
                a.body AS argument_body,
                a.type AS argument_type,
                a.like_count AS argument_like_count,
                a.comment_count AS argument_comment_count,
                a.review_status AS argument_review_status,
                a.rkey AS argument_rkey,
                NULL::text AS comment_uri,
                NULL::text AS comment_text,
                NULL::int AS comment_like_count,
                NULL::int AS comment_reply_count,
                NULL::text AS parent_uri,
                NULL::text AS parent_did,
                NULL::text AS parent_text,
                false AS parent_has_parent,
                NULL::int AS parent_like_count,
                NULL::int AS parent_reply_count
            FROM app_arguments a
            WHERE a.ballot_rkey = $1 AND NOT a.deleted AND a.review_status != 'rejected'

            UNION ALL

            SELECT
                'milestone:' || a.uri AS activity_uri,
                'milestone'::text AS activity_type,
                a.indexed_at AS activity_at,
                a.uri AS argument_uri,
                a.author_did AS actor_did,
                a.title AS argument_title,
                NULL::text AS argument_body,
                a.type AS argument_type,
                a.like_count AS argument_like_count,
                a.comment_count AS argument_comment_count,
                a.review_status AS argument_review_status,
                a.rkey AS argument_rkey,
                NULL::text AS comment_uri,
                NULL::text AS comment_text,
                NULL::int AS comment_like_count,
                NULL::int AS comment_reply_count,
                NULL::text AS parent_uri,
                NULL::text AS parent_did,
                NULL::text AS parent_text,
                false AS parent_has_parent,
                NULL::int AS parent_like_count,
                NULL::int AS parent_reply_count
            FROM app_arguments a
            -- "Community-bestätigt"-Meilenstein nur für User-Argumente, die das
            -- Begutachtungsverfahren durchlaufen haben. Offizielle/Organisations-
            -- Argumente sind per se 'approved' (kein Review) und dürfen daher
            -- keinen solchen Meilenstein erzeugen.
            WHERE a.ballot_rkey = $1 AND NOT a.deleted
              AND a.review_status = 'approved' AND a.source_type = 'user'

            UNION ALL

            SELECT
                c.uri AS activity_uri,
                'comment'::text AS activity_type,
                c.created_at AS activity_at,
                a.uri AS argument_uri,
                c.did AS actor_did,
                a.title AS argument_title,
                NULL::text AS argument_body,
                a.type AS argument_type,
                a.like_count AS argument_like_count,
                a.comment_count AS argument_comment_count,
                a.review_status AS argument_review_status,
                a.rkey AS argument_rkey,
                c.uri AS comment_uri,
                c.text AS comment_text,
                c.like_count AS comment_like_count,
                (SELECT count(*)::int FROM app_comments r WHERE r.parent_uri = c.uri AND NOT r.deleted) AS comment_reply_count,
                NULL::text AS parent_uri,
                NULL::text AS parent_did,
                NULL::text AS parent_text,
                false AS parent_has_parent,
                NULL::int AS parent_like_count,
                NULL::int AS parent_reply_count
            FROM app_comments c
            JOIN app_arguments a ON a.uri = c.argument_uri
            WHERE c.ballot_rkey = $1 AND NOT c.deleted AND c.parent_uri IS NULL AND c.origin = 'intern'

            UNION ALL

            SELECT
                c.uri AS activity_uri,
                'reply'::text AS activity_type,
                c.created_at AS activity_at,
                a.uri AS argument_uri,
                c.did AS actor_did,
                a.title AS argument_title,
                NULL::text AS argument_body,
                a.type AS argument_type,
                a.like_count AS argument_like_count,
                a.comment_count AS argument_comment_count,
                a.review_status AS argument_review_status,
                a.rkey AS argument_rkey,
                c.uri AS comment_uri,
                c.text AS comment_text,
                c.like_count AS comment_like_count,
                (SELECT count(*)::int FROM app_comments r WHERE r.parent_uri = c.uri AND NOT r.deleted) AS comment_reply_count,
                pc.uri AS parent_uri,
                pc.did AS parent_did,
                pc.text AS parent_text,
                (pc.parent_uri IS NOT NULL) AS parent_has_parent,
                pc.like_count AS parent_like_count,
                (SELECT count(*)::int FROM app_comments r WHERE r.parent_uri = pc.uri AND NOT r.deleted) AS parent_reply_count
            FROM app_comments c
            JOIN app_arguments a ON a.uri = c.argument_uri
            JOIN app_comments pc ON pc.uri = c.parent_uri
            WHERE c.ballot_rkey = $1 AND NOT c.deleted AND c.parent_uri IS NOT NULL AND c.origin = 'intern'
        )
        SELECT
            act.*,
            ap.display_name AS actor_display_name,
            ap.canton AS actor_canton,
            ap.color AS actor_color,
            pp.display_name AS parent_display_name,
            {viewer_like_select},
            {viewer_seen_select}
        FROM activities act
        LEFT JOIN app_profiles ap ON ap.did = act.actor_did
        LEFT JOIN app_profiles pp ON pp.did = act.parent_did
        {outer_where}
        ORDER BY act.activity_at DESC
        LIMIT {limit_param};
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        activities = []
        for r in rows:
            row = dict(r)
            activity_type = row.get("activity_type")
            activity_at_val = row.get("activity_at")
            activity_at_str = activity_at_val.isoformat() if activity_at_val else None

            actor_raw = {
                "did": get_string(row, "actor_did") or "",
                "displayName": get_string(row, "actor_display_name"),
                "canton": get_string(row, "actor_canton"),
                "color": get_string(row, "actor_color"),
            }
            actor = {k: v for k, v in actor_raw.items() if v is not None}

            argument_raw = {
                "uri": get_string(row, "argument_uri") or "",
                "rkey": get_string(row, "argument_rkey") or "",
                "title": get_string(row, "argument_title") or "",
                "body": get_string(row, "argument_body"),
                "type": get_string(row, "argument_type"),
                "likeCount": get_number(row, "argument_like_count"),
                "commentCount": get_number(row, "argument_comment_count"),
                "reviewStatus": get_string(row, "argument_review_status"),
            }
            argument = {k: v for k, v in argument_raw.items() if v is not None}

            item: dict = {
                "type": activity_type,
                "activityUri": get_string(row, "activity_uri") or "",
                "activityAt": activity_at_str,
                "actor": actor,
                "argument": argument,
            }

            if activity_type in ("comment", "reply") and row.get("comment_uri"):
                item["comment"] = {
                    "uri": row["comment_uri"],
                    "text": get_string(row, "comment_text") or "",
                    "likeCount": get_number(row, "comment_like_count") or 0,
                    "replyCount": get_number(row, "comment_reply_count") or 0,
                }

            if activity_type == "reply" and row.get("parent_uri"):
                parent_raw = {
                    "uri": row["parent_uri"],
                    "did": get_string(row, "parent_did") or "",
                    "displayName": get_string(row, "parent_display_name"),
                    "text": get_string(row, "parent_text") or "",
                    "hasParent": bool(row.get("parent_has_parent")),
                    "likeCount": get_number(row, "parent_like_count") or 0,
                    "replyCount": get_number(row, "parent_reply_count") or 0,
                }
                item["parent"] = {k: v for k, v in parent_raw.items() if v is not None}

            viewer_obj: dict = {}
            if row.get("viewer_argument_like"):
                viewer_obj["argumentLike"] = row["viewer_argument_like"]
            if row.get("viewer_seen"):
                viewer_obj["seen"] = True
            if viewer_obj:
                item["viewer"] = viewer_obj

            activities.append(item)

        next_cursor = None
        if activities and len(activities) == limit:
            last_at = activities[-1].get("activityAt")
            if last_at:
                next_cursor = last_at

        return JSONResponse(
            status_code=200,
            content={"activities": activities, "cursor": next_cursor},
        )
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.activity.markSeen
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.activity.markSeen")
async def mark_activity_seen(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Mark activity items as seen for the authenticated user."""
    body = await request.json()
    uris = body.get("uris", [])

    if not uris or not isinstance(uris, list):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "uris array required"},
        )

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            await conn.executemany(
                """
                INSERT INTO app_activity_seen (did, activity_uri, seen_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (did, activity_uri) DO NOTHING
                """,
                [(session.did, uri) for uri in uris if isinstance(uri, str)],
            )
        return JSONResponse(status_code=200, content={"success": True})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )
