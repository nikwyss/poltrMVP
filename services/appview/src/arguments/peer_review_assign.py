"""
On-demand peer-review assignment, triggered by user activity (auth middleware).

Replaces the legacy background-worker model: instead of periodically polling
preliminary arguments and inviting eligible users, we wait for each user to
make an authenticated request and decide *then* whether they get new review
invitations. Inactive users never get assigned — their slots stay open for
active users to fill.

Constraints:
  - APPVIEW_PEER_REVIEW_DAILY_LIMIT      max new active invitations per user
                                         in a sliding 24h window (default 3)
  - APPVIEW_PEER_REVIEW_INVITE_PROBABILITY anti-collusion lottery: even when a
                                         slot is free, a candidate argument is
                                         only assigned with this probability
                                         (default 0.35). Misses are recorded
                                         as invited=false pool entries so the
                                         same (argument, user) is never
                                         re-rolled.
  - APPVIEW_PEER_REVIEW_HOOK_THROTTLE_SECONDS minimum spacing between hook
                                         runs for the same user (default 30).

Per-review quorum lives on app_peerreviews.quorum (seeded by the indexer at
argument-creation time from APPVIEW_PEER_REVIEW_QUORUM). State='open' is the
single signal that a review still accepts new reviewers.
"""

import asyncio
import logging
import os
import random
from datetime import date, datetime, timezone

import httpx

from src.atproto.community import compose_review_rkey, create_community_record
from src.core.db import get_pool

logger = logging.getLogger("peer_review_assign")

# In-memory cache: did -> last hook execution timestamp (UTC).
# Lost on pod restart, which is fine: the next request just runs the hook once
# more. No cross-pod coordination needed because the work is idempotent (the
# deterministic rkey + DB ON CONFLICT guards make duplicate runs safe).
_last_check: dict[str, datetime] = {}


def _daily_limit() -> int:
    return int(os.getenv("APPVIEW_PEER_REVIEW_DAILY_LIMIT", "3"))


def _invite_probability() -> float:
    return float(os.getenv("APPVIEW_PEER_REVIEW_INVITE_PROBABILITY", "0.35"))


def _throttle_seconds() -> int:
    return int(os.getenv("APPVIEW_PEER_REVIEW_HOOK_THROTTLE_SECONDS", "30"))


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
    probability = _invite_probability()

    pool = await get_pool()

    async with pool.acquire() as conn:
        recent_active = await conn.fetchval(
            """
            SELECT COUNT(*) FROM app_peerreview_invitations
            WHERE invitee_did = $1
              AND invited = true
              AND created_at > NOW() - INTERVAL '24 hours'
            """,
            did,
        )
    slots_left = daily_limit - int(recent_active or 0)
    if slots_left <= 0:
        return

    # Candidate filter:
    #   * pr.state='open'   — review still accepts reviewers; implicitly limits
    #                         to user-submitted arguments (curated content has no
    #                         app_peerreviews row, so the JOIN excludes them)
    #   * author_did != me  — not your own argument
    #   * NOT EXISTS (...)  — you haven't been rolled for this arg before
    # Quorum is intentionally NOT a per-argument invitation cap: it only gates
    # the closure trigger. The per-user DAILY_LIMIT above + the probability roll
    # below are what bound the invitation rate.
    async with pool.acquire() as conn:
        candidates = await conn.fetch(
            """
            SELECT a.uri, a.did AS community_did
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
            if slots_left == 0:
                break

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
                    slots_left -= 1
                    logger.info(
                        f"Assigned review: {did} → {argument_uri} (slots_left={slots_left})"
                    )
            except Exception as err:
                logger.warning(
                    f"Failed to write invitation for {did} on {argument_uri}: {err}"
                )


REQUEST_NSID = "app.ch.poltr.peerreview.request"

# did -> last UTC day we wrote a review request. Bounds request records to ~1/day
# per active user (lost on restart → at most a couple extra/day, "Müll in Grenzen").
_last_request_day: dict[str, date] = {}


async def request_peer_review(session) -> None:
    """Write a peerreview.request into the user's OWN repo, at most once per active
    UTC day. The writer picks it up off the firehose and runs _assign there."""
    did = getattr(session, "did", None)
    if not _enabled() or not did:
        return
    today = datetime.now(timezone.utc).date()
    if _last_request_day.get(did) == today:
        return
    _last_request_day[did] = today
    try:
        # Lazy import: atproto_api → middleware → peer_review_assign would be a
        # circular import at module load time.
        from src.atproto.atproto_api import pds_create_record

        await pds_create_record(
            session,
            REQUEST_NSID,
            {"$type": REQUEST_NSID, "createdAt": datetime.now(timezone.utc).isoformat()},
        )
    except Exception as err:
        _last_request_day.pop(did, None)  # allow another try today on failure
        logger.warning(f"peer_review request failed for {did}: {err}")


async def _review_hook(session) -> None:
    # ATProto-native: appview writes a peerreview.request into the user's OWN repo;
    # the writer runs the actual assignment off the firehose (no community-write here).
    await request_peer_review(session)


def fire_and_forget(session) -> None:
    """Convenience helper for callers that don't want to await. Pass the TSession."""
    asyncio.create_task(_review_hook(session))
