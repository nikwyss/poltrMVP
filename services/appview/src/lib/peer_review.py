"""
Background peer-review invitation loop.

Periodically finds preliminary arguments that need more reviewers,
selects eligible active users with a configurable probability,
and writes invitation records to the governance PDS.

Controlled by PEER_REVIEW_ENABLED env var (checked each iteration).
Poll interval configurable via PEER_REVIEW_POLL_INTERVAL_SECONDS (default 60).
"""

import asyncio
import logging
import os
import random
from datetime import datetime, timezone

import httpx

from src.lib.db import get_pool
from src.lib.governance_pds import create_governance_record

logger = logging.getLogger("peer_review")

_task: asyncio.Task | None = None


def _get_quorum() -> int:
    return int(os.getenv("PEER_REVIEW_QUORUM", "10"))


def _get_invite_probability() -> float:
    return float(os.getenv("PEER_REVIEW_INVITE_PROBABILITY", "0.35"))


async def _process_pending_invitations():
    """Find preliminary arguments and invite eligible users to review them."""
    pool = await get_pool()
    quorum = _get_quorum()
    probability = _get_invite_probability()

    async with pool.acquire() as conn:
        # Find preliminary arguments that haven't reached quorum of invitations yet
        pending_args = await conn.fetch(
            """
            SELECT a.uri, a.did AS author_did
            FROM app_arguments a
            WHERE a.review_status = 'preliminary'
              AND NOT a.deleted
              AND (
                SELECT COUNT(*) FROM app_review_invitations ri
                WHERE ri.argument_uri = a.uri AND NOT ri.deleted
              ) < $1
            ORDER BY a.created_at ASC
            LIMIT 20
            """,
            quorum,
        )

    if not pending_args:
        return

    logger.info(f"Found {len(pending_args)} argument(s) needing reviewers")

    async with httpx.AsyncClient(timeout=30.0) as client:
        for arg in pending_args:
            try:
                await _invite_for_argument(
                    client, pool, arg["uri"], arg["author_did"],
                    quorum, probability,
                )
            except Exception as err:
                logger.error(f"Invitation processing failed for {arg['uri']}: {err}")


async def _create_governance_copies():
    """Find approved arguments without a governance copy and create them."""
    pool = await get_pool()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT uri, title, body, type, ballot_uri
            FROM app_arguments
            WHERE review_status = 'approved'
              AND governance_uri IS NULL
              AND original_uri IS NULL
              AND NOT deleted
            ORDER BY created_at ASC
            LIMIT 10
            """,
        )

    if not rows:
        return

    logger.info(f"Found {len(rows)} approved argument(s) needing governance copies")

    async with httpx.AsyncClient(timeout=30.0) as client:
        for row in rows:
            argument_uri = row["uri"]
            gov_record = {
                "$type": "app.ch.poltr.ballot.argument",
                "title": row["title"],
                "body": row["body"],
                "type": row["type"],
                "ballot": row["ballot_uri"],
                "originalUri": argument_uri,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }

            try:
                result = await create_governance_record(
                    client, "app.ch.poltr.ballot.argument", gov_record
                )
                governance_uri = result.get("uri", "")

                async with pool.acquire() as conn:
                    await conn.execute(
                        """
                        UPDATE app_arguments
                        SET governance_uri = $1, indexed_at = now()
                        WHERE uri = $2
                        """,
                        governance_uri,
                        argument_uri,
                    )
                logger.info(f"Governance copy created for {argument_uri}: {governance_uri}")
            except Exception as err:
                logger.error(f"Failed to create governance copy for {argument_uri}: {err}")


async def _invite_for_argument(
    client: httpx.AsyncClient,
    pool,
    argument_uri: str,
    author_did: str,
    quorum: int,
    probability: float,
):
    """Invite eligible active users for a single argument."""
    async with pool.acquire() as conn:
        # Count existing invitations
        existing_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM app_review_invitations
            WHERE argument_uri = $1 AND NOT deleted
            """,
            argument_uri,
        )

        remaining_needed = quorum - existing_count
        if remaining_needed <= 0:
            return

        # Find eligible users: have a valid session, not the author, not already invited
        eligible_users = await conn.fetch(
            """
            SELECT DISTINCT s.did
            FROM auth.auth_sessions s
            WHERE s.expires_at > NOW()
              AND s.did IS NOT NULL
              AND s.did != $1
              AND s.did NOT IN (
                SELECT ri.invitee_did FROM app_review_invitations ri
                WHERE ri.argument_uri = $2 AND NOT ri.deleted
              )
            """,
            author_did,
            argument_uri,
        )

    if not eligible_users:
        return

    invited_count = 0
    for user_row in eligible_users:
        if invited_count >= remaining_needed:
            break

        # Roll the dice
        if random.random() > probability:
            continue

        user_did = user_row["did"]
        invitation_record = {
            "$type": "app.ch.poltr.review.invitation",
            "argument": argument_uri,
            "invitee": user_did,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }

        try:
            result = await create_governance_record(
                client, "app.ch.poltr.review.invitation", invitation_record
            )
            logger.info(f"Invited {user_did} to review {argument_uri}: {result.get('uri')}")
            invited_count += 1
        except Exception as err:
            logger.error(f"Failed to create invitation for {user_did}: {err}")


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------


async def _poll_loop():
    """Main poll loop: periodically processes pending peer-review invitations."""
    logger.info("Peer-review poll loop started")

    while True:
        interval = int(os.getenv("PEER_REVIEW_POLL_INTERVAL_SECONDS", "60"))

        if os.getenv("PEER_REVIEW_ENABLED", "false").lower() != "true":
            logger.debug("Peer-review disabled, sleeping")
            await asyncio.sleep(interval)
            continue

        try:
            await _process_pending_invitations()
            await _create_governance_copies()
        except Exception as err:
            logger.error(f"Peer-review poll error: {err}")

        await asyncio.sleep(interval)


def start_peer_review_loop():
    """Start the peer-review background task."""
    global _task
    if _task is not None:
        return
    _task = asyncio.get_event_loop().create_task(_poll_loop())
    logger.info("Peer-review background task scheduled")


def stop_peer_review_loop():
    """Cancel the peer-review background task."""
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
        logger.info("Peer-review background task cancelled")
