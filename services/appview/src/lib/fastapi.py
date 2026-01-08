import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import src.lib.db as db

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
