import os
import asyncpg


pool: asyncpg.Pool = None


async def init_pool():
    global pool
    connection_string = os.getenv("APPVIEW_POSTGRES_URL")
    if not connection_string:
        raise ValueError("APPVIEW_POSTGRES_URL not set")
    pool = await asyncpg.create_pool(
        connection_string,
        server_settings={"search_path": "auth,public"},
    )
    return pool


async def get_pool():
    """Ensure a pool exists before returning it."""
    if pool is None:
        await init_pool()
    return pool


async def check_db_connection():
    try:
        if pool is None:
            print("Initializing database pool...")
            await init_pool()
            print("Database pool created successfully")
        async with pool.acquire() as conn:
            result = await conn.fetchval("SELECT 1")
            print(f"DB connection test result: {result}")
        print("DB connection ok")
        return True
    except Exception as err:
        print(f"DB connection failed: {err}")
        import traceback

        traceback.print_exc()
        return False


async def close_pool():
    if pool:
        await pool.close()
