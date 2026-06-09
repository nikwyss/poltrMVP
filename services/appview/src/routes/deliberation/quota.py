"""Per-user content-creation quotas for arguments and comments.

Two caps per (user, ballot), both **append-only** (deletions do not refund):
  * daily  — rolling 24h
  * ballot — lifetime on that ballot

Counts come from the `app_content_creations` ledger, written *synchronously* by
the create handlers — race-free, unlike the indexer-populated
`app_arguments`/`app_comments` (which lag the firehose). All four limits are
env-tunable.
"""

import os
import hashlib

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.core.fastapi import logger

ARGUMENT_DAILY_LIMIT = int(os.getenv("APPVIEW_ARGUMENT_DAILY_LIMIT", "2"))
ARGUMENT_BALLOT_LIMIT = int(os.getenv("APPVIEW_ARGUMENT_BALLOT_LIMIT", "10"))
COMMENT_DAILY_LIMIT = int(os.getenv("APPVIEW_COMMENT_DAILY_LIMIT", "10"))
COMMENT_BALLOT_LIMIT = int(os.getenv("APPVIEW_COMMENT_BALLOT_LIMIT", "50"))

# kind -> (daily_limit, ballot_limit)
LIMITS = {
    "argument": (ARGUMENT_DAILY_LIMIT, ARGUMENT_BALLOT_LIMIT),
    "comment": (COMMENT_DAILY_LIMIT, COMMENT_BALLOT_LIMIT),
}

router = APIRouter(prefix="/xrpc", tags=["poltr-quota"])


class QuotaExceeded(Exception):
    """Raised by reserve() when a create would exceed a per-(user, ballot) cap."""

    def __init__(self, kind: str, scope: str, limit: int, used: int):
        self.kind = kind
        self.scope = scope  # 'daily' | 'ballot'
        self.limit = limit
        self.used = used
        super().__init__(f"{kind} {scope} quota exceeded ({used}/{limit})")

    def response(self) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={
                "error": "quota_exceeded",
                "kind": self.kind,
                "scope": self.scope,
                "limit": self.limit,
            },
        )


def _lock_key(did: str, kind: str, ballot_rkey: str) -> int:
    """Stable signed 64-bit key for pg_advisory_xact_lock, so the count+insert is
    serialized per (user, kind, ballot) against concurrent creates."""
    digest = hashlib.blake2b(
        f"{did}|{kind}|{ballot_rkey}".encode(), digest_size=8
    ).digest()
    return int.from_bytes(digest, "big", signed=True)


async def reserve(did: str, kind: str, ballot_rkey: str) -> int:
    """Atomically enforce both caps and insert a ledger row.

    Raises QuotaExceeded if a cap is hit. Returns the new row id — pass it to
    release() if the subsequent PDS write fails. The advisory lock makes the
    check-then-insert safe against concurrent creates by the same user.
    """
    daily_limit, ballot_limit = LIMITS[kind]
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT pg_advisory_xact_lock($1)", _lock_key(did, kind, ballot_rkey)
            )
            daily_used = await conn.fetchval(
                """
                SELECT count(*) FROM app_content_creations
                WHERE did = $1 AND kind = $2 AND ballot_rkey = $3
                  AND created_at > now() - interval '24 hours'
                """,
                did, kind, ballot_rkey,
            )
            if daily_used >= daily_limit:
                raise QuotaExceeded(kind, "daily", daily_limit, daily_used)
            ballot_used = await conn.fetchval(
                "SELECT count(*) FROM app_content_creations WHERE did = $1 AND kind = $2 AND ballot_rkey = $3",
                did, kind, ballot_rkey,
            )
            if ballot_used >= ballot_limit:
                raise QuotaExceeded(kind, "ballot", ballot_limit, ballot_used)
            return await conn.fetchval(
                "INSERT INTO app_content_creations (did, kind, ballot_rkey) VALUES ($1, $2, $3) RETURNING id",
                did, kind, ballot_rkey,
            )


async def release(row_id: int) -> None:
    """Undo a reservation (best-effort) when the PDS write fails."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM app_content_creations WHERE id = $1", row_id)
    except Exception as e:
        logger.error("quota.release failed for row %s: %s", row_id, e)


async def set_uri(row_id: int, uri: str | None) -> None:
    """Record the resulting record URI on the ledger row (best-effort; used for
    reconciliation and idempotent backfill)."""
    if not uri:
        return
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE app_content_creations SET uri = $2 WHERE id = $1", row_id, uri
            )
    except Exception as e:
        logger.error("quota.set_uri failed for row %s: %s", row_id, e)


def _block(counts: dict, kind: str) -> dict:
    daily_used, ballot_used = counts.get(kind, (0, 0))
    daily_limit, ballot_limit = LIMITS[kind]
    return {
        "dailyUsed": daily_used,
        "dailyLimit": daily_limit,
        "ballotUsed": ballot_used,
        "ballotLimit": ballot_limit,
    }


async def get_usage(did: str, ballot_rkey: str) -> dict:
    """Current usage + limits for a user on a ballot, for both kinds."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT kind,
                   count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS daily,
                   count(*) AS total
            FROM app_content_creations
            WHERE did = $1 AND ballot_rkey = $2
            GROUP BY kind
            """,
            did, ballot_rkey,
        )
    counts = {r["kind"]: (r["daily"], r["total"]) for r in rows}
    return {"arguments": _block(counts, "argument"), "comments": _block(counts, "comment")}


@router.get("/app.ch.poltr.quota.get")
async def quota_get(
    request: Request,
    ballot: str = Query(..., description="Ballot rkey (CMS ID)"),
    session: TSession = Depends(verify_session_token),
):
    """Current user's creation-quota usage for a ballot (arguments + comments)."""
    return JSONResponse(content=await get_usage(session.did, str(ballot)))
