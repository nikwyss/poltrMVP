"""
Tests for the unified magic-link flow: ch.poltr.auth.start / checkLink /
waitStatus and the purpose-agnostic short-code verification.
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest

from src.auth.middleware import hash_token
from tests.conftest import (
    FakePool,
    make_creds_row,
    make_pending_login_row,
    make_pending_registration_row,
)
from src.auth.email_hmac import email_digest
from src.auth.magic_link_handler import (
    StartData,
    start_handler,
    CheckLinkData,
    check_link_handler,
    WaitStatusData,
    wait_status_handler,
    VerifyShortCodeData,
    verify_short_code_handler,
    VerifyLoginMagicLinkData,
    verify_login_magic_link_handler,
)


# ── start_handler ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_registration_branch():
    """Unknown email → registration email + neutral 200 carrying initiatorSecret."""
    pool = FakePool({"auth_creds": []})
    with (
        patch("src.core.db.pool", pool),
        patch("src.auth.magic_link_handler.email_service") as mock_email,
    ):
        mock_email.send_confirmation_link = MagicMock(return_value=True)

        resp = await start_handler(StartData(email="new@test.com"))

        assert resp.status_code == 200
        body = json.loads(resp.body)
        assert body["success"] is True
        assert body["initiatorSecret"]  # handed back for the httpOnly cookie
        assert mock_email.send_confirmation_link.call_args[1]["purpose"] == "registration"


@pytest.mark.asyncio
async def test_start_login_branch_collapses_to_one_code():
    """Existing email → login email, and prior login rows are deleted first so
    only ONE live code exists per email (brute-force cap can't be multiplied)."""
    pool = FakePool({"auth_creds": [make_creds_row(email="user@test.com")]})
    with (
        patch("src.core.db.pool", pool),
        patch("src.auth.magic_link_handler.email_service") as mock_email,
    ):
        mock_email.send_confirmation_link = MagicMock(return_value=True)

        resp = await start_handler(StartData(email="user@test.com"))

        assert resp.status_code == 200
        assert mock_email.send_confirmation_link.call_args[1]["purpose"] == "login"
        deletes = [
            q for q in pool.all_executed
            if q[0] == "execute" and "DELETE" in q[1] and "auth_pending_logins" in q[1]
        ]
        assert deletes, "start must delete prior pending-login rows before inserting"


@pytest.mark.asyncio
async def test_start_response_shape_identical_across_branches():
    """Enumeration-safe: new vs existing email yield the same response keys."""
    shapes = []
    for store in ({"auth_creds": []}, {"auth_creds": [make_creds_row(email="user@test.com")]}):
        pool = FakePool(store)
        with (
            patch("src.core.db.pool", pool),
            patch("src.auth.magic_link_handler.email_service") as mock_email,
        ):
            mock_email.send_confirmation_link = MagicMock(return_value=True)
            resp = await start_handler(StartData(email="user@test.com"))
            shapes.append(set(json.loads(resp.body).keys()))
    assert shapes[0] == shapes[1]


# ── check_link_handler (preflight) ───────────────────────────────────────


@pytest.mark.asyncio
async def test_check_link_different_browser_reveals_code():
    row = make_pending_login_row(token="tok", short_code="ABC234", initiator_id=hash_token("other"))
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        resp = await check_link_handler(CheckLinkData(token="tok", initiatorSecret="mine"))
        body = json.loads(resp.body)
        assert body["status"] == "different"
        assert body["purpose"] == "login"
        assert body["code"] == "ABC234"


@pytest.mark.asyncio
async def test_check_link_same_browser_hides_code():
    secret = "mysecret"
    row = make_pending_login_row(token="tok", short_code="ABC234", initiator_id=hash_token(secret))
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        resp = await check_link_handler(CheckLinkData(token="tok", initiatorSecret=secret))
        body = json.loads(resp.body)
        assert body["status"] == "same"
        assert "code" not in body


@pytest.mark.asyncio
async def test_check_link_invalid_token():
    pool = FakePool({"auth_pending_logins": []})
    with patch("src.core.db.pool", pool):
        resp = await check_link_handler(CheckLinkData(token="nope", initiatorSecret="x"))
        assert resp.status_code == 400
        assert json.loads(resp.body)["error"] == "invalid_token"


# ── verify_short_code_handler (purpose-agnostic) ─────────────────────────


@pytest.mark.asyncio
async def test_verify_short_code_login_purpose():
    row = make_pending_login_row(email="user@test.com", short_code="ABC234")
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        result = await verify_short_code_handler(
            VerifyShortCodeData(email="user@test.com", code="ABC234")
        )
        assert result == (email_digest("user@test.com"), None, "login")


@pytest.mark.asyncio
async def test_verify_short_code_registration_purpose():
    row = make_pending_registration_row(email="new@test.com", short_code="ABC234")
    pool = FakePool({"auth_pending_registrations": [row]})
    with patch("src.core.db.pool", pool):
        result = await verify_short_code_handler(
            VerifyShortCodeData(email="new@test.com", code="ABC234")
        )
        assert result == (email_digest("new@test.com"), None, "registration")


@pytest.mark.asyncio
async def test_verify_short_code_wrong_device_rejected():
    """Device binding: a caller without the matching initiator cookie is rejected
    (before any attempt is counted), even with the correct code."""
    row = make_pending_login_row(
        email="user@test.com", short_code="ABC234", initiator_id=hash_token("startgeraet")
    )
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        resp = await verify_short_code_handler(
            VerifyShortCodeData(email="user@test.com", code="ABC234", initiatorSecret="anderes")
        )
        assert resp.status_code == 403
        assert json.loads(resp.body)["error"] == "different_browser"


@pytest.mark.asyncio
async def test_verify_short_code_same_device_ok():
    """Matching initiator cookie → redemption succeeds."""
    secret = "startgeraet"
    row = make_pending_login_row(
        email="user@test.com", short_code="ABC234", initiator_id=hash_token(secret)
    )
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        result = await verify_short_code_handler(
            VerifyShortCodeData(email="user@test.com", code="ABC234", initiatorSecret=secret)
        )
        assert result == (email_digest("user@test.com"), None, "login")


# ── verify_login device binding ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_verify_login_wrong_device_rejected():
    row = make_pending_login_row(token="tok", initiator_id=hash_token("startgeraet"))
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        resp = await verify_login_magic_link_handler(
            VerifyLoginMagicLinkData(token="tok", initiatorSecret="anderes")
        )
        assert resp.status_code == 403
        assert json.loads(resp.body)["error"] == "different_browser"
        # Row must NOT be consumed — the legit device can still use it.
        deletes = [q for q in pool.all_executed if q[0] == "execute" and "DELETE" in q[1]]
        assert not deletes


@pytest.mark.asyncio
async def test_verify_login_same_device_ok():
    secret = "startgeraet"
    row = make_pending_login_row(email="user@test.com", token="tok", initiator_id=hash_token(secret))
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        result = await verify_login_magic_link_handler(
            VerifyLoginMagicLinkData(token="tok", initiatorSecret=secret)
        )
        assert result == (email_digest("user@test.com"), None)


@pytest.mark.asyncio
async def test_verify_short_code_wrong_code():
    row = make_pending_login_row(email="user@test.com", short_code="ABC234")
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        resp = await verify_short_code_handler(
            VerifyShortCodeData(email="user@test.com", code="ZZZZZZ")
        )
        assert resp.status_code == 400
        body = json.loads(resp.body)
        assert body["error"] == "invalid_code"
        # remaining_attempts is surfaced (exact value depends on the DB-side
        # increment, which the fake pool doesn't execute).
        assert "remaining_attempts" in body


# ── wait_status_handler (polling) ────────────────────────────────────────


@pytest.mark.asyncio
async def test_wait_status_authenticated():
    sess = {"session_token": hash_token("tok"), "expires_at": datetime.utcnow() + timedelta(days=1)}
    pool = FakePool({"auth_sessions": [sess]})
    with patch("src.core.db.pool", pool):
        resp = await wait_status_handler(WaitStatusData(initiatorSecret="s"), "tok")
        assert json.loads(resp.body)["state"] == "authenticated"


@pytest.mark.asyncio
async def test_wait_status_pending():
    row = make_pending_login_row(initiator_id=hash_token("s"))
    pool = FakePool({"auth_pending_logins": [row]})
    with patch("src.core.db.pool", pool):
        resp = await wait_status_handler(WaitStatusData(initiatorSecret="s"), None)
        assert json.loads(resp.body)["state"] == "pending"


@pytest.mark.asyncio
async def test_wait_status_gone():
    pool = FakePool({})
    with patch("src.core.db.pool", pool):
        resp = await wait_status_handler(WaitStatusData(initiatorSecret="s"), None)
        assert json.loads(resp.body)["state"] == "gone"
