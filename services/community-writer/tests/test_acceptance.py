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
    def __init__(self, responses: dict, vals: dict | None = None):
        self._responses = responses  # SQL-substring -> fetchrow row dict | None
        self._vals = vals or {}      # SQL-substring -> fetchval scalar
        self.calls = []
        self.executed = []

    async def fetchrow(self, sql, *params):
        self.calls.append((sql, params))
        for key, val in self._responses.items():
            if key in sql:
                return val
        return None

    async def fetchval(self, sql, *params):
        self.calls.append((sql, params))
        for key, val in self._vals.items():
            if key in sql:
                return val
        return None

    async def execute(self, sql, *params):
        self.executed.append((sql, params))
        return "OK"


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


def test_shared_content_quota_lock_key_and_limits():
    # Backstop: lock_key must be deterministic + input-sensitive so it stays in the
    # same advisory-lock space as appview reserve() (mirror of src/core/content_quota).
    from src.shared import content_quota
    k = content_quota.lock_key("did:plc:x", "argument", "663")
    assert k == content_quota.lock_key("did:plc:x", "argument", "663")   # stable
    assert k != content_quota.lock_key("did:plc:x", "argument", "664")   # ballot-sensitive
    assert k != content_quota.lock_key("did:plc:y", "argument", "663")   # did-sensitive
    assert -(2 ** 63) <= k < 2 ** 63                                      # signed 64-bit
    for kind in ("argument", "comment"):
        daily, ballot = content_quota.limits_for(kind)
        assert isinstance(daily, int) and isinstance(ballot, int) and daily <= ballot


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


@pytest.mark.asyncio
async def test_accept_argument_rejects_when_daily_quota_exceeded():
    # No ledger row for this uri (direct-to-PDS write) → quota enforced here.
    conn = FakeConn(
        {"v_eligible_participants": {"eligible": True},
         "community_accounts": {"did": "did:plc:community"},
         "FROM app_content_creations": {"daily": 5, "lifetime": 5}},
    )
    with patch.object(acceptance, "get_community_record", AsyncMock(return_value=None)), \
         patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)
    assert (status, reason) == ("rejected", "quota_daily")
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_argument_rejects_when_ballot_quota_exceeded():
    # Daily under cap, lifetime over the ballot cap.
    conn = FakeConn(
        {"v_eligible_participants": {"eligible": True},
         "community_accounts": {"did": "did:plc:community"},
         "FROM app_content_creations": {"daily": 0, "lifetime": 50}},
    )
    with patch.object(acceptance, "get_community_record", AsyncMock(return_value=None)), \
         patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)
    assert (status, reason) == ("rejected", "quota_ballot")
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_argument_skips_quota_when_ledger_row_exists():
    # appview reserve() already recorded this slot (ledger row keyed to user_uri).
    conn = FakeConn(
        {"v_eligible_participants": {"eligible": True},
         "community_accounts": {"did": "did:plc:community"}},
        vals={"WHERE uri = $1": 1},
    )
    with patch.object(acceptance, "get_community_record", AsyncMock(return_value=None)), \
         patch.object(acceptance, "create_community_record", AsyncMock(return_value={"uri": "x"})) as create:
        status, reason = await acceptance._accept_argument(AsyncMock(), conn, ARG_ROW)
    assert (status, reason) == ("done", None)
    create.assert_awaited_once()
    # legit path already counted → no second ledger INSERT
    assert not any("INSERT INTO app_content_creations" in sql for sql, _ in conn.executed)


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


def _resp_conn(gate_reason=None):
    """FakeConn for a response that resolves to a known community argument; the
    DB-state authorization is delegated to app_response_gate(), so tests just set
    its return value (None = allowed, else a reason). Eligibility + community-DID
    lookup are stubbed; 'did FROM app_arguments' is the community-DID query."""
    return FakeConn(
        {"v_eligible_participants": {"eligible": True},
         "did FROM app_arguments": {"did": "did:plc:community"}},
        vals={"app_response_gate": gate_reason},
    )


@pytest.mark.asyncio
async def test_accept_response_happy_path():
    conn = _resp_conn()
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


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "gate_reason",
    ["no_peerreview", "not_invited", "review_closed", "not_checked_in"],
)
async def test_accept_response_propagates_gate_rejection(gate_reason):
    # The DB-state authorization is the shared app_response_gate(); the writer just
    # propagates whatever reason it returns as a queue rejection.
    conn = _resp_conn(gate_reason=gate_reason)
    with patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_response(AsyncMock(), conn, RESP_ROW)
    assert (status, reason) == ("rejected", gate_reason)
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_response_rejects_invalid_vote():
    conn = _resp_conn()
    row = {**RESP_ROW, "record": {**RESP_RECORD, "vote": "MAYBE"}}
    with patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_response(AsyncMock(), conn, row)
    assert (status, reason) == ("rejected", "invalid_vote")
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_accept_response_rejects_reject_without_justification():
    conn = _resp_conn()
    row = {**RESP_ROW, "record": {**RESP_RECORD, "vote": "REJECT"}}  # no justification
    with patch.object(acceptance, "create_community_record", AsyncMock()) as create:
        status, reason = await acceptance._accept_response(AsyncMock(), conn, row)
    assert (status, reason) == ("rejected", "missing_justification")
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
