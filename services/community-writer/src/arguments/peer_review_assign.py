"""
On-demand peer-review assignment, triggered by user activity (auth middleware).

Replaces the legacy background-worker model: instead of periodically polling
preliminary arguments and inviting eligible users, we wait for each user to
make an authenticated request and decide *then* whether they get new review
invitations. Inactive users never get assigned — their slots stay open for
active users to fill.

Constraints (peer-review config is writer-owned → PEER_REVIEW_* in writer-secrets;
only the master switch APPVIEW_PEER_REVIEW_ENABLED is shared with the appview):
  - PEER_REVIEW_DAILY_LIMIT              max new active invitations per user PER
                                         BALLOT in a sliding 24h window
                                         (default 3). Bounds the *rate* of new
                                         invitations on each Vorlage independently.
  - PEER_REVIEW_OPEN_LIMIT              max *standing* open invitations a user may
                                         hold PER BALLOT at once (default 4).
                                         Bounds the *backlog*: a user who logs in
                                         daily but never reviews stops getting new
                                         ones for a Vorlage once this many are
                                         pending there, so invitations can no
                                         longer accumulate unboundedly. Per-ballot
                                         (not global) so one Vorlage's backlog
                                         can't starve another. "Open" = invited,
                                         review still open, not yet answered,
                                         argument not deleted — identical to the
                                         set the peerreview.pending banner shows.
  - PEER_REVIEW_INVITE_PROBABILITY       anti-collusion lottery: even when a
                                         slot is free, a candidate argument is
                                         only assigned with this probability
                                         (default 0.35). Misses are recorded
                                         as invited=false pool entries so the
                                         same (argument, user) is never
                                         re-rolled.
  - PEER_REVIEW_HOOK_THROTTLE_SECONDS    minimum spacing between hook
                                         runs for the same user (default 30).

Per-review quorum lives on app_peerreviews.quorum (seeded by the indexer at
argument-creation time from PEER_REVIEW_QUORUM). State='open' is the single
signal that a review still accepts new reviewers.
"""

import logging
import os
import random
from datetime import datetime, timezone

import httpx

from src.atproto.community import compose_review_rkey, create_community_record
from src.shared.db import get_pool

logger = logging.getLogger("peer_review_assign")

# In-memory cache: did -> last hook execution timestamp (UTC).
# Lost on pod restart, which is fine: the next request just runs the hook once
# more. No cross-pod coordination needed because the work is idempotent (the
# deterministic rkey + DB ON CONFLICT guards make duplicate runs safe).
_last_check: dict[str, datetime] = {}


def _daily_limit() -> int:
    return int(os.getenv("PEER_REVIEW_DAILY_LIMIT", "3"))


def _open_limit() -> int:
    return int(os.getenv("PEER_REVIEW_OPEN_LIMIT", "4"))


def _invite_probability() -> float:
    return float(os.getenv("PEER_REVIEW_INVITE_PROBABILITY", "0.35"))


def _throttle_seconds() -> int:
    return int(os.getenv("PEER_REVIEW_HOOK_THROTTLE_SECONDS", "30"))


def _enabled() -> bool:
    return os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"


async def maybe_assign_reviews_for_user(did: str) -> None:
    """Entry point — call once per authenticated request.

    Returns quickly if disabled, throttled, or the user has reached their
    daily limit. Otherwise writes new invitation records on the community
    PDS and updates the local DB synchronously.
    """
    if not _enabled() or not did:
        return

    now = datetime.now(timezone.utc)
    last = _last_check.get(did)
    if last and (now - last).total_seconds() < _throttle_seconds():
        return
    _last_check[did] = now

    try:
        await _assign(did)
    except Exception as err:
        logger.warning(f"peer_review_assign failed for {did}: {err}")


async def _assign(did: str) -> None:
    daily_limit = _daily_limit()
    open_limit = _open_limit()
    probability = _invite_probability()

    pool = await get_pool()

    async with pool.acquire() as conn:
        # Daily rate cap (PER BALLOT): new active invitations issued in the last
        # 24h, grouped by ballot. Bounds how fast a user gets new work on each
        # Vorlage independently.
        recent_rows = await conn.fetch(
            """
            SELECT a.ballot_rkey, COUNT(*) AS recent_count
            FROM app_peerreview_invitations ri
            JOIN app_arguments a ON a.uri = ri.argument_uri
            WHERE ri.invitee_did = $1
              AND ri.invited = true
              AND ri.created_at > NOW() - INTERVAL '24 hours'
            GROUP BY a.ballot_rkey
            """,
            did,
        )
        # Standing backlog cap (PER BALLOT): invitations the user still has to
        # act on, grouped by ballot. Same definition as peerreview.pending (the
        # banner): invited, review still open, not yet answered, argument not
        # deleted. Per-ballot (not global) so a backlog on one Vorlage can't
        # starve invitations for another. Without this, the daily cap alone lets
        # a daily-login-but-never-review user accumulate invitations unboundedly.
        open_rows = await conn.fetch(
            """
            SELECT a.ballot_rkey, COUNT(*) AS open_count
            FROM app_peerreview_invitations ri
            JOIN app_arguments a    ON a.uri = ri.argument_uri AND NOT a.deleted
            JOIN app_peerreviews pr ON pr.argument_uri = ri.argument_uri
            WHERE ri.invitee_did = $1
              AND ri.invited = true
              AND pr.state = 'open'
              AND NOT EXISTS (
                SELECT 1 FROM app_peerreview_responses rr
                WHERE rr.argument_uri = ri.argument_uri
                  AND rr.reviewer_did = $1
              )
            GROUP BY a.ballot_rkey
            """,
            did,
        )
    # Running per-ballot counters; incremented as we assign below so both caps
    # hold within a single assignment pass too.
    recent_by_ballot: dict[str, int] = {
        r["ballot_rkey"]: int(r["recent_count"]) for r in recent_rows
    }
    open_by_ballot: dict[str, int] = {
        r["ballot_rkey"]: int(r["open_count"]) for r in open_rows
    }

    # Candidate filter:
    #   * pr.state='open'   — review still accepts reviewers; implicitly limits
    #                         to user-submitted arguments (curated content has no
    #                         app_peerreviews row, so the JOIN excludes them)
    #   * author_did != me  — not your own argument
    #   * NOT EXISTS (...)  — you haven't been rolled for this arg before
    # Quorum is intentionally NOT a per-argument invitation cap: it only gates
    # the closure trigger. The per-user DAILY_LIMIT above + the per-ballot
    # OPEN_LIMIT below + the probability roll are what bound the invitation rate.
    async with pool.acquire() as conn:
        candidates = await conn.fetch(
            """
            SELECT a.uri, a.did AS community_did, a.ballot_rkey
            FROM app_peerreviews pr
            JOIN app_arguments a ON a.uri = pr.argument_uri
            WHERE pr.state = 'open'
              AND NOT a.deleted
              AND a.author_did != $1
              AND NOT EXISTS (
                SELECT 1 FROM app_peerreview_invitations ri
                WHERE ri.argument_uri = a.uri AND ri.invitee_did = $1
              )
            ORDER BY a.created_at ASC
            LIMIT 100
            """,
            did,
        )

    if not candidates:
        return

    async with httpx.AsyncClient(timeout=30.0) as client:
        for arg in candidates:
            ballot_rkey = arg["ballot_rkey"]
            # Per-ballot caps: skip — don't even roll the lottery, so the
            # candidate stays eligible once that Vorlage frees up — if the user
            # has either hit today's rate or the standing backlog for it.
            if recent_by_ballot.get(ballot_rkey, 0) >= daily_limit:
                continue
            if open_by_ballot.get(ballot_rkey, 0) >= open_limit:
                continue

            selected = random.random() <= probability
            argument_uri = arg["uri"]
            community_did = arg["community_did"]
            rkey = compose_review_rkey(argument_uri, did)
            created_at = datetime.now(timezone.utc)
            record = {
                "$type": "app.ch.poltr.peerreview.invitation",
                "argument": argument_uri,
                "invitee": did,
                "invited": selected,
                "createdAt": created_at.isoformat(),
            }

            try:
                result = await create_community_record(
                    client,
                    community_did,
                    "app.ch.poltr.peerreview.invitation",
                    record,
                    rkey=rkey,
                )
                # Mirror the write to the local DB synchronously so the next
                # candidate scan sees this invitation and doesn't re-roll —
                # independent of indexer round-trip lag.
                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO app_peerreview_invitations
                          (uri, cid, argument_uri, invitee_did, invited, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        ON CONFLICT DO NOTHING
                        """,
                        result.get("uri"),
                        result.get("cid"),
                        argument_uri,
                        did,
                        selected,
                        created_at,
                    )
                if selected:
                    recent_by_ballot[ballot_rkey] = (
                        recent_by_ballot.get(ballot_rkey, 0) + 1
                    )
                    open_by_ballot[ballot_rkey] = (
                        open_by_ballot.get(ballot_rkey, 0) + 1
                    )
                    logger.info(
                        f"Assigned review: {did} → {argument_uri} "
                        f"(ballot={ballot_rkey}, "
                        f"today={recent_by_ballot[ballot_rkey]}/{daily_limit}, "
                        f"open={open_by_ballot[ballot_rkey]}/{open_limit})"
                    )
            except Exception as err:
                logger.warning(
                    f"Failed to write invitation for {did} on {argument_uri}: {err}"
                )
