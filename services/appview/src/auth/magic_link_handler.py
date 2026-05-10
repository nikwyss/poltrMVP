import hmac
import secrets
import json
import os
from datetime import datetime, timedelta
from typing import Literal
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr
import src.core.db as db
from src.core.email_service import email_service

# Short code config: no ambiguous chars (0/O, 1/I/L)
SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
SHORT_CODE_LENGTH = 6
MAX_FAILED_ATTEMPTS = 5


def generate_short_code() -> str:
    return "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(SHORT_CODE_LENGTH))


class SendMagicLinkData(BaseModel):
    email: EmailStr


class VerifyLoginMagicLinkData(BaseModel):
    token: str


class VerifyRegistrationMagicLinkData(BaseModel):
    token: str


class VerifyShortCodeData(BaseModel):
    email: EmailStr
    code: str
    purpose: Literal["login", "registration"] = "login"


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

        # Generate secure random token and short code
        token = secrets.token_urlsafe(32)
        short_code = generate_short_code()

        # Set expiration to 15 minutes from now
        expires_at = datetime.utcnow() + timedelta(minutes=15)

        # Store token in database
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO auth_pending_logins (email, token, short_code, expires_at)
                VALUES ($1, $2, $3, $4)
                """,
                email,
                token,
                short_code,
                expires_at,
            )

        # Send email with magic link and short code
        success = email_service.send_confirmation_link(
            email, token, purpose="login", short_code=short_code
        )

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


async def verify_short_code_handler(
    data: VerifyShortCodeData,
) -> JSONResponse | str | None:
    """Verify a 6-character short code for login or registration."""
    if db.pool is None:
        await db.init_pool()

    code = data.code.upper().strip()
    email = data.email.lower()
    table = "auth_pending_logins" if data.purpose == "login" else "auth_pending_registrations"

    async with db.pool.acquire() as conn:
        # Atomic increment and return — prevents race conditions
        row = await conn.fetchrow(
            f"""
            UPDATE {table}
            SET failed_attempts = failed_attempts + 1
            WHERE email = $1 AND short_code IS NOT NULL AND expires_at > now()
            RETURNING id, short_code, failed_attempts
            """,
            email,
        )

        if not row:
            return JSONResponse(
                status_code=400,
                content={"error": "invalid_code", "message": "Invalid or expired code"},
            )

        # Check if too many attempts (already incremented)
        if row["failed_attempts"] > MAX_FAILED_ATTEMPTS:
            await conn.execute(f"DELETE FROM {table} WHERE id = $1", row["id"])
            return JSONResponse(
                status_code=400,
                content={"error": "too_many_attempts", "message": "Too many failed attempts. Please request a new code."},
            )

        # Constant-time comparison
        if not hmac.compare_digest(row["short_code"].upper(), code):
            remaining = MAX_FAILED_ATTEMPTS - row["failed_attempts"]
            if remaining <= 0:
                await conn.execute(f"DELETE FROM {table} WHERE id = $1", row["id"])
            return JSONResponse(
                status_code=400,
                content={
                    "error": "invalid_code",
                    "message": "Invalid code",
                    "remaining_attempts": max(remaining, 0),
                },
            )

        # Success — delete row (invalidates both magic link and short code)
        result = await conn.fetchrow(
            f"DELETE FROM {table} WHERE id = $1 RETURNING email", row["id"]
        )
        return result["email"] if result else None
