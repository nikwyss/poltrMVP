import os
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from db import pool, check_db_connection, close_pool
from proposals import get_proposals_handler

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await check_db_connection()
    print("API listening on :3000")
    yield
    # Shutdown
    await close_pool()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
):
    return await get_proposals_handler(did=did, since=since, limit=limit)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
