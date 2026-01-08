import os
from datetime import datetime, timedelta
import json
from fastapi import Request
from fastapi.responses import JSONResponse
import src.lib.db as db
from src.auth.auth import (
    send_magic_link_handler,
    verify_magic_link_handler,
    SendMagicLinkRequest,
    VerifyMagicLinkRequest,
)
from src.lib.fastapi import app, limiter


@app.post("/auth/send-magic-link")
@limiter.limit("5/minute")  # Max 5 requests per minute per IP
async def send_magic_link(request: Request, data: SendMagicLinkRequest):
    """Send magic link to user's email"""
    return await send_magic_link_handler(data)


@app.post("/auth/verify-magic-link")
@limiter.limit("10/minute")  # Max 10 verifications per minute per IP
async def verify_magic_link(request: Request, data: VerifyMagicLinkRequest):
    """Verify magic link token and create session (POST with JSON)"""
    return await verify_magic_link_handler(data)


# Also accept GET /verify?token=... for browser magic link clicks
@app.get("/verify")
@limiter.limit("10/minute")
async def verify_magic_link_get(request: Request, token: str):
    """Verify magic link token and create session (GET via email link) (NEW)"""
    data = VerifyMagicLinkRequest(token=token)
    return await verify_magic_link_handler(data)


@app.post("/register")
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
        from lib.email_service import email_service

        success = email_service.send_confirmation_link(email, token, purpose="confirm")
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


@app.get("/confirm")
@limiter.limit("10/minute")
async def confirm_registration(request: Request, token: str):
    """Finalize registration when user clicks confirmation link."""
    # validate token

    try:
        # ensure pool initialized
        if db.pool is None:
            ok = await db.check_db_connection()
            if not ok:
                return JSONResponse(
                    status_code=500, content={"message": "DB connection failed"}
                )

        async with db.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, email, expires_at
                FROM pending_registrations
                WHERE token = $1
                """,
                token,
            )
            if not row:
                return JSONResponse(
                    status_code=400, content={"message": "Invalid or expired token"}
                )

            if datetime.utcnow() > row["expires_at"]:
                return JSONResponse(
                    status_code=400, content={"message": "Token expired"}
                )

            email = row["email"]

            # create account on PDS
            import random, string, httpx, secrets

            def gen_handle():
                name = "user" + "".join(
                    random.choices(string.ascii_lowercase + string.digits, k=6)
                )
                domain = os.getenv("PDS_DOMAIN_SHORT", "poltr.info")
                return f"{name}.{domain}"

            def gen_password():
                alphabet = string.ascii_letters + string.digits + string.punctuation
                return "".join(secrets.choice(alphabet) for _ in range(64))

            handle = gen_handle()
            password = gen_password()

            pds_url = os.getenv("PDS_URL", "https://pds.poltr.info")
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{pds_url}/xrpc/com.atproto.server.createAccount",
                    json={"handle": handle, "email": email, "password": password},
                )
            if resp.status_code != 200:
                return JSONResponse(
                    status_code=502,
                    content={"message": f"PDS error: {resp.status_code}"},
                )

            # delete pending registration
            await conn.execute(
                "DELETE FROM pending_registrations WHERE id = $1", row["id"]
            )

            # create session like verify_magic_link_handler does
            session_token = secrets.token_urlsafe(48)
            session_expires = datetime.utcnow() + timedelta(days=7)
            user_data = {
                "email": email,
                "handle": handle,
                "displayName": handle.split("@")[0],
            }
            await conn.execute(
                """
                INSERT INTO sessions (session_token, email, user_data, expires_at)
                VALUES ($1, $2, $3, $4)
                """,
                session_token,
                email,
                json.dumps(user_data),
                session_expires,
            )

            # delete pending registration
            await conn.execute(
                "DELETE FROM pending_registrations WHERE id = $1", row["id"]
            )

            # Set cookie and redirect to frontend with fragment containing session token
            is_production = os.getenv("ENVIRONMENT", "development") == "production"
            frontend = os.getenv("APPVIEW_FRONTEND_URL", "http://localhost:5173")
            redirect_url = f"{frontend}/#session={session_token}"
            from fastapi.responses import RedirectResponse

            response = RedirectResponse(url=redirect_url, status_code=302)
            response.set_cookie(
                key="session_token",
                value=session_token,
                httponly=True,
                secure=is_production,
                samesite="lax",
                max_age=7 * 24 * 60 * 60,
                path="/",
            )
            return response

    except Exception as e:
        return JSONResponse(
            status_code=500, content={"message": f"Internal error: {e}"}
        )
