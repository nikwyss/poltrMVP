"""Acceptance pipeline (ATProto-native path, Phase 3) — the writer side.

User-authored argument records land in their OWN repos (self-signed). The
projector (indexer) stages them into `app_acceptance_queue`. This module — run by
the writer process (src.main) — drains that queue: gates each item (eligibility,
per-user quota, peer-review authorization), then writes the canonical community
record into the community repo (the user content copied + a
`source:{originUri,originCid}` provenance reference). The community-authored
community record flows back through the firehose and is projected into
app_arguments the normal way.

The gate is the authoritative trust boundary: a user controls their own repo and
can write any record directly to the PDS, bypassing the appview API and its
synchronous checks. Every check that decides whether a record *becomes
authoritative* therefore lives here (mirroring the appview's submit-time checks),
not only in the appview.

Reconcile-bare (L6): the queue row is the unit of work
(pending/done/rejected). A crash leaves it 'pending' for retry; the community
record uses a deterministic create-only rkey, so re-processing can never
double-write. Row claiming uses FOR UPDATE SKIP LOCKED, so multiple writer
instances are safe.
"""

import asyncio
import hashlib
import json
import logging
import os

import httpx

from src.shared.db import get_pool
from src.atproto.community import (
    create_community_record,
    get_community_record,
    compose_review_rkey,
)
from src.arguments.peer_review_assign import maybe_assign_reviews_for_user

logger = logging.getLogger("writer.acceptance")

ARGUMENT_NSID = "app.ch.poltr.ballot.argument"
RESPONSE_NSID = "app.ch.poltr.peerreview.response"
NOTIFY_CHANNEL = "acceptance_queue"


def _poll_interval() -> int:
    return int(os.getenv("ACCEPTANCE_POLL_INTERVAL_SECONDS", "15"))


def _community_rkey(user_uri: str) -> str:
    """Deterministic, collision-free rkey for the community record, derived from
    the globally-unique user-repo at-uri. create-only at this rkey makes
    re-processing idempotent (the PDS rejects a duplicate before any commit)."""
    return hashlib.sha256(user_uri.encode("utf-8")).hexdigest()[:24]


def _as_dict(value):
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return None
    return value


# --- Per-(user, ballot) argument quota -------------------------------------
# Mirrors appview src/routes/deliberation/quota.py. The writer is the
# authoritative gate: the appview reserve() path writes an app_content_creations
# ledger row keyed to the user-repo uri. A direct-to-PDS write (bypassing the
# appview API and its quota) has no such row — so we enforce the same caps here
# and record the slot, making the cap hold regardless of entry path. Same env
# vars / defaults as appview, so both sides agree.
def _arg_daily_limit() -> int:
    return int(os.getenv("APPVIEW_ARGUMENT_DAILY_LIMIT", "2"))


def _arg_ballot_limit() -> int:
    return int(os.getenv("APPVIEW_ARGUMENT_BALLOT_LIMIT", "10"))


def _quota_lock_key(did: str, kind: str, ballot_rkey: str) -> int:
    """Stable signed 64-bit advisory-lock key — identical formula to appview
    quota._lock_key, so appview reserve() and writer reconciliation serialize on
    the same key space (count+insert is race-free across both)."""
    digest = hashlib.blake2b(
        f"{did}|{kind}|{ballot_rkey}".encode(), digest_size=8
    ).digest()
    return int.from_bytes(digest, "big", signed=True)


async def _enforce_argument_quota(conn, did, ballot_rkey, user_uri) -> str | None:
    """Authoritatively enforce the per-(user, ballot) argument caps. Returns a
    rejection reason ('quota_daily' | 'quota_ballot'), or None to proceed.

    Legit appview creates already hold a ledger row (uri = user-repo uri) — those
    were counted at reserve() time, so we skip them (no double-count). Only records
    with no ledger row (direct-to-PDS writes) are counted + recorded here. The
    ledger is append-only and `uri` is UNIQUE, so the insert is idempotent."""
    already = await conn.fetchval(
        "SELECT 1 FROM app_content_creations WHERE uri = $1", user_uri
    )
    if already:
        return None
    # Serialize count+insert per (user, kind, ballot) against concurrent appview
    # reserve()/other writer instances — same advisory-lock key space.
    await conn.execute(
        "SELECT pg_advisory_xact_lock($1)",
        _quota_lock_key(did, "argument", ballot_rkey),
    )
    counts = await conn.fetchrow(
        """
        SELECT
          count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS daily,
          count(*) AS lifetime
        FROM app_content_creations
        WHERE did = $1 AND kind = 'argument' AND ballot_rkey = $2
        """,
        did, ballot_rkey,
    )
    daily_used = (counts["daily"] if counts else 0) or 0
    ballot_used = (counts["lifetime"] if counts else 0) or 0
    if daily_used >= _arg_daily_limit():
        return "quota_daily"
    if ballot_used >= _arg_ballot_limit():
        return "quota_ballot"
    await conn.execute(
        "INSERT INTO app_content_creations (did, kind, ballot_rkey, uri) "
        "VALUES ($1, 'argument', $2, $3) ON CONFLICT (uri) DO NOTHING",
        did, ballot_rkey, user_uri,
    )
    return None


async def _accept_argument(client, conn, row) -> tuple[str, str | None]:
    """Gate + promote one staged argument. Returns (status, reason). Reads run on
    the already-locked `conn` (no extra pool acquisition inside the row txn)."""
    did = row["did"]

    elig = await conn.fetchrow(
        "SELECT eligible FROM auth.v_eligible_participants WHERE did = $1", did
    )
    if not elig or not elig["eligible"]:
        return ("rejected", "not_eligible")

    ballot = row["ballot"]
    gov = (
        await conn.fetchrow(
            "SELECT did FROM auth.community_accounts WHERE ballot_rkey = $1",
            str(ballot),
        )
        if ballot is not None
        else None
    )
    community_did = gov["did"] if gov else None
    if not community_did:
        return ("rejected", "no_community_account")

    user_record = _as_dict(row["record"])
    if not user_record:
        return ("rejected", "no_record")

    rkey = _community_rkey(row["user_uri"])

    # Idempotency / crash-recovery: community record already there (written, but
    # we crashed before marking 'done') → treat as accepted.
    existing = await get_community_record(client, community_did, ARGUMENT_NSID, rkey)
    if existing is not None:
        return ("done", None)

    # Quota gate (authoritative): enforce the per-(user, ballot) caps. Skips the
    # legit appview path (already-reserved ledger row); counts + caps direct-to-PDS
    # writes that bypassed the appview API. `ballot` is non-null here (a null ballot
    # already returned 'no_community_account' above).
    quota_reason = await _enforce_argument_quota(conn, did, str(ballot), row["user_uri"])
    if quota_reason:
        return ("rejected", quota_reason)

    # Copy the user content + add the provenance reference to the user original.
    community = dict(user_record)
    source = dict(community.get("source") or {})
    source["originUri"] = row["user_uri"]
    source["originCid"] = row["user_cid"]
    community["source"] = source

    await create_community_record(client, community_did, ARGUMENT_NSID, community, rkey=rkey)
    return ("done", None)


async def _accept_response(client, conn, row) -> tuple[str, str | None]:
    """Gate + promote one staged peer-review response. The community repo is the
    one holding the referenced (community) argument; the rkey matches the legacy
    compose_review_rkey so dedup/quorum behave identically."""
    did = row["did"]

    elig = await conn.fetchrow(
        "SELECT eligible FROM auth.v_eligible_participants WHERE did = $1", did
    )
    if not elig or not elig["eligible"]:
        return ("rejected", "not_eligible")

    user_record = _as_dict(row["record"])
    if not user_record:
        return ("rejected", "no_record")

    argument_uri = user_record.get("argument")
    if not argument_uri:
        return ("rejected", "no_argument_ref")

    # Validate the vote (mirror appview submit_review): APPROVE/REJECT only, and a
    # REJECT needs a justification.
    vote = user_record.get("vote")
    if vote not in ("APPROVE", "REJECT"):
        return ("rejected", "invalid_vote")
    if vote == "REJECT" and not (user_record.get("justification") or "").strip():
        return ("rejected", "missing_justification")

    gov = await conn.fetchrow(
        "SELECT did FROM app_arguments WHERE uri = $1", argument_uri
    )
    community_did = gov["did"] if gov else None
    if not community_did:
        return ("rejected", "argument_not_found")

    # Authorization gate (mirror appview submit_review, against authoritative DB
    # state): the response must come from an invited, checked-in reviewer on a
    # review that is still open. A direct-to-PDS response that bypassed the appview
    # API is gated here. (Rejecting on 'closed' matches submit_review; the
    # NOTIFY-driven drain runs near-instantly, so a legit response losing the race
    # to a closing review is a rare edge.)
    pr = await conn.fetchrow(
        """
        SELECT state FROM app_peerreviews
        WHERE argument_uri = $1
          AND EXISTS (SELECT 1 FROM app_arguments a WHERE a.uri = $1 AND NOT a.deleted)
        """,
        argument_uri,
    )
    if not pr:
        return ("rejected", "no_peerreview")
    if pr["state"] == "closed":
        return ("rejected", "review_closed")
    inv = await conn.fetchrow(
        """
        SELECT checked_in_at FROM app_peerreview_invitations
        WHERE argument_uri = $1 AND invitee_did = $2 AND invited = true
        """,
        argument_uri, did,
    )
    if not inv:
        return ("rejected", "not_invited")
    if inv["checked_in_at"] is None:
        return ("rejected", "not_checked_in")

    rkey = compose_review_rkey(argument_uri, did)
    existing = await get_community_record(client, community_did, RESPONSE_NSID, rkey)
    if existing is not None:
        return ("done", None)

    community = dict(user_record)
    community["originUri"] = row["user_uri"]
    community["originCid"] = row["user_cid"]

    await create_community_record(client, community_did, RESPONSE_NSID, community, rkey=rkey)
    return ("done", None)


async def _accept_request(client, conn, row) -> tuple[str, str | None]:
    """A user requested review assignment (Phase 6 pull model). Gate eligibility,
    then run the reused assignment logic (lottery/daily-limit/slots), which writes
    the invitation records into the community repo."""
    did = row["did"]
    elig = await conn.fetchrow(
        "SELECT eligible FROM auth.v_eligible_participants WHERE did = $1", did
    )
    if not elig or not elig["eligible"]:
        return ("rejected", "not_eligible")
    await maybe_assign_reviews_for_user(did)
    return ("done", None)


async def _drain(pool) -> None:
    """Process all currently-pending argument rows (one locked row at a time)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    row = await conn.fetchrow(
                        """
                        SELECT id, user_uri, user_cid, did, kind, ballot, record
                        FROM app_acceptance_queue
                        WHERE status = 'pending' AND kind IN ('argument', 'response', 'request')
                        ORDER BY created_at
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                        """
                    )
                    if row is None:
                        return
                    # A transient failure (PDS/network) raises → the txn rolls
                    # back → the row stays 'pending' and is retried next drain.
                    if row["kind"] == "argument":
                        status, reason = await _accept_argument(client, conn, row)
                    elif row["kind"] == "response":
                        status, reason = await _accept_response(client, conn, row)
                    elif row["kind"] == "request":
                        status, reason = await _accept_request(client, conn, row)
                    else:
                        status, reason = ("rejected", f"unknown_kind:{row['kind']}")
                    await conn.execute(
                        "UPDATE app_acceptance_queue "
                        "SET status = $2, reason = $3, updated_at = now() WHERE id = $1",
                        row["id"], status, reason,
                    )
            if status == "done":
                logger.info("Accepted argument %s → community record", row["user_uri"])
            else:
                logger.info("Rejected argument %s: %s", row["user_uri"], reason)


async def run_acceptance_forever():
    """LISTEN/NOTIFY-driven drain loop with a periodic safety poll."""
    pool = await get_pool()
    listen_conn = await pool.acquire()
    wake = asyncio.Event()

    def _on_notify(*_args):
        wake.set()

    await listen_conn.add_listener(NOTIFY_CHANNEL, _on_notify)
    logger.info("Acceptance loop started (LISTEN %s)", NOTIFY_CHANNEL)
    try:
        while True:
            wake.clear()  # clear BEFORE draining → a NOTIFY during drain re-wakes us
            try:
                await _drain(pool)
            except Exception as err:
                logger.error("Acceptance drain error (will retry): %s", err)
            try:
                await asyncio.wait_for(wake.wait(), timeout=_poll_interval())
            except asyncio.TimeoutError:
                pass
    finally:
        try:
            await listen_conn.remove_listener(NOTIFY_CHANNEL, _on_notify)
        finally:
            await pool.release(listen_conn)
