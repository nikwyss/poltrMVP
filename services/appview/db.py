import os
import asyncpg
from typing import Any, List


pool: asyncpg.Pool = None


async def init_pool():
    global pool
    connection_string = os.getenv("APPVIEW_POSTGRES_URL")
    if not connection_string:
        raise ValueError("APPVIEW_POSTGRES_URL not set")
    pool = await asyncpg.create_pool(connection_string)
    return pool


async def get_pool():
    """Ensure a pool exists before returning it."""
    global pool
    if pool is None:
        await init_pool()
    return pool


async def check_db_connection():
    global pool
    try:
        if pool is None:
            print("Initializing database pool...")
            await init_pool()
            print(f"Database pool created successfully")
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        print("DB connection ok")
    except Exception as err:
        print(f"DB connection failed: {err}")
        import traceback

        traceback.print_exc()
        exit(1)


async def close_pool():
    global pool
    if pool:
        await pool.close()


async def db_query(query: str, params: List[Any] = None):
    if pool is None:
        raise Exception("No DB pool initialized")
    async with pool.acquire() as conn:
        return await conn.fetch(query, *(params or []))
