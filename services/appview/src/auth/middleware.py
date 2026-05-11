import hashlib
import json
import os
from datetime import datetime, timedelta
from fastapi import Header, HTTPException, Cookie
from typing import Optional

from pydantic import BaseModel
import src.core.db as db


def hash_token(token: str) -> str:
    """SHA-256 hash of a session token. DB stores the hash, cookie has the original."""
    return hashlib.sha256(token.encode()).hexdigest()


class TSession(BaseModel):
    token: str          # original token (for cookie references)
    token_hash: str     # SHA-256 hash (for DB queries)
    did: str
    user: dict
    access_token: str = ""  # populated lazily from in-memory cache


async def verify_session_token(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
) -> TSession:
    """Verify session token from Cookie or Authorization header."""

    # Try cookie first (more secure), then Authorization header (for API clients)
    token = session_token or (
        authorization.replace("Bearer ", "")
        if authorization and authorization.startswith("Bearer ")
        else None
    )

    if not token:
        raise HTTPException(status_code=401, detail="No authentication token provided")

    token_hashed = hash_token(token)

    if db.pool is None:
        await db.init_pool()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT session_token, did, user_data, expires_at, last_accessed_at
            FROM auth_sessions
            WHERE session_token = $1
            """,
            token_hashed,
        )

        if not row:
            raise HTTPException(status_code=401, detail="Invalid session token")

        # Check if session expired
        if datetime.utcnow() > row["expires_at"]:
            await conn.execute(
                "DELETE FROM auth_sessions WHERE session_token = $1", token_hashed
            )
            raise HTTPException(status_code=401, detail="Session expired")

        # Update last accessed time and extend session (sliding window)
        session_lifetime_days = int(os.getenv("APPVIEW_SESSION_LIFETIME_DAYS", "7"))
        await conn.execute(
            """
            UPDATE auth_sessions
            SET last_accessed_at = NOW(),
                expires_at = NOW() + $2 * INTERVAL '1 day'
            WHERE session_token = $1
            """,
            token_hashed,
            session_lifetime_days,
        )

        # Parse user data
        user_data = (
            json.loads(row["user_data"])
            if isinstance(row["user_data"], str)
            else row["user_data"]
        )

        return TSession(
            **{
                "token": token,
                "token_hash": token_hashed,
                "did": row["did"],
                "user": user_data,
            }
        )
