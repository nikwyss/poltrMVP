"""
Tests for login and account creation functions.
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from tests.conftest import FakePool, make_creds_row


# ── check_email_availability ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_email_available():
    """Should return True when email is not in auth_creds."""
    pool = FakePool({"auth_creds": []})

    with patch("src.lib.db.pool", pool):
        from src.auth.login import check_email_availability

        result = await check_email_availability("free@test.com")
        assert result is True


@pytest.mark.asyncio
async def test_email_taken():
    """Should return False when email exists in auth_creds."""
    pool = FakePool({"auth_creds": [make_creds_row(email="taken@test.com")]})

    with patch("src.lib.db.pool", pool):
        from src.auth.login import check_email_availability

        result = await check_email_availability("taken@test.com")
        assert result is False


# ── login_pds_account ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_login_user_not_found():
    """Should return 404 if email has no creds."""
    pool = FakePool({"auth_creds": []})

    with patch("src.lib.db.pool", pool):
        from src.auth.login import login_pds_account

        resp = await login_pds_account("nobody@test.com")

        assert resp.status_code == 404
        body = json.loads(resp.body)
        assert body["error"] == "user_not_found"


@pytest.mark.asyncio
async def test_login_success():
    """Should decrypt password, call PDS login, and create session cookie."""
    creds = make_creds_row(email="user@test.com", did="did:plc:abc")
    pool = FakePool({"auth_creds": [creds]})

    mock_login_response = MagicMock()
    mock_login_response.did = "did:plc:abc"
    mock_login_response.handle = "user123.poltr.info"
    mock_login_response.accessJwt = "access-jwt"
    mock_login_response.refreshJwt = "refresh-jwt"

    with (
        patch("src.lib.db.pool", pool),
        patch("src.auth.login.decrypt_app_password", return_value="decrypted-pw"),
        patch("src.auth.login.pds_api_login", new_callable=AsyncMock, return_value=mock_login_response),
    ):
        from src.auth.login import login_pds_account

        resp = await login_pds_account("user@test.com")

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


# ── create_account ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_account_success():
    """Should create PDS account, store encrypted creds, and set session."""
    pool = FakePool()

    mock_session = MagicMock()
    mock_session.did = "did:plc:new123"
    mock_session.handle = "usernew1.poltr.info"
    mock_session.accessJwt = "new-access-jwt"
    mock_session.refreshJwt = "new-refresh-jwt"

    with (
        patch("src.lib.db.pool", pool),
        patch("src.auth.login.encrypt_app_password", return_value=(b"ct", b"nonce")),
        patch("src.auth.login.pds_api_admin_create_account", new_callable=AsyncMock, return_value=mock_session),
    ):
        from src.auth.login import create_account

        resp = await create_account("newuser@test.com")

        assert resp.status_code == 200

        # Should have inserted into auth_creds and auth_sessions
        inserts = [q for q in pool.all_executed if q[0] == "execute" and "INSERT" in q[1]]
        assert any("auth_creds" in q[1] for q in inserts)
        assert any("auth_sessions" in q[1] for q in inserts)


@pytest.mark.asyncio
async def test_create_account_compensating_delete_on_db_failure():
    """If storing creds fails after PDS account creation, should delete the PDS account."""
    pool = FakePool()

    mock_session = MagicMock()
    mock_session.did = "did:plc:orphan"
    mock_session.handle = "orphan.poltr.info"
    mock_session.accessJwt = "jwt"
    mock_session.refreshJwt = "rjwt"

    # Make the DB execute raise to simulate a failure after PDS account creation
    async def failing_execute(sql, *params):
        raise RuntimeError("DB write failed")

    original_acquire = pool.acquire

    class FailingPool:
        """Pool whose connection.execute always raises."""
        def acquire(self):
            from tests.conftest import _FakeAcquire, FakeConnection
            conn = FakeConnection({})
            conn.execute = failing_execute
            pool.last_conn = conn
            pool.all_conns.append(conn)
            return _FakeAcquire(conn)

    mock_delete = AsyncMock()

    with (
        patch("src.lib.db.pool", FailingPool()),
        patch("src.auth.login.encrypt_app_password", return_value=(b"ct", b"nonce")),
        patch("src.auth.login.pds_api_admin_create_account", new_callable=AsyncMock, return_value=mock_session),
        patch("src.auth.login.pds_api_admin_delete_account", mock_delete),
    ):
        from src.auth.login import create_account

        resp = await create_account("fail@test.com")

        # Should return 500
        assert resp.status_code == 500
        body = json.loads(resp.body)
        assert body["error"] == "registration_failed"

        # Should have called delete with the orphan DID
        mock_delete.assert_called_once_with("did:plc:orphan")


@pytest.mark.asyncio
async def test_create_account_compensating_delete_failure_still_returns_500():
    """If both DB and PDS delete fail, should still return 500 (not crash)."""
    mock_session = MagicMock()
    mock_session.did = "did:plc:doomed"
    mock_session.handle = "doomed.poltr.info"
    mock_session.accessJwt = "jwt"
    mock_session.refreshJwt = "rjwt"

    class FailingPool:
        def acquire(self):
            from tests.conftest import _FakeAcquire, FakeConnection
            conn = FakeConnection({})
            async def failing_execute(sql, *params):
                raise RuntimeError("DB write failed")
            conn.execute = failing_execute
            return _FakeAcquire(conn)

    mock_delete = AsyncMock(side_effect=RuntimeError("PDS delete also failed"))

    with (
        patch("src.lib.db.pool", FailingPool()),
        patch("src.auth.login.encrypt_app_password", return_value=(b"ct", b"nonce")),
        patch("src.auth.login.pds_api_admin_create_account", new_callable=AsyncMock, return_value=mock_session),
        patch("src.auth.login.pds_api_admin_delete_account", mock_delete),
    ):
        from src.auth.login import create_account

        resp = await create_account("doomed@test.com")

        # Should still return 500 gracefully, not raise
        assert resp.status_code == 500
