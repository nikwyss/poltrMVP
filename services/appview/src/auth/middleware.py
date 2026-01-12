import json
from datetime import datetime
from fastapi import Header, HTTPException, Cookie
from typing import Optional

from pydantic import BaseModel
import src.lib.db as db


class TSession(BaseModel):
    token: str
    did: str
    user: dict
    access_token: str
    refresh_token: str
    pass


async def verify_session_token(
    authorization: Optional[str] = Header(None),
    session_token: Optional[str] = Cookie(None),
) -> TSession:
    """Verify session token from Cookie or Authorization header"""

    print(f"Auth header: {authorization}")
    print(f"Session cookie: {session_token}")

    # Try cookie first (more secure), then Authorization header (for API clients)
    token = session_token or (
        authorization.replace("Bearer ", "")
        if authorization and authorization.startswith("Bearer ")
        else None
    )

    if not token:
        raise HTTPException(status_code=401, detail="No authentication token provided")

    # Validate token against database
    if db.pool is None:
        await db.init_pool()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT session_token, did, user_data, expires_at, last_accessed_at, access_token, refresh_token
            FROM sessions
            WHERE session_token = $1
            """,
            token,
        )

        if not row:
            raise HTTPException(status_code=401, detail="Invalid session token")

        # Check if session expired
        if datetime.utcnow() > row["expires_at"]:
            # Clean up expired session
            await conn.execute("DELETE FROM sessions WHERE session_token = $1", token)
            raise HTTPException(status_code=401, detail="Session expired")

        # Update last accessed time
        await conn.execute(
            """
            UPDATE sessions
            SET last_accessed_at = NOW()
            WHERE session_token = $1
            """,
            token,
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
                "did": row["did"],
                "user": user_data,
                "access_token": row["access_token"],
                "refresh_token": row["refresh_token"],
            }
        )
