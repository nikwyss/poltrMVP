"""
app.ch.poltr.* endpoints

Poltr-specific endpoints for Swiss civic tech features.
"""

import json
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.lib.fastapi import logger
from src.lib.db import get_pool
from src.lib.cursor import encode_cursor
from src.lib.lib import get_string, get_date_iso, get_number, get_array, get_object
from src.lib.atproto_api import pds_create_record, pds_delete_record

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

    governance_id = os.getenv("PDS_GOVERNANCE_ACCOUNT_DID")
    if governance_id:
        params.append(governance_id)
        where.append(f"b.did = ${len(params)}")

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

    governance_id = os.getenv("PDS_GOVERNANCE_ACCOUNT_DID")
    if governance_id:
        params.append(governance_id)
        where.append(f"b.did = ${len(params)}")

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
    limit: int = Query(100),
    session: TSession = Depends(verify_session_token),
):
    """List arguments for a ballot."""
    params = [ballot_rkey]

    viewer_did = session.did if session else None
    peer_review_on = os.getenv("PEER_REVIEW_ENABLED", "false").lower() == "true"

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
            review_filter = f"AND (a.review_status IN ('approved', 'preliminary') OR a.did = {viewer_param})"
        else:
            review_filter = ""
    else:
        viewer_select = ",\n            NULL AS viewer_like"
        if peer_review_on:
            review_filter = "AND a.review_status IN ('approved', 'preliminary')"
        else:
            review_filter = ""

    params.append(limit)
    sql = f"""
        SELECT a.*{viewer_select}
        FROM app_arguments a
        WHERE a.ballot_rkey = $1 AND NOT a.deleted
          {review_filter}
        ORDER BY a.type ASC, a.created_at ASC
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

            arg_raw = {
                "uri": get_string(row, "uri") or "",
                "cid": get_string(row, "cid") or "",
                "record": record,
                "author": {"did": get_string(row, "did") or ""},
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
