"""
ch.poltr.auth.* endpoints

Authentication endpoints for magic link login, registration, app passwords,
and E-ID verification.
"""

import os
import time
import httpx
from fastapi import APIRouter, Depends, Request
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
from src.lib.atproto_api import pds_create_app_password, pds_set_birthdate
from src.lib.fastapi import limiter

EIDPROTO_URL = os.getenv("EIDPROTO_URL", "https://eidproto.poltr.info")
FRONTEND_URL = os.getenv("APPVIEW_FRONTEND_URL", "https://poltr.ch")
APP_PASSWORD_ENABLED = os.getenv("APPVIEW_APP_PASSWORD_ENABLED", "false").lower() == "true"

router = APIRouter(prefix="/xrpc", tags=["auth"])


@router.post("/ch.poltr.auth.sendMagicLink")
@limiter.limit("5/minute")
async def send_magic_link(request: Request, data: SendMagicLinkData):
    """Send magic link to user's email"""
    return await send_magic_link_handler(data)


@router.post("/ch.poltr.auth.verifyLogin")
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


@router.post("/ch.poltr.auth.register")
@limiter.limit("10/minute")
async def register(request: Request):
    """Accept an email and send confirmation link before creating account."""
    body = await request.json()
    email = body.get("email")
    if not email:
        return JSONResponse(status_code=400, content={"message": "email required"})

    import secrets
    from datetime import datetime, timedelta

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=30)

    if not await check_email_availability(email=email):
        return JSONResponse(
            status_code=400,
            content={
                "error": "email_taken",
                "message": "An account with this email already exists",
            },
        )

    try:
        if db.pool is None:
            ok = await db.check_db_connection()
            if not ok:
                return JSONResponse(
                    status_code=500, content={"message": "DB connection failed"}
                )
        async with db.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO auth_pending_registrations (email, token, expires_at)
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


@router.post("/ch.poltr.auth.verifyRegistration")
@limiter.limit("10/minute")
async def confirm_registration(request: Request, data: VerifyRegistrationMagicLinkData):
    """Finalize registration when user clicks confirmation link."""
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

    if not await check_email_availability(email=response):
        return JSONResponse(
            status_code=400,
            content={
                "error": "email_taken",
                "message": "An account with this email already exists",
            },
        )

    return await create_account(user_email=response)


@router.post("/ch.poltr.auth.createAppPassword")
@limiter.limit("5/minute")
async def create_app_password(
    request: Request, session: TSession = Depends(verify_session_token)
):
    """Create an app password for use with Bluesky clients."""
    if not APP_PASSWORD_ENABLED:
        return JSONResponse(
            status_code=403,
            content={"error": "disabled", "message": "App password creation is disabled"},
        )
    try:
        await pds_set_birthdate(session)

        result = await pds_create_app_password(
            session, f"poltr-{int(time.time())}"
        )
        return JSONResponse(content=result.model_dump())
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": "app_password_failed", "message": str(e)},
        )


@router.post("/ch.poltr.auth.initiateEidVerification")
@limiter.limit("5/minute")
async def initiate_eid_verification(
    request: Request, session: TSession = Depends(verify_session_token)
):
    """
    Initiate E-ID verification via eidproto service.
    Creates a secure session and returns the redirect URL.
    """
    pds_url = os.getenv("PDS_HOSTNAME", "pds2.poltr.info")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{EIDPROTO_URL}/api/verify/create-session",
                json={
                    "access_token": session.access_token,
                    "refresh_token": session.refresh_token,
                    "pds_url": pds_url,
                    "success_url": f"{FRONTEND_URL}/home?verified=true",
                    "error_url": f"{FRONTEND_URL}/home?error=verification_failed",
                },
            )

            if response.status_code != 200:
                error_data = response.json() if response.text else {}
                return JSONResponse(
                    status_code=response.status_code,
                    content={
                        "error": "eidproto_error",
                        "message": error_data.get("error", "Failed to create verification session"),
                    },
                )

            data = response.json()
            return JSONResponse(content={
                "redirect_url": f"{EIDPROTO_URL}{data['redirect_url']}"
            })

    except httpx.RequestError as e:
        return JSONResponse(
            status_code=502,
            content={
                "error": "eidproto_unavailable",
                "message": f"Could not reach eidproto service: {str(e)}",
            },
        )
