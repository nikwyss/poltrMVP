"""
XRPC routes for the activity feed: activity.list, activity.markSeen.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger
from src.core.lib import get_number, get_string

router = APIRouter(prefix="/xrpc", tags=["poltr-activity"])


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
    params: list = [ballot_rkey]

    viewer_did = session.did if session else None

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
            -- Begutachtungsverfahren durchlaufen haben.
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
