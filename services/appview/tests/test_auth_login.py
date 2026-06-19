"""
Tests for login and email availability functions.
"""

import json
from unittest.mock import patch

import pytest

from tests.conftest import FakePool, make_creds_row
from src.auth.email_hmac import email_digest


# ── check_email_availability ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_email_available():
    """Should return True when email is not in auth_creds."""
    pool = FakePool({"auth_creds": []})

    with patch("src.core.db.pool", pool):
        from src.auth.login import check_email_availability

        result = await check_email_availability(email_digest("free@test.com"))
        assert result is True


@pytest.mark.asyncio
async def test_email_taken():
    """Should return False when email exists in auth_creds."""
    pool = FakePool({"auth_creds": [make_creds_row(email="taken@test.com")]})

    with patch("src.core.db.pool", pool):
        from src.auth.login import check_email_availability

        result = await check_email_availability(email_digest("taken@test.com"))
        assert result is False


# ── login_account ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_user_not_found():
    """Should return 404 if email has no creds."""
    pool = FakePool({"auth_creds": []})

    with patch("src.core.db.pool", pool):
        from src.auth.login import login_account

        resp = await login_account(email_digest("nobody@test.com"))

        assert resp.status_code == 404
        body = json.loads(resp.body)
        assert body["error"] == "user_not_found"


@pytest.mark.asyncio
async def test_login_success():
    """Should create session cookie without PDS call."""
    creds = make_creds_row(email="user@test.com", did="did:plc:abc")
    pool = FakePool({"auth_creds": [creds]})

    with patch("src.core.db.pool", pool):
        from src.auth.login import login_account

        resp = await login_account(email_digest("user@test.com"))

        assert resp.status_code == 200
        # Should have inserted a session row
        conn = pool.last_conn
        inserts = [q for q in conn.executed if q[0] == "execute" and "INSERT" in q[1]]
        assert any("auth_sessions" in q[1] for q in inserts)

        # Should have set session cookie
        cookie_set = False
        for header_name, header_val in resp.raw_headers:
            if header_name == b"set-cookie" and b"session_token=" in header_val:
                cookie_set = True
        assert cookie_set
