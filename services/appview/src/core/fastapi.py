import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import src.core.db as db
from src.atproto.errors import PDSError
from src.atproto.crosspost import start_crosspost_loop, stop_crosspost_loop
from src.translation.translator import start_translation_loop, stop_translation_loop
# Peer-review assignment used to run as a background loop. It is now triggered
# on authenticated requests via src.auth.middleware → peer_review_assign.

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

log_level = os.getenv("APPVIEW_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("appview")

# Initialize rate limiter
limiter = Limiter(key_func=get_remote_address)


def start_participation_loops():
    start_crosspost_loop()
    start_translation_loop()


def stop_participation_loops():
    stop_translation_loop()
    stop_crosspost_loop()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("=== Application Starting ===")
    success = await db.check_db_connection()
    if not success:
        logger.warning("Database connection failed, but continuing...")
    logger.info("API listening on :3000")
    start_participation_loops()
    yield
    # Shutdown
    stop_participation_loops()
    await db.close_pool()
    logger.info("=== Application Shutdown ===")


app = FastAPI(lifespan=lifespan)

# Add rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# Shared handler for categorized PDS failures: serializes a stable machine code
# (no DID / no raw PDS text) and the matching HTTP status + Retry-After. Full
# diagnostic detail is logged server-side only. This lets the user-write
# endpoints simply let PDSError bubble up instead of each repeating a try/except.
async def _pds_error_handler(request: Request, exc: PDSError):
    logger.error("PDS op failed [%s]: %s", exc.code, exc.log_detail)
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return JSONResponse(
        status_code=exc.http_status,
        content={"error": exc.code},
        headers=headers,
    )


app.add_exception_handler(PDSError, _pds_error_handler)

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
