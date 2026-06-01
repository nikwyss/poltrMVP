"""
XRPC routes for likes/ratings: content.rating, content.unrating.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from src.atproto.atproto_api import pds_delete_record, pds_put_record_session
from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger

router = APIRouter(prefix="/xrpc", tags=["poltr-likes"])


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

    rkey = subject["uri"].rstrip("/").split("/")[-1]

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

    await pds_delete_record(session, "app.ch.poltr.content.rating", rkey)

    if bsky_like_uri:
        try:
            bsky_rkey = bsky_like_uri.split("/")[-1]
            await pds_delete_record(session, "app.bsky.feed.like", bsky_rkey)
            logger.info(f"Bsky cross-like deleted: {bsky_like_uri}")
        except Exception as err:
            logger.warning(f"Bsky cross-like delete failed (non-blocking): {err}")

    return JSONResponse(status_code=200, content={"success": True})
