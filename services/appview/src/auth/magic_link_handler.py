import secrets
import json
import os
from datetime import datetime, timedelta
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
import src.lib.db as db
from src.lib.email_service import email_service


class SendMagicLinkData(BaseModel):
    email: EmailStr


class VerifyLoginMagicLinkData(BaseModel):
    token: str


class VerifyRegistrationMagicLinkData(BaseModel):
    token: str


async def send_magic_link_handler(data: SendMagicLinkData):
    """Generate and send magic link to user's email"""
    try:
        if db.pool is None:
            print("Pool is None, initializing now...")
            await db.init_pool()
            print("Pool initialized successfully")

        email = data.email.lower()

        # Check that account exists before sending a magic link
        async with db.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT 1 FROM auth_creds WHERE email = $1", email
            )
            if not row:
                return JSONResponse(
                    status_code=404,
                    content={
                        "error": "user_not_found",
                        "message": "No account found for this email",
                    },
                )

        # Generate secure random token
        token = secrets.token_urlsafe(32)

        # Set expiration to 15 minutes from now
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        # Store token in database
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO auth_pending_logins (email, token, expires_at)
                VALUES ($1, $2, $3)
                """,
                email,
                token,
                expires_at,
            )

        # Send email
        # success = email_service.send_magic_link(email, token)

        success = email_service.send_confirmation_link(email, token, purpose="login")

        # send_magic_link

        if not success:
            return JSONResponse(
                status_code=500,
                content={"error": "email_failed", "message": "Failed to send email"},
            )

        return JSONResponse(
            status_code=200,
            content={"success": True, "message": "Magic link sent to your email"},
        )

    except Exception as e:
        print(f"Send magic link error: {e}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "message": str(e)}
        )


async def verify_login_magic_link_handler(
    data: VerifyLoginMagicLinkData,
) -> JSONResponse | str | None:
    """Verify magic link token and create session"""
    if db.pool is None:
        print("Pool is None, initializing now...")
        await db.init_pool()
        print("Pool initialized successfully")

    token = data.token
    print(f"Verifying token: {token}")

    async with db.pool.acquire() as conn:
        # Find token
        row = await conn.fetchrow(
            """
            SELECT id, email, expires_at
            FROM auth_pending_logins
            WHERE token = $1
            """,
            token,
        )

        print(f"Database lookup result: {row}")

        if not row:
            print(f"Token not found in database: {token}")
            return JSONResponse(
                status_code=400,
                content={
                    "error": "invalid_token",
                    "message": "Invalid or expired token",
                },
            )

        # Check if expired
        if datetime.utcnow() > row["expires_at"]:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "token_expired",
                    "message": "This link has expired",
                },
            )

        email = row["email"]

        # Delete pending login
        await conn.execute("DELETE FROM auth_pending_logins WHERE id = $1", row["id"])

        return email


async def verify_registration_magic_link_handler(
    data: VerifyRegistrationMagicLinkData,
) -> JSONResponse | str | None:

    # ensure pool initialized
    if db.pool is None:
        ok = await db.check_db_connection()
        if not ok:
            return JSONResponse(
                status_code=500, content={"message": "DB connection failed"}
            )

    token = data.token
    async with db.pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, expires_at
            FROM auth_pending_registrations
            WHERE token = $1
            """,
            token,
        )
        if not row:
            return JSONResponse(
                status_code=400, content={"message": "Invalid or expired token"}
            )

        if datetime.utcnow() > row["expires_at"]:
            return JSONResponse(status_code=400, content={"message": "Token expired"})

        email = row["email"]

        # delete pending registration
        await conn.execute("DELETE FROM auth_pending_registrations WHERE id = $1", row["id"])

        return email
