"""
Activity-triggered peer-review request, written from the auth middleware.

ATProto-native model: instead of assigning review invitations in-process, the
appview writes a `peerreview.request` record into the user's OWN repo at most
once per active UTC day. The community-writer picks it up off the firehose and
runs the actual assignment lottery there (see
services/community-writer/src/arguments/peer_review_assign.py). Inactive users
never write a request, so their review slots stay open for active users.

Constraint:
  - APPVIEW_PEER_REVIEW_ENABLED  master switch (default false)

The per-user daily limit, invite probability, and quorum all live on the writer
side; the appview only emits the request signal.
"""

import asyncio
import logging
import os
from datetime import date, datetime, timezone

logger = logging.getLogger("peer_review_assign")


def _enabled() -> bool:
    return os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"


REQUEST_NSID = "app.ch.poltr.peerreview.request"

# did -> last UTC day we wrote a review request. Bounds request records to ~1/day
# per active user (lost on restart → at most a couple extra/day, "Müll in Grenzen").
_last_request_day: dict[str, date] = {}


async def request_peer_review(session) -> None:
    """Write a peerreview.request into the user's OWN repo, at most once per active
    UTC day. The writer picks it up off the firehose and runs the assignment there."""
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
