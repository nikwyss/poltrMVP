import time
from fastapi import Depends, Request
from fastapi.responses import JSONResponse
from src.auth.login import check_email_availability, create_account, login_pds_account
from src.auth.middleware import TSession, verify_session_token
import src.lib.db as db
from src.auth.magic_link_handler import (
    VerifyLoginMagicLinkData,
    VerifyRegistrationMagicLinkData,
    send_magic_link_handler,
    verify_login_magic_link_handler,
    SendMagicLinkData,
    verify_registration_magic_link_handler,
)
from src.lib.atproto_api import pds_api_create_app_password, set_birthdate_on_bluesky
from src.lib.fastapi import app, limiter


@app.post("/auth/send-magic-link")
@limiter.limit("5/minute")  # Max 5 requests per minute per IP
async def send_magic_link(request: Request, data: SendMagicLinkData):
    """Send magic link to user's email"""
    return await send_magic_link_handler(data)


# Also accept GET /verify?token=... for browser magic link clicks
@app.post("/auth/verify_login")
@limiter.limit("10/minute")
async def verify_magic_link_get(request: Request, data: VerifyLoginMagicLinkData):
    """Verify magic link token and create session (GET via email link) (NEW)"""

    response: str | JSONResponse | None = await verify_login_magic_link_handler(data)

    if isinstance(response, JSONResponse):
        return response

    if response is None:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_token", "message": "Invalid token"},
        )

    return await login_pds_account(user_email=response)


@app.post("/auth/register")
@limiter.limit("10/minute")
async def register(request: Request):
    """Accept an email and send confirmation link before creating account."""
    body = await request.json()
    email = body.get("email")
    if not email:
        return JSONResponse(status_code=400, content={"message": "email required"})

    # generate confirmation token
    import secrets
    from datetime import datetime, timedelta

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    if not check_email_availability(email=email):
        return JSONResponse(
            status_code=400,
            content={
                "error": "email_taken",
                "message": "An account with this email already exists",
            },
        )

    # store pending registration
    try:
        # ensure pool initialized
        if db.pool is None:
            ok = await db.check_db_connection()
            if not ok:
                return JSONResponse(
                    status_code=500, content={"message": "DB connection failed"}
                )
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO pending_registrations (email, token, expires_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (email) DO UPDATE SET token = EXCLUDED.token, expires_at = EXCLUDED.expires_at
                """,
                email,
                token,
                expires_at,
            )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Failed to store pending registration: {e}"},
        )

    # send confirmation email
    try:
        from src.lib.email_service import email_service

        success = email_service.send_confirmation_link(
            email, token, purpose="registration"
        )
        if not success:
            return JSONResponse(
                status_code=500,
                content={"message": "Failed to send confirmation email"},
            )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Failed to send confirmation email: {e}"},
        )

    return JSONResponse(status_code=200, content={"message": "Confirmation email sent"})


@app.post("/auth/verify_registration")
@limiter.limit("10/minute")
async def confirm_registration(request: Request, data: VerifyRegistrationMagicLinkData):
    """Finalize registration when user clicks confirmation link."""
    # validate token

    response: str | JSONResponse | None = await verify_registration_magic_link_handler(
        data
    )

    if isinstance(response, JSONResponse):
        return response

    if response is None:

        return JSONResponse(
            status_code=400,
            content={"error": "invalid_token", "message": "Invalid token"},
        )

    if not check_email_availability(email=response):
        return JSONResponse(
            status_code=400,
            content={
                "error": "email_taken",
                "message": "An account with this email already exists",
            },
        )

    return await create_account(user_email=response)


@app.post("/auth/create-app-password")
@limiter.limit("5/minute")
async def create_app_password(
    request: Request, session: TSession = Depends(verify_session_token)
):
    """Create an app password for use with Bluesky clients."""
    try:
        # Set birthDate on Bluesky (for age verification compatibility)
        await set_birthdate_on_bluesky(session)

        result = await pds_api_create_app_password(
            session, f"poltr-{int(time.time())}"
        )
        return JSONResponse(content=result.model_dump())
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "app_password_failed", "message": str(e)},
        )
