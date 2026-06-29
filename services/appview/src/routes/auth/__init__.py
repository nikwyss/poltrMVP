"""
ch.poltr.auth.* endpoints

Authentication endpoints for magic link login, registration, app passwords,
and E-ID verification.
"""

import logging
import os
import time
import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

from src.auth.login import check_email_availability, login_account
from src.auth.register import create_account
from src.auth.middleware import TSession, verify_session_token
import src.core.db as db
from src.core.db import get_pool
from src.auth.magic_link_handler import (
    VerifyLoginMagicLinkData,
    VerifyRegistrationMagicLinkData,
    VerifyShortCodeData,
    StartData,
    CheckLinkData,
    WaitStatusData,
    verify_login_magic_link_handler,
    verify_registration_magic_link_handler,
    verify_short_code_handler,
    start_handler,
    check_link_handler,
    wait_status_handler,
)
from src.atproto.atproto_api import pds_create_app_password, pds_set_birthdate
from src.core.fastapi import limiter

EIDPROTO_URL = os.getenv("EIDPROTO_URL", "https://eidproto.poltr.info")
FRONTEND_URL = os.getenv("APPVIEW_FRONTEND_URL", "https://poltr.ch")
APP_PASSWORD_ENABLED = (
    os.getenv("APPVIEW_APP_PASSWORD_ENABLED", "false").lower() == "true"
)

router = APIRouter(prefix="/xrpc", tags=["auth"])


@router.post("/ch.poltr.auth.start")
# Per-IP caps across four windows, layered under per-email (10/15min) and the
# global breaker. NOTE: keyed on real client IP — these are TIGHT for shared NATs
# (mobile CGNAT / corporate / school), where many users share one IP. Raise if
# referendum-surge lockouts appear. ("week" isn't a limits granularity → 7 days.)
# See doc/SECURITY_AUTH.md.
@limiter.limit("3/minute")
@limiter.limit("25/hour")
@limiter.limit("60/day")
@limiter.limit("100 per 7 days")
async def start(request: Request, data: StartData):
    """Unified auth entry point (login OR registration, decided server-side).

    Returns a neutral response identical for both cases plus an `initiatorSecret`
    the frontend stores in a httpOnly cookie. The only branch the user can observe
    is which email arrives. See doc/SECURITY_AUTH.md.
    """
    locale = request.cookies.get("locale", "de")
    return await start_handler(data, locale=locale)


@router.post("/ch.poltr.auth.checkLink")
@limiter.limit("20/minute")
async def check_link(request: Request, data: CheckLinkData):
    """Non-consuming preflight for /auth/verify: same-browser vs different-browser
    (reveals the short code only in the different-browser case)."""
    return await check_link_handler(data)


@router.post("/ch.poltr.auth.waitStatus")
@limiter.limit("60/minute")
async def wait_status(request: Request, data: WaitStatusData):
    """Polling status for the waiting screen: authenticated | pending | gone."""
    authz = request.headers.get("authorization")
    token = request.cookies.get("session_token")
    if not token and authz and authz.startswith("Bearer "):
        token = authz.replace("Bearer ", "")
    return await wait_status_handler(data, token)


@router.post("/ch.poltr.auth.verifyLogin")
@limiter.limit("10/minute")
async def verify_magic_link_get(request: Request, data: VerifyLoginMagicLinkData):
    """Verify magic link token and create session (GET via email link) (NEW)"""

    response = await verify_login_magic_link_handler(data)

    if isinstance(response, JSONResponse):
        return response

    if response is None:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_token", "message": "Invalid token"},
        )

    email_hmac, return_url = response
    return await login_account(email_hmac=email_hmac, return_url=return_url)


@router.post("/ch.poltr.auth.verifyRegistration")
@limiter.limit("10/minute")
async def confirm_registration(request: Request, data: VerifyRegistrationMagicLinkData):
    """Finalize registration when user clicks confirmation link."""
    response = await verify_registration_magic_link_handler(data)

    if isinstance(response, JSONResponse):
        return response

    if response is None:

        return JSONResponse(
            status_code=400,
            content={"error": "invalid_token", "message": "Invalid token"},
        )

    email_hmac, return_url = response

    if not await check_email_availability(email_hmac=email_hmac):
        return JSONResponse(
            status_code=400,
            content={
                "error": "email_taken",
                "message": "An account with this email already exists",
            },
        )

    return await create_account(email_hmac=email_hmac, return_url=return_url)


@router.post("/ch.poltr.auth.verifyShortCode")
@limiter.limit("10/minute")
async def verify_short_code(request: Request, data: VerifyShortCodeData):
    """Verify a 6-character short code. Purpose-agnostic: the matching pending
    table (not the request) decides login vs registration, so the waiting screen
    never has to know which it is."""
    response = await verify_short_code_handler(data)

    if isinstance(response, JSONResponse):
        return response

    if response is None:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_code", "message": "Invalid code"},
        )

    email_hmac, return_url, purpose = response

    if purpose == "registration":
        if not await check_email_availability(email_hmac=email_hmac):
            return JSONResponse(
                status_code=400,
                content={
                    "error": "email_taken",
                    "message": "An account with this email already exists",
                },
            )
        return await create_account(email_hmac=email_hmac, return_url=return_url)
    else:
        return await login_account(email_hmac=email_hmac, return_url=return_url)


@router.get("/ch.poltr.auth.session")
async def check_session(
    request: Request, session: TSession = Depends(verify_session_token)
):
    """Lightweight session validity check. Returns basic user info."""
    handle = session.user.get("handle", "") if session.user else ""

    # Read current profile fields so the header reflects the pseudonym even for
    # sessions created before they were stored in user_data. Display only.
    row = None
    try:
        if db.pool is None:
            await db.init_pool()
        async with db.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT display_name, canton, color, mountain_fullname, height
                FROM app_profiles WHERE did = $1
                """,
                session.did,
            )
    except Exception:
        pass

    display_name = (
        (row["display_name"] if row else None)
        or (session.user.get("displayName") if session.user else None)
        or (handle.split(".")[0] if handle else "")
    )

    height = row["height"] if row else None

    return JSONResponse(
        content={
            "authenticated": True,
            "did": session.did,
            "handle": handle,
            "displayName": display_name,
            "canton": row["canton"] if row else None,
            "color": row["color"] if row else None,
            "mountainFullname": row["mountain_fullname"] if row else None,
            "height": float(height) if height is not None else None,
        }
    )


@router.post("/ch.poltr.auth.logout")
async def logout(request: Request, session: TSession = Depends(verify_session_token)):
    """Logout: delete all sessions for this user (all devices)."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM auth.auth_sessions WHERE did = $1",
            session.did,
        )
    return JSONResponse(content={"success": True})


@router.post("/ch.poltr.auth.createAppPassword")
@limiter.limit("5/minute")
async def create_app_password(
    request: Request, session: TSession = Depends(verify_session_token)
):
    """Create an app password for use with Bluesky clients."""
    if not APP_PASSWORD_ENABLED:
        return JSONResponse(
            status_code=403,
            content={
                "error": "disabled",
                "message": "App password creation is disabled",
            },
        )
    try:
        await pds_set_birthdate(session)

        result = await pds_create_app_password(session, f"poltr-{int(time.time())}")
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
            # Get a fresh access token before sending to eidproto
            from src.atproto.atproto_api import _relogin_from_stored_creds

            fresh = await _relogin_from_stored_creds(session.did, client, pds_url)
            fresh_access_token = fresh["accessJwt"]

            response = await client.post(
                f"{EIDPROTO_URL}/api/verify/create-session",
                json={
                    "access_token": fresh_access_token,
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
                        "message": error_data.get(
                            "error", "Failed to create verification session"
                        ),
                    },
                )

            data = response.json()
            return JSONResponse(
                content={"redirect_url": f"{EIDPROTO_URL}{data['redirect_url']}"}
            )

    except httpx.RequestError as e:
        return JSONResponse(
            status_code=502,
            content={
                "error": "eidproto_unavailable",
                "message": f"Could not reach eidproto service: {str(e)}",
            },
        )
