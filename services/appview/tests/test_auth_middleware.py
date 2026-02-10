"""
Tests for session middleware (verify_session_token).
"""

import json
from datetime import datetime, timedelta
from unittest.mock import patch

import pytest

from tests.conftest import FakePool


def make_session_row(token="valid-token", did="did:plc:abc", expired=False):
    exp = datetime.utcnow() + (timedelta(days=-1) if expired else timedelta(days=7))
    return {
        "session_token": token,
        "did": did,
        "user_data": json.dumps({"did": did, "handle": "user.poltr.info", "displayName": "user"}),
        "expires_at": exp,
        "last_accessed_at": datetime.utcnow(),
        "access_token": "at-jwt",
        "refresh_token": "rt-jwt",
    }


@pytest.mark.asyncio
async def test_valid_session_from_cookie():
    """Should return TSession for valid cookie."""
    row = make_session_row(token="good-token")
    pool = FakePool({"auth_sessions": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.middleware import verify_session_token

        session = await verify_session_token(
            authorization=None,
            session_token="good-token",
        )

        assert session.did == "did:plc:abc"
        assert session.token == "good-token"
        assert session.access_token == "at-jwt"

        # Should have updated last_accessed_at
        conn = pool.last_conn
        updates = [q for q in conn.executed if q[0] == "execute" and "UPDATE" in q[1]]
        assert len(updates) == 1
        assert "auth_sessions" in updates[0][1]


@pytest.mark.asyncio
async def test_valid_session_from_bearer():
    """Should accept Authorization: Bearer header."""
    row = make_session_row(token="bearer-token")
    pool = FakePool({"auth_sessions": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.middleware import verify_session_token

        session = await verify_session_token(
            authorization="Bearer bearer-token",
            session_token=None,
        )

        assert session.did == "did:plc:abc"


@pytest.mark.asyncio
async def test_no_token_raises_401():
    """Should raise 401 when no token provided."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        from src.auth.middleware import verify_session_token
        await verify_session_token(authorization=None, session_token=None)

    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_raises_401():
    """Should raise 401 for unknown session token."""
    from fastapi import HTTPException

    pool = FakePool({"auth_sessions": []})

    with patch("src.lib.db.pool", pool):
        from src.auth.middleware import verify_session_token

        with pytest.raises(HTTPException) as exc_info:
            await verify_session_token(
                authorization=None,
                session_token="unknown-token",
            )

        assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_expired_session_raises_401_and_deletes():
    """Should raise 401 and delete the expired session row."""
    from fastapi import HTTPException

    row = make_session_row(token="old-token", expired=True)
    pool = FakePool({"auth_sessions": [row]})

    with patch("src.lib.db.pool", pool):
        from src.auth.middleware import verify_session_token

        with pytest.raises(HTTPException) as exc_info:
            await verify_session_token(
                authorization=None,
                session_token="old-token",
            )

        assert exc_info.value.status_code == 401

        # Should have deleted the expired session
        conn = pool.last_conn
        deletes = [q for q in conn.executed if q[0] == "execute" and "DELETE" in q[1]]
        assert len(deletes) == 1
        assert "auth_sessions" in deletes[0][1]
