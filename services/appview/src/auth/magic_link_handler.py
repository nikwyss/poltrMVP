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
from src.auth.auth_email_guard import auth_email_capped, record_auth_email_sent

# Short code config: no ambiguous chars (0/O, 1/I/L)
SHORT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
SHORT_CODE_LENGTH = 6
MAX_FAILED_ATTEMPTS = 5

# Per-email send throttle (anti email-bombing), applied on top of the per-IP
# slowapi limit. At most MAX_SENDS_PER_EMAIL emails to one address per window.
# See doc/SECURITY_AUTH.md #2.
MAX_SENDS_PER_EMAIL = 10
SEND_WINDOW_MINUTES = 15

# Neutral response returned by sendMagicLink for ALL non-error outcomes (sent,
# throttled, or no such account) so the endpoint never reveals whether an
# account exists. See doc/SECURITY_AUTH.md #3.
def _neutral_send_response() -> JSONResponse:
    return JSONResponse(
        status_code=200,
        content={
            "success": True,
            "message": "If an account exists for this email, a sign-in link has been sent.",
        },
    )


def generate_short_code() -> str:
    return "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(SHORT_CODE_LENGTH))


def safe_return_url(url: str | None) -> str | None:
    """Only accept same-origin relative paths (open-redirect guard).

    The frontend later does router.push() on this value, so an absolute or
    protocol-relative URL (//evil.com) must never be stored. Auth/root paths are
    pointless to return to and would loop, so they are rejected too.
    """
    if not url or not isinstance(url, str):
        return None
    if not url.startswith("/") or url.startswith("//") or url.startswith("/\\"):
        return None
    if url == "/" or url.startswith("/auth/"):
        return None
    return url


class SendMagicLinkData(BaseModel):
    email: EmailStr
    returnUrl: str | None = None


class VerifyLoginMagicLinkData(BaseModel):
    token: str


class VerifyRegistrationMagicLinkData(BaseModel):
    token: str


class VerifyShortCodeData(BaseModel):
    email: EmailStr
    code: str
    purpose: Literal["login", "registration"] = "login"


async def send_magic_link_handler(data: SendMagicLinkData, locale: str = "de"):
    """Generate and send magic link to user's email"""
    try:
        if db.pool is None:
            print("Pool is None, initializing now...")
            await db.init_pool()
            print("Pool initialized successfully")

        email = data.email.lower()

        # Global hourly circuit breaker. Checked first and returns the neutral
        # response so it reveals nothing. See doc/SECURITY_AUTH.md #4.
        if await auth_email_capped():
            return _neutral_send_response()

        async with db.pool.acquire() as conn:
            # Per-email throttle: cap emails to one address per window. Checked
            # FIRST and returns the neutral response so it leaks nothing about
            # account existence. See doc/SECURITY_AUTH.md #2.
            recent_sends = await conn.fetchval(
                """
                SELECT count(*) FROM auth_pending_logins
                WHERE email = $1 AND created_at > now() - ($2 || ' minutes')::interval
                """,
                email,
                str(SEND_WINDOW_MINUTES),
            )
            if recent_sends >= MAX_SENDS_PER_EMAIL:
                return _neutral_send_response()

            # Only send to a real account, but return the SAME neutral response
            # either way so the endpoint never reveals whether one exists (#3).
            account = await conn.fetchrow(
                "SELECT 1 FROM auth_creds WHERE email = $1", email
            )
            if not account:
                return _neutral_send_response()

            # Generate secure random token and short code
            token = secrets.token_urlsafe(32)
            short_code = generate_short_code()
            return_url = safe_return_url(data.returnUrl)
            expires_at = datetime.utcnow() + timedelta(minutes=15)

            await conn.execute(
                """
                INSERT INTO auth_pending_logins (email, token, short_code, return_url, expires_at)
                VALUES ($1, $2, $3, $4, $5)
                """,
                email,
                token,
                short_code,
                return_url,
                expires_at,
            )

        # Send email with magic link and short code
        success = email_service.send_confirmation_link(
            email, token, purpose="login", short_code=short_code, locale=locale
        )

        if not success:
            return JSONResponse(
                status_code=500,
                content={"error": "email_failed", "message": "Failed to send email"},
            )

        await record_auth_email_sent("login")
        return _neutral_send_response()

    except Exception as e:
        print(f"Send magic link error: {e}")
        return JSONResponse(
            status_code=500, content={"error": "internal_error", "message": str(e)}
        )


async def verify_login_magic_link_handler(
    data: VerifyLoginMagicLinkData,
) -> JSONResponse | tuple[str, str | None] | None:
    """Verify magic link token and create session.

    Returns (email, return_url) on success — return_url is the path the user
    originally wanted (or None), so the route can hand it back to the frontend.
    """
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
            SELECT id, email, return_url, expires_at
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

        return email, row["return_url"]


async def verify_registration_magic_link_handler(
    data: VerifyRegistrationMagicLinkData,
) -> JSONResponse | tuple[str, str | None] | None:

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
            SELECT id, email, return_url, expires_at
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

        return email, row["return_url"]


async def verify_short_code_handler(
    data: VerifyShortCodeData,
) -> JSONResponse | tuple[str, str | None] | None:
    """Verify a 6-character short code for login or registration.

    Returns (email, return_url) on success.
    """
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
            f"DELETE FROM {table} WHERE id = $1 RETURNING email, return_url", row["id"]
        )
        return (result["email"], result["return_url"]) if result else None
