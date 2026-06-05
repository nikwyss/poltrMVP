import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

import src.core.db as db

load_dotenv(dotenv_path=Path(__file__).resolve().parents[2] / ".env")

log_level = os.getenv("CALCULATOR_LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, log_level, logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("calculator")

# Rate limiter (shared instance; routes may add per-endpoint limits)
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB-Pool ist optional: nur der Open-Coding-Worker braucht ihn. Fehlt die
    # POSTGRES_URL, startet der Service trotzdem (Tag-Endpoints bleiben nutzbar).
    await db.check_db_connection()
    yield
    await db.close_pool()


app = FastAPI(title="POLTR Calculator", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — same poltr defaults as the appview, plus optional override.
allowed = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3002",        # CMS-Dev (next dev --port 3002)
    "http://127.0.0.1:3002",
    "https://poltr.ch",
    "https://app.poltr.info",
    "https://calculator.poltr.info",
    "https://cms.poltr.info",  # CMS-Admin (Taxonomy-Panel ruft den Calculator)
]
extra = os.getenv("CALCULATOR_ALLOW_ORIGINS")
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
    return JSONResponse(status_code=200, content={"status": "ok"})
