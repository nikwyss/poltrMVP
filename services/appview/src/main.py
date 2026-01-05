import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import src.db as db
from src.proposals import get_proposals_handler
from src.auth import (
    send_magic_link_handler,
    verify_magic_link_handler,
    SendMagicLinkRequest,
    VerifyMagicLinkRequest,
)
from src.middleware import verify_session_token

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

log_level = os.getenv("APPVIEW_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("appview")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("=== Application Starting ===")
    success = await db.check_db_connection()
    if not success:
        logger.warning("Database connection failed, but continuing...")
    logger.info("API listening on :3000")
    yield
    # Shutdown
    await db.close_pool()
    logger.info("=== Application Shutdown ===")


app = FastAPI(lifespan=lifespan)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure allowed origins: include local dev and production fronts; allow override via APP_ALLOW_ORIGINS env (comma-separated)
allowed = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://poltr.ch",
    "https://app.poltr.info",
]
extra = os.getenv("APP_ALLOW_ORIGINS")
if extra:
    allowed.extend([o.strip() for o in extra.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    try:
        if db.pool is None:
            return JSONResponse(
                status_code=503,
                content={"status": "error", "error": "DB pool not initialized"},
            )
        async with db.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return JSONResponse(status_code=200, content={"status": "ok"})
    except Exception as err:
        return JSONResponse(
            status_code=503, content={"status": "error", "error": str(err)}
        )


@app.get("/xrpc/app.ch.poltr.vote.listProposals")
async def list_proposals(
    request: Request,
    did: str = Query(None),
    since: str = Query(None),
    limit: int = Query(50),
    session: dict = Depends(verify_session_token),
):
    return await get_proposals_handler(did=did, since=since, limit=limit)


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
                return JSONResponse(status_code=500, content={"message": "DB connection failed"})
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
        return JSONResponse(status_code=500, content={"message": f"Failed to store pending registration: {e}"})

    # send confirmation email
    try:
        from src.email_service import email_service
        success = email_service.send_confirmation_link(email, token, purpose='confirm')
        if not success:
            return JSONResponse(status_code=500, content={"message": "Failed to send confirmation email"})
    except Exception as e:
        return JSONResponse(status_code=500, content={"message": f"Failed to send confirmation email: {e}"})

    return JSONResponse(status_code=200, content={"message": "Confirmation email sent"})


@app.get("/confirm")
@limiter.limit("10/minute")
async def confirm_registration(request: Request, token: str):
    """Finalize registration when user clicks confirmation link."""
    # validate token
    from datetime import datetime

    try:
        # ensure pool initialized
        if db.pool is None:
            ok = await db.check_db_connection()
            if not ok:
                return JSONResponse(status_code=500, content={"message": "DB connection failed"})

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
                return JSONResponse(status_code=400, content={"message": "Invalid or expired token"})

            if datetime.utcnow() > row["expires_at"]:
                return JSONResponse(status_code=400, content={"message": "Token expired"})

            email = row["email"]

            # create account on PDS
            import random, string, httpx, secrets

            def gen_handle():
                name = "user" + "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
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
                return JSONResponse(status_code=502, content={"message": f"PDS error: {resp.status_code}"})

            # delete pending registration
            await conn.execute("DELETE FROM pending_registrations WHERE id = $1", row["id"])

            # create session like verify_magic_link_handler does
            session_token = secrets.token_urlsafe(48)
            session_expires = datetime.utcnow() + timedelta(days=7)
            user_data = {"email": email, "handle": handle, "displayName": handle.split('@')[0]}
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
            await conn.execute("DELETE FROM pending_registrations WHERE id = $1", row["id"])

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
        return JSONResponse(status_code=500, content={"message": f"Internal error: {e}"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
