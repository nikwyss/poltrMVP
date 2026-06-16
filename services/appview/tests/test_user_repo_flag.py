"""
Tests for the Phase 3/4 feature flags that route user-authored writes to the
user's own repo (ATProto-native) vs. the governance repo (legacy).
"""

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.routes.deliberation import arguments as args_mod
from src.routes.deliberation.arguments import _args_user_repo_enabled
from src.routes.deliberation.reviews import _responses_user_repo_enabled


# ---------------------------------------------------------------------------
# Flag helpers read their env var (default off)
# ---------------------------------------------------------------------------
def test_args_flag_helper(monkeypatch):
    monkeypatch.delenv("APPVIEW_ARGS_USER_REPO_ENABLED", raising=False)
    assert _args_user_repo_enabled() is False
    monkeypatch.setenv("APPVIEW_ARGS_USER_REPO_ENABLED", "true")
    assert _args_user_repo_enabled() is True
    monkeypatch.setenv("APPVIEW_ARGS_USER_REPO_ENABLED", "false")
    assert _args_user_repo_enabled() is False


def test_responses_flag_helper(monkeypatch):
    monkeypatch.delenv("APPVIEW_RESPONSES_USER_REPO_ENABLED", raising=False)
    assert _responses_user_repo_enabled() is False
    monkeypatch.setenv("APPVIEW_RESPONSES_USER_REPO_ENABLED", "true")
    assert _responses_user_repo_enabled() is True


# ---------------------------------------------------------------------------
# Argument-create dispatch: flag decides user-repo vs governance write
# ---------------------------------------------------------------------------
class FakeRequest:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


def _session():
    return SimpleNamespace(did="did:plc:user", token="t", access_token="a")


BODY = {"ballot": "663", "title": "T", "body": "B", "type": "PRO"}


@pytest.fixture(autouse=True)
def _no_rate_limit():
    from src.core.fastapi import limiter
    limiter.enabled = False
    yield
    limiter.enabled = True


@pytest.fixture
def _common_deps():
    """Patch every dependency of create_argument except the two write funcs."""
    with patch.object(args_mod, "get_did_for_ballot", AsyncMock(return_value="did:plc:gov")), \
         patch.object(args_mod, "reserve", AsyncMock(return_value=1)), \
         patch.object(args_mod, "set_uri", AsyncMock()), \
         patch.object(args_mod, "release", AsyncMock()):
        yield


@pytest.mark.asyncio
async def test_argument_create_flag_on_writes_user_repo(monkeypatch, _common_deps):
    monkeypatch.setenv("APPVIEW_ARGS_USER_REPO_ENABLED", "true")
    user_write = AsyncMock(return_value={"uri": "at://did:plc:user/x", "cid": "c"})
    gov_write = AsyncMock(return_value={"uri": "at://did:plc:gov/x", "cid": "c"})
    with patch.object(args_mod, "pds_create_record", user_write), \
         patch.object(args_mod, "create_governance_record", gov_write):
        await args_mod.create_argument(FakeRequest(BODY), _session())
    user_write.assert_awaited_once()
    gov_write.assert_not_awaited()


@pytest.mark.asyncio
async def test_argument_create_flag_off_writes_governance(monkeypatch, _common_deps):
    monkeypatch.setenv("APPVIEW_ARGS_USER_REPO_ENABLED", "false")
    user_write = AsyncMock(return_value={"uri": "at://did:plc:user/x", "cid": "c"})
    gov_write = AsyncMock(return_value={"uri": "at://did:plc:gov/x", "cid": "c"})
    with patch.object(args_mod, "pds_create_record", user_write), \
         patch.object(args_mod, "create_governance_record", gov_write):
        await args_mod.create_argument(FakeRequest(BODY), _session())
    gov_write.assert_awaited_once()
    user_write.assert_not_awaited()
