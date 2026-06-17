"""
Unit tests for the writer-side acceptance pipeline (src.atproto.acceptance).

These exercise the pure logic + the gate/promote decisions with a fake DB
connection and patched PDS calls — no real Postgres or PDS needed.
"""

import pytest
from unittest.mock import AsyncMock, patch

from src.atproto import acceptance


# ---------------------------------------------------------------------------
# Fake asyncpg connection: dispatch fetchrow by a substring of the SQL.
# ---------------------------------------------------------------------------
class FakeConn:
    def __init__(self, responses: dict):
        self._responses = responses  # SQL-substring -> row dict | None
        self.calls = []

    async def fetchrow(self, sql, *params):
        self.calls.append((sql, params))
        for key, val in self._responses.items():
            if key in sql:
                return val
        return None


USER_RECORD = {
    "$type": "app.ch.poltr.ballot.argument",
    "title": "T",
    "body": "B",
    "type": "PRO",
    "ballot": "663",
    "source": {"$type": "app.ch.poltr.ballot.argument#sourceUser", "authorDid": "did:plc:user"},
}

ARG_ROW = {
    "id": 1,
    "user_uri": "at://did:plc:user/app.ch.poltr.ballot.argument/abc",
    "user_cid": "bafyuser",
    "did": "did:plc:user",
    "ballot": "663",
    "record": USER_RECORD,
}


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------
def test_community_rkey_deterministic_and_distinct():
    a = acceptance._community_rkey("at://did:plc:user/c/abc")
    assert a == acceptance._community_rkey("at://did:plc:user/c/abc")  # stable
    assert a != acceptance._community_rkey("at://did:plc:user/c/xyz")  # distinct
    assert len(a) == 24 and all(ch in "0123456789abcdef" for ch in a)  # valid rkey charset


def test_as_dict_handles_str_dict_none():
    assert acceptance._as_dict('{"a": 1}') == {"a": 1}
    assert acceptance._as_dict({"a": 1}) == {"a": 1}
    assert acceptance._as_dict(None) is None
    assert acceptance._as_dict("not json") is None


# ---------------------------------------------------------------------------
# _accept_argument
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_accept_argument_happy_path_writes_community_record():
    conn = FakeConn({
        "v_eligible_participants": {"eligible": True},
        "community_accounts": {"did": "did:plc:community"},
    })
    with patch.object(acceptance, "get_community_record", AsyncMock(return_value=None)), \
         patch.object(acceptance, "create_community_record", AsyncMock(return_value={"uri": "x", "cid": "y"})) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)

    assert (status, reason) == ("done", None)
    create.assert_awaited_once()
    args = create.await_args.args
    # create_community_record(client, community_did, NSID, community, rkey=...)
    assert args[1] == "did:plc:community"
    assert args[2] == acceptance.ARGUMENT_NSID
    community = args[3]
    # content copied + provenance reference added to the source union
    assert community["title"] == "T"
    assert community["source"]["originUri"] == ARG_ROW["user_uri"]
    assert community["source"]["originCid"] == ARG_ROW["user_cid"]
    assert create.await_args.kwargs["rkey"] == acceptance._community_rkey(ARG_ROW["user_uri"])


@pytest.mark.asyncio
async def test_accept_argument_rejects_ineligible():
    conn = FakeConn({"v_eligible_participants": {"eligible": False},
                     "community_accounts": {"did": "did:plc:community"}})
    with patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)
    assert (status, reason) == ("rejected", "not_eligible")
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_argument_rejects_when_no_community_account():
    conn = FakeConn({"v_eligible_participants": {"eligible": True}})  # community_accounts -> None
    with patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)
    assert (status, reason) == ("rejected", "no_community_account")
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_argument_idempotent_when_already_exists():
    conn = FakeConn({"v_eligible_participants": {"eligible": True},
                     "community_accounts": {"did": "did:plc:community"}})
    with patch.object(acceptance, "get_community_record", AsyncMock(return_value={"already": "there"})), \
         patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)
    assert (status, reason) == ("done", None)
    create.assert_not_awaited()  # crash-recovery: do not double-write


# ---------------------------------------------------------------------------
# _accept_response
# ---------------------------------------------------------------------------
RESP_RECORD = {
    "$type": "app.ch.poltr.peerreview.response",
    "argument": "at://did:plc:community/app.ch.poltr.ballot.argument/argrkey",
    "reviewer": "did:plc:reviewer",
    "vote": "APPROVE",
}
RESP_ROW = {
    "id": 2,
    "user_uri": "at://did:plc:reviewer/app.ch.poltr.peerreview.response/r1",
    "user_cid": "bafiresp",
    "did": "did:plc:reviewer",
    "ballot": None,
    "record": RESP_RECORD,
}


@pytest.mark.asyncio
async def test_accept_response_happy_path():
    conn = FakeConn({
        "v_eligible_participants": {"eligible": True},
        "app_arguments": {"did": "did:plc:community"},
    })
    with patch.object(acceptance, "get_community_record", AsyncMock(return_value=None)), \
         patch.object(acceptance, "create_community_record", AsyncMock(return_value={"uri": "x"})) as create:
        status, reason = await acceptance._accept_response(AsyncMock(), conn, RESP_ROW)

    assert (status, reason) == ("done", None)
    community = create.await_args.args[3]
    assert community["originUri"] == RESP_ROW["user_uri"]   # top-level provenance for responses
    assert community["originCid"] == RESP_ROW["user_cid"]
    assert create.await_args.args[2] == acceptance.RESPONSE_NSID
    # rkey matches the legacy compose_review_rkey so dedup/quorum behave identically
    assert create.await_args.kwargs["rkey"] == acceptance.compose_review_rkey(
        RESP_RECORD["argument"], RESP_ROW["did"]
    )


@pytest.mark.asyncio
async def test_accept_response_rejects_when_argument_unknown():
    conn = FakeConn({"v_eligible_participants": {"eligible": True}})  # app_arguments -> None
    with patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_response(AsyncMock(), conn, RESP_ROW)
    assert (status, reason) == ("rejected", "argument_not_found")
    create.assert_not_awaited()


# ---------------------------------------------------------------------------
# _accept_request (Phase 6 — pull-model review assignment)
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_accept_request_runs_assignment_when_eligible():
    conn = FakeConn({"v_eligible_participants": {"eligible": True}})
    with patch.object(acceptance, "maybe_assign_reviews_for_user", AsyncMock()) as assign:
        status, reason = await acceptance._accept_request(AsyncMock(), conn, {"did": "did:plc:user"})
    assert (status, reason) == ("done", None)
    assign.assert_awaited_once_with("did:plc:user")


@pytest.mark.asyncio
async def test_accept_request_rejects_ineligible():
    conn = FakeConn({"v_eligible_participants": {"eligible": False}})
    with patch.object(acceptance, "maybe_assign_reviews_for_user", AsyncMock()) as assign:
        status, reason = await acceptance._accept_request(AsyncMock(), conn, {"did": "did:plc:user"})
    assert (status, reason) == ("rejected", "not_eligible")
    assign.assert_not_awaited()
