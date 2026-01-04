import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from db import pool, check_db_connection, close_pool
from proposals import get_proposals_handler
from auth import (
    send_magic_link_handler, 
    verify_magic_link_handler,
    SendMagicLinkRequest,
    VerifyMagicLinkRequest
)
from middleware import verify_session_token

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("=== Application Starting ===")
    success = await check_db_connection()
    if not success:
        print("WARNING: Database connection failed, but continuing...")
    print("API listening on :3000")
    yield
    # Shutdown
    await close_pool()
    print("=== Application Shutdown ===")


app = FastAPI(lifespan=lifespan)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # Specific origins for credentials
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz():
    try:
        if pool is None:
            return JSONResponse(
                status_code=503, content={"status": "error", "error": "DB pool not initialized"}
            )
        async with pool.acquire() as conn:
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
    """Verify magic link token and create session"""
    return await verify_magic_link_handler(data)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
