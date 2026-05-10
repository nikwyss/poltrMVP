"""
Tests for account registration.
"""

import json
from unittest.mock import patch, AsyncMock, MagicMock

import pytest

from tests.conftest import FakePool
from src.participation.provisioning import ProvisioningError


# ── create_account ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_account_success():
    """Should provision PDS account, store creds, and set session."""
    pool = FakePool()

    with (
        patch("src.core.db.pool", pool),
        patch("src.auth.register.encrypt_app_password", return_value=(b"ct", b"nonce")),
        patch(
            "src.auth.register.provision_pds_account",
            new_callable=AsyncMock,
            return_value=("did:plc:new123", "new-access-jwt"),
        ),
    ):
        from src.auth.register import create_account

        resp = await create_account("newuser@test.com")

        assert resp.status_code == 200

        # Should have inserted into auth_creds and auth_sessions
        inserts = [q for q in pool.all_executed if q[0] == "execute" and "INSERT" in q[1]]
        assert any("auth_creds" in q[1] for q in inserts)
        assert any("auth_sessions" in q[1] for q in inserts)


@pytest.mark.asyncio
async def test_create_account_pds_failure():
    """Should return error when PDS provisioning fails."""
    pool = FakePool()

    with (
        patch("src.core.db.pool", pool),
        patch("src.auth.register.encrypt_app_password", return_value=(b"ct", b"nonce")),
        patch(
            "src.auth.register.provision_pds_account",
            new_callable=AsyncMock,
            side_effect=ProvisioningError("PDS down", "pds_error", 502),
        ),
    ):
        from src.auth.register import create_account

        resp = await create_account("fail@test.com")

        assert resp.status_code == 502
        body = json.loads(resp.body)
        assert body["error"] == "pds_error"


@pytest.mark.asyncio
async def test_create_account_email_taken():
    """Should return 409 when email is already taken on PDS."""
    pool = FakePool()

    with (
        patch("src.core.db.pool", pool),
        patch("src.auth.register.encrypt_app_password", return_value=(b"ct", b"nonce")),
        patch(
            "src.auth.register.provision_pds_account",
            new_callable=AsyncMock,
            side_effect=ProvisioningError("This email is already registered on the PDS", "email_taken", 409),
        ),
    ):
        from src.auth.register import create_account

        resp = await create_account("taken@test.com")

        assert resp.status_code == 409
        body = json.loads(resp.body)
        assert body["error"] == "email_taken"
