"""submit_review delegates its DB-state authorization to the shared SQL gate
app_response_gate(); this verifies the reason->HTTP-response mapping (the appview
side of the writer-first parity) plus the happy path and the endpoint-local checks
(already_reviewed, vote validity). Called directly — like test_user_repo_write —
to avoid the full auth/HTTP stack; the DB is a substring-dispatch fake.
"""

import json
import pytest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from src.routes.deliberation import reviews as reviews_mod


class FakeRequest:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


class _Ctx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class FakeConn:
    """Dispatches submit_review's three fetchval queries by SQL substring."""

    def __init__(self, gate_reason=None, closed_at=None, existing=None,
                 community_did="did:plc:community"):
        self._gate = gate_reason
        self._closed_at = closed_at
        self._existing = existing
        self._community_did = community_did

    def transaction(self):
        return _Ctx()

    async def fetchrow(self, sql, *params):
        # only the `SELECT closed_at FROM app_peerreviews ... FOR UPDATE` lock
        return {"closed_at": self._closed_at}

    async def fetchval(self, sql, *params):
        if "app_response_gate" in sql:
            return self._gate
        if "app_peerreview_responses" in sql:
            return self._existing
        if "app_arguments" in sql:
            return self._community_did
        return None


class _Acquire:
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *exc):
        return False


class FakePool:
    def __init__(self, conn):
        self._conn = conn

    def acquire(self):
        return _Acquire(self._conn)


def _session():
    return SimpleNamespace(did="did:plc:reviewer", token="t", access_token="a")


BODY = {
    "argumentUri": "at://did:plc:community/app.ch.poltr.ballot.argument/x",
    "criteria": [{"key": "coherence", "label": "Stimmigkeit", "assessment": "ok"}],
    "vote": "APPROVE",
    "justification": "",
}


@pytest.fixture(autouse=True)
def _no_rate_limit():
    from src.core.fastapi import limiter
    limiter.enabled = False
    yield
    limiter.enabled = True


async def _call(conn, body=BODY):
    with patch.object(reviews_mod, "get_pool", AsyncMock(return_value=FakePool(conn))), \
         patch.object(reviews_mod, "pds_create_record",
                      AsyncMock(return_value={"uri": "at://did:plc:reviewer/resp"})) as pds:
        resp = await reviews_mod.submit_review(FakeRequest(body), _session())
    return resp, pds


@pytest.mark.asyncio
async def test_submit_happy_path_writes_reviewer_repo():
    resp, pds = await _call(FakeConn(gate_reason=None))
    assert resp.status_code == 200
    pds.assert_awaited_once()
    # self-signed into the reviewer's OWN repo as a response record
    assert pds.await_args.args[1] == "app.ch.poltr.peerreview.response"


@pytest.mark.asyncio
@pytest.mark.parametrize("reason,code,err", [
    ("no_peerreview", 404, "not_found"),
    ("not_invited", 403, "not_invited"),
    ("review_closed", 409, "review_closed"),
    ("not_checked_in", 409, "not_checked_in"),
])
async def test_submit_maps_gate_reason(reason, code, err):
    resp, pds = await _call(FakeConn(gate_reason=reason))
    assert resp.status_code == code
    assert json.loads(resp.body)["error"] == err
    pds.assert_not_awaited()


@pytest.mark.asyncio
async def test_submit_review_closed_echoes_accepted_draft():
    # The 409 review_closed contract: hand the draft + closedAt back to the frontend.
    resp, _ = await _call(FakeConn(gate_reason="review_closed"))
    body = json.loads(resp.body)
    assert body["acceptedDraft"]["vote"] == "APPROVE"
    assert "closedAt" in body


@pytest.mark.asyncio
async def test_submit_already_reviewed_is_endpoint_local():
    # no-prior stays endpoint-local (not in the shared gate).
    resp, pds = await _call(FakeConn(gate_reason=None, existing="at://did:plc:reviewer/prev"))
    assert resp.status_code == 409
    assert json.loads(resp.body)["error"] == "already_reviewed"
    pds.assert_not_awaited()


@pytest.mark.asyncio
async def test_submit_allows_empty_criteria():
    # Kriterien sind optional (Default: nichts gewählt) → leere Liste ist gültig,
    # solange ein valides Gesamturteil vorliegt.
    resp, pds = await _call(FakeConn(gate_reason=None), body={**BODY, "criteria": []})
    assert resp.status_code == 200
    pds.assert_awaited_once()


@pytest.mark.asyncio
async def test_submit_missing_criteria_400():
    # Feld muss vorhanden & eine Liste sein (None/fehlend → 400).
    resp, pds = await _call(FakeConn(), body={**BODY, "criteria": None})
    assert resp.status_code == 400
    pds.assert_not_awaited()


@pytest.mark.asyncio
async def test_submit_invalid_vote_400():
    resp, pds = await _call(FakeConn(), body={**BODY, "vote": "MAYBE"})
    assert resp.status_code == 400
    pds.assert_not_awaited()


@pytest.mark.asyncio
async def test_submit_reject_requires_justification_400():
    resp, pds = await _call(FakeConn(), body={**BODY, "vote": "REJECT", "justification": ""})
    assert resp.status_code == 400
    pds.assert_not_awaited()
