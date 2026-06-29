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
from src.auth.email_hmac import email_digest

# Pre-import so patch targets are resolvable
from src.auth.magic_link_handler import (  # noqa: E402
    VerifyLoginMagicLinkData,
    verify_login_magic_link_handler,
    VerifyRegistrationMagicLinkData,
    verify_registration_magic_link_handler,
)


# ── verify_login_magic_link_handler ──────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_login_valid_token():
    """Valid token should return email and delete the pending row."""
    row = make_pending_login_row(email="user@test.com", token="good-token")
    pool = FakePool({"auth_pending_logins": [row]})

    with patch("src.core.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyLoginMagicLinkData,
            verify_login_magic_link_handler,
        )

        result = await verify_login_magic_link_handler(
            VerifyLoginMagicLinkData(token="good-token")
        )

        # Returns (email, return_url) so the route can echo the deep link back.
        assert result == (email_digest("user@test.com"), None)

        # Should have issued a DELETE
        conn = pool.last_conn
        deletes = [q for q in conn.executed if q[0] == "execute" and "DELETE" in q[1]]
        assert len(deletes) == 1
        assert "auth_pending_logins" in deletes[0][1]


@pytest.mark.asyncio
async def test_verify_login_invalid_token():
    """Unknown token should return 400."""
    pool = FakePool({"auth_pending_logins": []})

    with patch("src.core.db.pool", pool):
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

    with patch("src.core.db.pool", pool):
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

    with patch("src.core.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyRegistrationMagicLinkData,
            verify_registration_magic_link_handler,
        )

        result = await verify_registration_magic_link_handler(
            VerifyRegistrationMagicLinkData(token="reg-token")
        )

        assert result == (email_digest("new@test.com"), None)

        conn = pool.last_conn
        deletes = [q for q in conn.executed if q[0] == "execute" and "DELETE" in q[1]]
        assert len(deletes) == 1
        assert "auth_pending_registrations" in deletes[0][1]


@pytest.mark.asyncio
async def test_verify_registration_invalid_token():
    """Unknown registration token should return 400."""
    pool = FakePool({"auth_pending_registrations": []})

    with patch("src.core.db.pool", pool):
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

    with patch("src.core.db.pool", pool):
        from src.auth.magic_link_handler import (
            VerifyRegistrationMagicLinkData,
            verify_registration_magic_link_handler,
        )

        result = await verify_registration_magic_link_handler(
            VerifyRegistrationMagicLinkData(token="old-token")
        )

        assert hasattr(result, "status_code")
        assert result.status_code == 400
