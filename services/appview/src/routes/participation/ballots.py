"""
app.ch.poltr.* endpoints

Poltr-specific endpoints for Swiss civic tech features.
"""

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
from src.participation.atproto_api import pds_create_record, pds_delete_record
from src.participation.governance import create_governance_record, get_did_for_ballot_uri

router = APIRouter(prefix="/xrpc", tags=["poltr"])


# -----------------------------------------------------------------------------
# Shared helpers
# -----------------------------------------------------------------------------


def _serialize_ballot(row: dict) -> dict:
    """Serialize a DB row from app_ballots into the API ballot shape."""
    # Parse record
    record = {}
    raw_record = get_object(row, "record")
    if raw_record:
        record = raw_record
    elif isinstance(row.get("record"), str):
        try:
            record = json.loads(row["record"])
        except Exception:
            record = {}
    else:
        raw_record_dict = {
            "$type": get_string(row, "record_type")
            or get_string(row, "type")
            or "app.ch.poltr.ballot.entry",
            "title": get_string(row, "title"),
            "description": get_string(row, "description"),
            "voteDate": get_date_iso(row, "vote_date"),
            "createdAt": get_date_iso(row, "created_at"),
            "deleted": bool(row.get("deleted")),
        }
        record = {k: v for k, v in raw_record_dict.items() if v is not None}

    # Parse author
    author_obj = get_object(row, "author")
    author_raw = {
        "did": get_string(row, "author_did")
        or get_string(row, "did")
        or (get_string(author_obj, "did") if author_obj else None),
        "handle": get_string(row, "author_handle")
        or get_string(row, "handle")
        or (get_string(author_obj, "handle") if author_obj else None),
        "displayName": (
            get_string(author_obj, "displayName") if author_obj else None
        )
        or get_string(row, "author_display_name"),
        "avatar": (get_string(author_obj, "avatar") if author_obj else None)
        or get_string(row, "author_avatar"),
        "labels": get_array(row, "author_labels")
        or (author_obj.get("labels", []) if author_obj else []),
        "viewer": (author_obj.get("viewer") if author_obj else None),
    }
    author = {k: v for k, v in author_raw.items() if v is not None}

    # Build viewer object
    viewer_obj = {}
    if row.get("viewer_like"):
        viewer_obj["like"] = row["viewer_like"]
    if not viewer_obj:
        viewer_obj = None

    # Build ballot entry
    ballot_raw = {
        "uri": get_string(row, "uri") or get_string(row, "row_uri") or "",
        "cid": get_string(row, "cid") or "",
        "author": author,
        "record": record,
        "indexedAt": get_date_iso(row, "indexed_at"),
        "likeCount": get_number(row, "like_count"),
        "argumentCount": get_number(row, "argument_count"),
        "commentCount": get_number(row, "comment_count"),
        "replyCount": get_number(row, "reply_count"),
        "bookmarkCount": get_number(row, "bookmark_count"),
        "labels": get_array(row, "labels"),
        "viewer": viewer_obj,
    }
    return {k: v for k, v in ballot_raw.items() if v is not None}


# -----------------------------------------------------------------------------
# app.ch.poltr.ballot.list
# -----------------------------------------------------------------------------


async def _get_ballots_handler(
    session: TSession, since: Optional[str] = None, limit: int = 50
):
    params = []
    where = ["b.deleted = false"]

    if since:
        try:
            since_date = datetime.fromisoformat(since.replace("Z", "+00:00"))
            params.append(since_date)
            where.append(f"b.vote_date >= ${len(params)}")
        except Exception:
            pass

    # viewer DID for the like subquery – return the like URI so the
    # frontend can delete it (unlike) without an extra round-trip.
    viewer_did = session.did if session else None
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = b.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like"""
    else:
        viewer_select = ",\n            NULL AS viewer_like"

    params.append(limit)
    sql = f"""
        SELECT b.*{viewer_select}
        FROM app_ballots b
        WHERE {' AND '.join(where)}
        ORDER BY b.vote_date DESC NULLS LAST, b.created_at DESC
        LIMIT ${len(params)};
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        ballots = [_serialize_ballot(dict(r)) for r in rows]

        last_indexed = ballots[-1].get("indexedAt", "") if ballots else ""
        cursor = (
            encode_cursor({"sort": "newest", "p": last_indexed, "r": ""})
            if ballots
            else None
        )

        return JSONResponse(
            status_code=200, content={"cursor": cursor, "ballots": ballots}
        )
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


@router.get("/app.ch.poltr.ballot.list")
async def list_ballots(
    request: Request,
    since: str = Query(None),
    limit: int = Query(50),
    session: TSession = Depends(verify_session_token),
):
    """List ballot entries."""
    return await _get_ballots_handler(session=session, since=since, limit=limit)


# -----------------------------------------------------------------------------
# app.ch.poltr.ballot.get
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.ballot.get")
async def get_ballot(
    request: Request,
    rkey: str = Query(...),
    session: TSession = Depends(verify_session_token),
):
    """Get a single ballot by rkey."""
    params = [rkey]
    where = ["b.deleted = false", "b.rkey = $1"]

    viewer_did = session.did if session else None
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = b.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like"""
    else:
        viewer_select = ",\n            NULL AS viewer_like"

    sql = f"""
        SELECT b.*{viewer_select}
        FROM app_ballots b
        WHERE {' AND '.join(where)}
        LIMIT 1;
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(sql, *params)

        if not row:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Ballot not found"},
            )

        ballot = _serialize_ballot(dict(row))
        return JSONResponse(status_code=200, content={"ballot": ballot})
    except Exception as err:
        logger.error(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )


# -----------------------------------------------------------------------------
# app.ch.poltr.argument.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.argument.list")
async def list_arguments(
    request: Request,
    ballot_rkey: str = Query(...),
    sort: str = Query("random"),
    type: Optional[str] = Query(None),
    limit: int = Query(100),
    session: TSession = Depends(verify_session_token),
):
    """List arguments for a ballot."""
    params = [ballot_rkey]

    viewer_did = session.did if session else None
    peer_review_on = os.getenv("PEER_REVIEW_ENABLED", "false").lower() == "true"

    # Type filter
    type_filter = ""
    if type in ("PRO", "CONTRA"):
        params.append(type)
        type_filter = f"AND a.type = ${len(params)}"

    # Filter: when peer review is enabled, show approved + preliminary;
    # show rejected only to the author. When disabled, show all.
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            (
                SELECT uri FROM app_likes
                WHERE subject_uri = a.uri AND did = {viewer_param} AND NOT deleted
                LIMIT 1
            ) AS viewer_like"""
        if peer_review_on:
            review_filter = f"AND (a.review_status IN ('approved', 'preliminary') OR a.author_did = {viewer_param})"
        else:
            review_filter = ""
    else:
        viewer_select = ",\n            NULL AS viewer_like"
        if peer_review_on:
            review_filter = "AND a.review_status IN ('approved', 'preliminary')"
        else:
            review_filter = ""

    # Sort order
    sort_map = {
        "top": "a.like_count DESC",
        "new": "a.created_at DESC",
        "discussed": "a.comment_count DESC",
        "random": "RANDOM()",
    }
    order_by = sort_map.get(sort, "RANDOM()")

    params.append(limit)
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
          {review_filter}
        ORDER BY {order_by}
        LIMIT ${len(params)};
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        arguments = []
        for r in rows:
            row = dict(r)

            record_raw = {
                "$type": "app.ch.poltr.ballot.argument",
                "title": get_string(row, "title"),
                "body": get_string(row, "body"),
                "type": get_string(row, "type"),
                "ballot": get_string(row, "ballot_uri"),
                "createdAt": get_date_iso(row, "created_at"),
            }
            record = {k: v for k, v in record_raw.items() if v is not None}

            viewer_obj = {}
            if row.get("viewer_like"):
                viewer_obj["like"] = row["viewer_like"]

            author_raw = {
                "did": get_string(row, "author_did") or "",
                "displayName": get_string(row, "author_display_name"),
                "canton": get_string(row, "author_canton"),
                "color": get_string(row, "author_color"),
            }
            author = {k: v for k, v in author_raw.items() if v is not None}

            arg_raw = {
                "uri": get_string(row, "uri") or "",
                "cid": get_string(row, "cid") or "",
                "record": record,
                "author": author,
                "likeCount": get_number(row, "like_count"),
                "commentCount": get_number(row, "comment_count"),
                "reviewStatus": get_string(row, "review_status") if peer_review_on else None,
                "indexedAt": get_date_iso(row, "indexed_at"),
                "viewer": viewer_obj if viewer_obj else None,
            }
            arg = {k: v for k, v in arg_raw.items() if v is not None}
            arguments.append(arg)

        return JSONResponse(status_code=200, content={"arguments": arguments})
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
        viewer_select = ",\n            NULL AS viewer_like"

    params.append(limit)
    sql = f"""
        SELECT c.*,
               p.display_name AS profile_display_name,
               p.canton AS profile_canton,
               p.color AS profile_color
               {viewer_select}
        FROM app_comments c
        LEFT JOIN app_profiles p ON p.did = c.did
        WHERE c.argument_uri = $1 AND NOT c.deleted
        ORDER BY c.like_count DESC, c.created_at ASC
        LIMIT ${len(params)};
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

    try:
        result = await pds_create_record(session, "app.ch.poltr.comment", record)
    except Exception as err:
        logger.error(f"Failed to create comment: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "pds_error", "message": str(err)},
        )

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
    ballot_uri = body.get("ballot")
    title = body.get("title", "")
    arg_body = body.get("body", "")
    arg_type = body.get("type")

    if not ballot_uri:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "ballot URI required"},
        )
    if arg_type not in ("PRO", "CONTRA"):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "type must be PRO or CONTRA"},
        )
    if not title or not arg_body:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "title and body required"},
        )

    # Validate ballot exists
    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT uri FROM app_ballots WHERE uri = $1 AND NOT deleted",
                ballot_uri,
            )
        if not row:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Ballot not found"},
            )
    except Exception as err:
        logger.error(f"DB lookup failed: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error", "details": str(err)},
        )

    # Look up the governance DID for this ballot
    gov_did = await get_did_for_ballot_uri(ballot_uri)
    if not gov_did:
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "message": "No governance account for this ballot"},
        )

    record = {
        "$type": "app.ch.poltr.ballot.argument",
        "title": title,
        "body": arg_body,
        "type": arg_type,
        "ballot": ballot_uri,
        "authorDid": session.did,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            result = await create_governance_record(
                client, gov_did, "app.ch.poltr.ballot.argument", record
            )
    except Exception as err:
        logger.error(f"Failed to create argument: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "pds_error", "message": str(err)},
        )

    return JSONResponse(status_code=200, content=result)


# -----------------------------------------------------------------------------
# app.ch.poltr.content.rating / unrating
# -----------------------------------------------------------------------------


async def _create_bsky_cross_like(session: TSession, ballot_uri: str):
    """Best-effort: create an app.bsky.feed.like on the Bluesky cross-post.

    Returns the bsky like URI on success, None on skip/failure.
    """
    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT bsky_post_uri, bsky_post_cid FROM app_ballots WHERE uri = $1",
                ballot_uri,
            )

        if not row or not row["bsky_post_uri"] or not row["bsky_post_cid"]:
            return None

        bsky_like_record = {
            "$type": "app.bsky.feed.like",
            "subject": {
                "uri": row["bsky_post_uri"],
                "cid": row["bsky_post_cid"],
            },
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }

        result = await pds_create_record(session, "app.bsky.feed.like", bsky_like_record)
        bsky_like_uri = result.get("uri")

        if bsky_like_uri:
            # Pre-populate bsky_like_uri so delete_like can find it later.
            # The indexer's upsert doesn't mention bsky_like_uri, so it won't overwrite.
            async with db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO app_likes (uri, cid, did, rkey, subject_uri, subject_cid, bsky_like_uri, created_at)
                    VALUES ($1, '', $2, '', $3, '', $4, now())
                    ON CONFLICT (uri) DO UPDATE SET bsky_like_uri = $4
                    """,
                    f"pending:{session.did}:{ballot_uri}",
                    session.did,
                    ballot_uri,
                    bsky_like_uri,
                )

        logger.info(f"Bsky cross-like created: {bsky_like_uri}")
        return bsky_like_uri
    except Exception as err:
        logger.warning(f"Bsky cross-like failed (non-blocking): {err}")
        return None


@router.post("/app.ch.poltr.content.rating")
async def create_like(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Create a like record on the PDS for the authenticated user."""
    body = await request.json()
    subject = body.get("subject")

    if not subject or not subject.get("uri") or not subject.get("cid"):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "subject.uri and subject.cid required"},
        )

    record = {
        "$type": "app.ch.poltr.content.rating",
        "subject": subject,
        "preference": body.get("preference", 100),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    try:
        result = await pds_create_record(session, "app.ch.poltr.content.rating", record)
    except Exception as err:
        logger.error(f"Failed to create like: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "pds_error", "message": str(err)},
        )

    # Best-effort cross-like to Bluesky
    await _create_bsky_cross_like(session, subject["uri"])

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
            content={"error": "invalid_request", "message": "Could not extract rkey from likeUri"},
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

    try:
        await pds_delete_record(session, "app.ch.poltr.content.rating", rkey)
    except Exception as err:
        logger.error(f"Failed to delete like: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "pds_error", "message": str(err)},
        )

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

    outer_where = ("WHERE " + " AND ".join(outer_conditions)) if outer_conditions else ""

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
            WHERE a.ballot_rkey = $1 AND NOT a.deleted AND a.review_status = 'approved'

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
            activity_at_str = (
                activity_at_val.isoformat() if activity_at_val else None
            )

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
