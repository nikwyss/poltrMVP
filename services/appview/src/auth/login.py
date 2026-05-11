"""
User login and session management.

Login is a pure AppView operation — no PDS call needed.
The PDS access token is obtained lazily on the first record write.
"""

import json
import logging
import os
import secrets
from datetime import datetime, timedelta

from fastapi.responses import JSONResponse

import src.core.db as db
from src.auth.middleware import hash_token

APPVIEW_SESSION_LIFETIME_DAYS = int(os.getenv("APPVIEW_SESSION_LIFETIME_DAYS", "7"))

logger = logging.getLogger(__name__)


async def login_account(user_email: str) -> JSONResponse:
    """Log in an existing user. Pure AppView operation — no PDS call needed."""
    if db.pool is None:
        await db.init_pool()

    logger.debug(f"Attempting to log in user with email: {user_email}")

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT did, handle FROM auth_creds WHERE email = $1",
            user_email,
        )

    if not row:
        return JSONResponse(
            status_code=404,
            content={
                "error": "user_not_found",
                "message": "No account found for this email",
            },
        )

    response = await create_session_cookie(did=row["did"], handle=row["handle"])
    logger.debug(f"Login successful for {user_email}")
    return response


async def create_session_cookie(
    did: str,
    handle: str,
    display_name: str | None = None,
) -> JSONResponse:
    """Create a session and set the httpOnly cookie."""
    session_token = secrets.token_urlsafe(48)
    session_token_hash = hash_token(session_token)
    session_expires = datetime.utcnow() + timedelta(days=APPVIEW_SESSION_LIFETIME_DAYS)

    user_data = {
        "did": did,
        "handle": handle,
        "displayName": display_name or handle.split(".")[0],
    }

    # Store the hash in DB, send the original in the cookie
    async with db.pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO auth_sessions (session_token, did, user_data, expires_at)
            VALUES ($1, $2, $3, $4)
            """,
            session_token_hash,
            did,
            json.dumps(user_data),
            session_expires,
        )

    response = JSONResponse(
        status_code=200,
        content={
            "success": True,
            "user": user_data,
            "session_token": session_token,
            "expires_at": session_expires.isoformat(),
        },
    )

    is_production = os.getenv("ENVIRONMENT", "development") == "production"
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=is_production,
        samesite="lax",
        max_age=APPVIEW_SESSION_LIFETIME_DAYS * 24 * 60 * 60,
        path="/",
    )

    return response


async def check_email_availability(email: str) -> bool:
    """Check if an email is not yet registered. True = available."""
    if db.pool is None:
        await db.init_pool()

    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT email FROM auth_creds WHERE email = $1",
            email,
        )
        return row is None
