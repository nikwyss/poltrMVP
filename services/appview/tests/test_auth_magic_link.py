"""
Tests for magic link handler functions (send, verify login, verify registration).
"""

from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest
import pytest_asyncio

from tests.conftest import (
    FakePool,
    make_pending_login_row,
    make_pending_registration_row,
    make_creds_row,
)


# ── send_magic_link_handler ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_magic_link_success():
    """Happy path: account exists, token inserted, email sent."""
    store = {"auth_creds": [make_creds_row()]}
    pool = FakePool(store)

    with (
        patch("src.lib.db.pool", pool),
        patch("src.auth.magic_link_handler.email_service") as mock_email,
    ):
        mock_email.send_confirmation_link = MagicMock(return_value=True)

        from src.auth.magic_link_handler import (
            SendMagicLinkData,
            send_magic_link_handler,
        )

        resp = await send_magic_link_handler(SendMagicLinkData(email="user@test.com"))

        assert resp.status_code == 200
        mock_email.send_confirmation_link.assert_called_once()
        call_args = mock_email.send_confirmation_link.call_args
        assert call_args[0][0] == "user@test.com"
        assert call_args[1]["purpose"] == "login" or call_args[0][2] == "login"


@pytest.mark.asyncio
async def test_send_magic_link_unknown_email():
    """Should return 404 when no account exists for the email."""
    pool = FakePool({"auth_creds": []})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            SendMagicLinkData,
            send_magic_link_handler,
        )

        resp = await send_magic_link_handler(SendMagicLinkData(email="nobody@test.com"))

        assert resp.status_code == 404
        assert resp.body is not None
        import json
        body = json.loads(resp.body)
        assert body["error"] == "user_not_found"


@pytest.mark.asyncio
async def test_send_magic_link_email_failure():
    """Should return 500 when email service fails."""
    store = {"auth_creds": [make_creds_row()]}
    pool = FakePool(store)

    with (
        patch("src.lib.db.pool", pool),
        patch("src.auth.magic_link_handler.email_service") as mock_email,
    ):
        mock_email.send_confirmation_link = MagicMock(return_value=False)

        from src.auth.magic_link_handler import (
            SendMagicLinkData,
            send_magic_link_handler,
        )

        resp = await send_magic_link_handler(SendMagicLinkData(email="user@test.com"))

        assert resp.status_code == 500
        import json
        body = json.loads(resp.body)
        assert body["error"] == "email_failed"


# ── verify_login_magic_link_handler ──────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_login_valid_token():
    """Valid token should return email and delete the pending row."""
    row = make_pending_login_row(email="user@test.com", token="good-token")
    pool = FakePool({"auth_pending_logins": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyLoginMagicLinkData,
            verify_login_magic_link_handler,
        )

        result = await verify_login_magic_link_handler(
            VerifyLoginMagicLinkData(token="good-token")
        )

        # Should return the email string
        assert result == "user@test.com"

        # Should have issued a DELETE
        conn = pool.last_conn
        deletes = [q for q in conn.executed if q[0] == "execute" and "DELETE" in q[1]]
        assert len(deletes) == 1
        assert "auth_pending_logins" in deletes[0][1]


@pytest.mark.asyncio
async def test_verify_login_invalid_token():
    """Unknown token should return 400."""
    pool = FakePool({"auth_pending_logins": []})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyLoginMagicLinkData,
            verify_login_magic_link_handler,
        )

        result = await verify_login_magic_link_handler(
            VerifyLoginMagicLinkData(token="bad-token")
        )

        assert hasattr(result, "status_code")
        assert result.status_code == 400


@pytest.mark.asyncio
async def test_verify_login_expired_token():
    """Expired token should return 400 with token_expired error."""
    row = make_pending_login_row(token="expired-token", expired=True)
    pool = FakePool({"auth_pending_logins": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyLoginMagicLinkData,
            verify_login_magic_link_handler,
        )

        result = await verify_login_magic_link_handler(
            VerifyLoginMagicLinkData(token="expired-token")
        )

        assert hasattr(result, "status_code")
        assert result.status_code == 400
        import json
        body = json.loads(result.body)
        assert body["error"] == "token_expired"


# ── verify_registration_magic_link_handler ───────────────────────────────


@pytest.mark.asyncio
async def test_verify_registration_valid_token():
    """Valid registration token should return email and delete row."""
    row = make_pending_registration_row(email="new@test.com", token="reg-token")
    pool = FakePool({"auth_pending_registrations": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyRegistrationMagicLinkData,
            verify_registration_magic_link_handler,
        )

        result = await verify_registration_magic_link_handler(
            VerifyRegistrationMagicLinkData(token="reg-token")
        )

        assert result == "new@test.com"

        conn = pool.last_conn
        deletes = [q for q in conn.executed if q[0] == "execute" and "DELETE" in q[1]]
        assert len(deletes) == 1
        assert "auth_pending_registrations" in deletes[0][1]


@pytest.mark.asyncio
async def test_verify_registration_invalid_token():
    """Unknown registration token should return 400."""
    pool = FakePool({"auth_pending_registrations": []})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyRegistrationMagicLinkData,
            verify_registration_magic_link_handler,
        )

        result = await verify_registration_magic_link_handler(
            VerifyRegistrationMagicLinkData(token="bad-token")
        )

        assert hasattr(result, "status_code")
        assert result.status_code == 400


@pytest.mark.asyncio
async def test_verify_registration_expired_token():
    """Expired registration token should return 400."""
    row = make_pending_registration_row(token="old-token", expired=True)
    pool = FakePool({"auth_pending_registrations": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyRegistrationMagicLinkData,
            verify_registration_magic_link_handler,
        )

        result = await verify_registration_magic_link_handler(
            VerifyRegistrationMagicLinkData(token="old-token")
        )

        assert hasattr(result, "status_code")
        assert result.status_code == 400
