"""Acceptance pipeline (ATProto-native path, Phase 3) — the writer side.

User-authored argument records land in their OWN repos (self-signed). The
projector (indexer) stages them into `app_acceptance_queue`. This module — run by
the writer process (src.main) when ACCEPTANCE_PIPELINE_ENABLED=true —
drains that queue: gates each item (eligibility), then writes the canonical
community record into the community repo (the user content copied + a
`source:{originUri,originCid}` provenance reference). The community-authored
community record flows back through the firehose and is projected into
app_arguments the normal way.

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

    gov = await conn.fetchrow(
        "SELECT did FROM app_arguments WHERE uri = $1", argument_uri
    )
    community_did = gov["did"] if gov else None
    if not community_did:
        return ("rejected", "argument_not_found")

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
