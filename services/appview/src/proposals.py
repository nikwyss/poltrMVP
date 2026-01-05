import json
from typing import Optional
from datetime import datetime
from fastapi.responses import JSONResponse
from src.db import get_pool
from src.cursor import encode_cursor
from src.lib import get_string, get_date_iso, get_number, get_array, get_object


async def get_proposals_handler(
    did: Optional[str] = None, since: Optional[str] = None, limit: int = 50
):
    params = []
    where = ["deleted = false"]

    if did:
        params.append(did)
        where.append(f"did = ${len(params)}")

    if since:
        try:
            since_date = datetime.fromisoformat(since.replace("Z", "+00:00"))
            params.append(since_date)
            where.append(f"vote_date >= ${len(params)}")
        except:
            pass

    params.append(limit)
    sql = f"""
        SELECT *
        FROM poltr_vote_proposal
        WHERE {' AND '.join(where)}
        ORDER BY vote_date DESC NULLS LAST, created_at DESC
        LIMIT ${len(params)};
    """

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(sql, *params)

        proposals = []
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
                except:
                    record = {}
            else:
                raw_record_dict = {
                    "$type": get_string(row, "record_type")
                    or get_string(row, "type")
                    or "app.ch.poltr.vote.proposal",
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

            # Build proposal
            proposal_raw = {
                "uri": get_string(row, "uri") or get_string(row, "row_uri") or "",
                "cid": get_string(row, "cid") or "",
                "author": author,
                "record": record,
                "indexedAt": get_date_iso(row, "indexed_at"),
                "likeCount": get_number(row, "like_count"),
                "replyCount": get_number(row, "reply_count"),
                "bookmarkCount": get_number(row, "bookmark_count"),
                "labels": get_array(row, "labels"),
                "viewer": row.get("viewer"),
            }
            proposal = {k: v for k, v in proposal_raw.items() if v is not None}
            proposals.append(proposal)

        last_indexed = proposals[-1].get("indexedAt", "") if proposals else ""
        cursor = (
            encode_cursor({"sort": "newest", "p": last_indexed, "r": ""})
            if proposals
            else None
        )

        return JSONResponse(
            status_code=200, content={"cursor": cursor, "proposals": proposals}
        )
    except Exception as err:
        print(f"DB query failed: {err}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "details": str(err)}
        )
