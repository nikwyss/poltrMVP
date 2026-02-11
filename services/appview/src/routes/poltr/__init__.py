"""
app.ch.poltr.* endpoints

Poltr-specific endpoints for Swiss civic tech features.
"""

import json
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.lib.fastapi import logger
from src.lib.db import get_pool
from src.lib.cursor import encode_cursor
from src.lib.lib import get_string, get_date_iso, get_number, get_array, get_object

router = APIRouter(prefix="/xrpc", tags=["poltr"])


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

    # viewer DID for the liked subquery
    viewer_did = session.did if session else None
    if viewer_did:
        params.append(viewer_did)
        viewer_param = f"${len(params)}"
        viewer_select = f""",
            EXISTS(
                SELECT 1 FROM app_likes
                WHERE subject_uri = b.uri AND did = {viewer_param} AND NOT deleted
            ) AS viewer_liked"""
    else:
        viewer_select = ",\n            false AS viewer_liked"

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

        ballots = []
        for r in rows:
            row = dict(r)

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
            if row.get("viewer_liked"):
                viewer_obj["liked"] = True
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
            ballot = {k: v for k, v in ballot_raw.items() if v is not None}
            ballots.append(ballot)

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
