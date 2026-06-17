"""
Phase 7: user-authored argument creation is UNCONDITIONAL — appview always writes
the self-signed record into the user's OWN repo (the flag-gated legacy community
branch was removed). The writer then creates the canonical community record off
the firehose.
"""

import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.routes.deliberation import arguments as args_mod


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
    """Patch every dependency of create_argument except the user-repo write."""
    with patch.object(args_mod, "get_did_for_ballot", AsyncMock(return_value="did:plc:community")), \
         patch.object(args_mod, "reserve", AsyncMock(return_value=1)), \
         patch.object(args_mod, "set_uri", AsyncMock()), \
         patch.object(args_mod, "release", AsyncMock()):
        yield


@pytest.mark.asyncio
async def test_argument_create_always_writes_user_repo(_common_deps):
    user_write = AsyncMock(return_value={"uri": "at://did:plc:user/x", "cid": "c"})
    with patch.object(args_mod, "pds_create_record", user_write):
        await args_mod.create_argument(FakeRequest(BODY), _session())

    user_write.assert_awaited_once()
    call = user_write.await_args
    # written with the USER's own session, as a #sourceUser argument
    assert call.args[0].did == "did:plc:user"
    assert call.args[1] == "app.ch.poltr.ballot.argument"
    assert call.args[2]["source"]["$type"].endswith("#sourceUser")
    assert call.args[2]["source"]["authorDid"] == "did:plc:user"
