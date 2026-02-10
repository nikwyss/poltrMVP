"""
Shared fixtures for auth tests.

Provides a fake async DB pool that records SQL calls and returns
configurable rows, plus an HTTPX AsyncClient wired to the FastAPI app.
"""

import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport


# ---------------------------------------------------------------------------
# Fake asyncpg connection / pool
# ---------------------------------------------------------------------------

class FakeConnection:
    """Mimics asyncpg connection with fetchrow / fetch / execute."""

    def __init__(self, store: dict):
        self._store = store
        self.executed = []  # log of (sql, params) for assertions

    async def fetchrow(self, sql, *params):
        self.executed.append(("fetchrow", sql.strip(), params))
        key = self._table_from_sql(sql)
        rows = self._store.get(key, [])
        # Match by token or email depending on query
        for row in rows:
            for p in params:
                if p in row.values():
                    return row
        return None

    async def fetch(self, sql, *params):
        self.executed.append(("fetch", sql.strip(), params))
        return []

    async def execute(self, sql, *params):
        self.executed.append(("execute", sql.strip(), params))

    async def fetchval(self, sql, *params):
        self.executed.append(("fetchval", sql.strip(), params))
        return 1

    @staticmethod
    def _table_from_sql(sql):
        """Rough extraction of table name from SQL."""
        sql_upper = sql.upper()
        for keyword in ("FROM", "INTO", "UPDATE"):
            if keyword in sql_upper:
                idx = sql_upper.index(keyword) + len(keyword)
                rest = sql[idx:].strip().split()[0]
                return rest.lower().strip("(")
        return ""


class FakePool:
    """Context-manager pool that yields a FakeConnection."""

    def __init__(self, store: dict | None = None):
        self._store = store or {}
        self.last_conn: FakeConnection | None = None
        self.all_conns: list[FakeConnection] = []

    def acquire(self):
        conn = FakeConnection(self._store)
        self.last_conn = conn
        self.all_conns.append(conn)
        return _FakeAcquire(conn)

    @property
    def all_executed(self):
        """All queries across all connections."""
        return [q for conn in self.all_conns for q in conn.executed]


class _FakeAcquire:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc):
        pass


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def fake_pool():
    """Return a factory: call with optional store dict to get a FakePool."""
    def _make(store=None):
        return FakePool(store or {})
    return _make


@pytest.fixture
def patch_db(fake_pool):
    """Patch src.lib.db.pool with a FakePool. Returns the pool so tests can
    pre-populate its store and inspect executed queries."""
    pool = fake_pool()
    with patch("src.lib.db.pool", pool):
        yield pool


@pytest.fixture
def patch_email():
    """Patch the email service so no real emails are sent."""
    with patch(
        "src.auth.magic_link_handler.email_service"
    ) as mock_email:
        mock_email.send_confirmation_link = MagicMock(return_value=True)
        yield mock_email


@pytest.fixture
def patch_email_routes():
    """Patch email service as imported from routes/auth."""
    with patch(
        "src.routes.auth.email_service",
        create=True,
    ) as mock_email:
        mock_email.send_confirmation_link = MagicMock(return_value=True)
        yield mock_email


@pytest_asyncio.fixture
async def client(patch_db):
    """HTTPX async client talking to the FastAPI app with DB mocked."""
    from src.lib.fastapi import app
    from src.main import app as _  # noqa: ensure routers are mounted

    # Disable rate limiting in tests
    from src.lib.fastapi import limiter
    limiter.enabled = False

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    limiter.enabled = True


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_pending_login_row(email="user@test.com", token="test-token", expired=False):
    exp = datetime.utcnow() + (timedelta(minutes=-1) if expired else timedelta(minutes=15))
    return {"id": 1, "email": email, "expires_at": exp, "token": token}


def make_pending_registration_row(email="new@test.com", token="reg-token", expired=False):
    exp = datetime.utcnow() + (timedelta(minutes=-1) if expired else timedelta(minutes=30))
    return {"id": 1, "email": email, "expires_at": exp, "token": token}


def make_creds_row(email="user@test.com", did="did:plc:abc123"):
    return {
        "did": did,
        "email": email,
        "app_pw_ciphertext": b"fake-ct",
        "app_pw_nonce": b"fake-nonce-24-bytes!",
    }
