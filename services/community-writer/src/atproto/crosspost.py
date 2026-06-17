"""
Background cross-posting loop: mirrors arguments to Bluesky.

Arguments are posted as standalone posts under their community account.
Ballots are CMS content and not cross-posted as ATProto records.

Controlled by APPVIEW_CROSSPOST_ENABLED env var (checked at runtime each iteration).
Poll interval configurable via APPVIEW_CROSSPOST_POLL_INTERVAL_SECONDS (default 30).
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx

from src.shared.db import get_pool
from src.atproto.community import get_community_token, _pds_internal_url

logger = logging.getLogger("crosspost")


def _frontend_url() -> str:
    return os.getenv("APPVIEW_FRONTEND_URL", "https://poltr.ch")


# ---------------------------------------------------------------------------
# Cross-post: arguments
# ---------------------------------------------------------------------------


async def _crosspost_arguments(client: httpx.AsyncClient):
    """Find arguments without a bsky cross-post and create them as posts."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT a.uri, a.did AS community_did, a.title, a.body, a.type, a.peerreview_status
            FROM app_arguments a
            WHERE a.bsky_post_uri IS NULL AND NOT a.deleted
            ORDER BY a.created_at ASC
            """,
        )

    if not rows:
        return

    logger.info(f"Found {len(rows)} pending argument(s) to cross-post")
    peer_review_on = os.getenv("APPVIEW_PEER_REVIEW_ENABLED", "false").lower() == "true"

    for row in rows:
        community_did = row["community_did"]
        try:
            token = await get_community_token(client, community_did)

            prefix = "PRO" if row["type"] == "PRO" else "CONTRA"
            title = row["title"] or ""
            body = row["body"] or ""

            if peer_review_on and row["peerreview_status"] == "preliminary":
                text = f"[Preliminary] [{prefix}] {title}\n\n{body}"[:300]
            else:
                text = f"[{prefix}] {title}\n\n{body}"[:300]

            post_record = {
                "$type": "app.bsky.feed.post",
                "text": text,
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }

            resp = await client.post(
                f"{_pds_internal_url()}/xrpc/com.atproto.repo.createRecord",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                json={
                    "repo": community_did,
                    "collection": "app.bsky.feed.post",
                    "record": post_record,
                },
            )

            if resp.status_code != 200:
                logger.error(
                    f"Argument cross-post failed for {row['uri']} ({resp.status_code}): {resp.text}"
                )
                continue

            data = resp.json()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE app_arguments SET bsky_post_uri = $1, bsky_post_cid = $2 WHERE uri = $3",
                    data["uri"],
                    data.get("cid"),
                    row["uri"],
                )
            logger.info(f"Argument cross-posted: {data['uri']}")

        except Exception as err:
            logger.error(f"Argument cross-post failed for {row['uri']}: {err}")


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------


async def _poll_loop():
    """Main poll loop: periodically checks for pending cross-posts."""
    logger.info("Crosspost poll loop started")

    while True:
        interval = int(os.getenv("APPVIEW_CROSSPOST_POLL_INTERVAL_SECONDS", "30"))

        if os.getenv("APPVIEW_CROSSPOST_ENABLED", "false").lower() != "true":
            logger.debug("Crosspost disabled, sleeping")
            await asyncio.sleep(interval)
            continue

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await _crosspost_arguments(client)
        except Exception as err:
            logger.error(f"Crosspost poll error: {err}")

        await asyncio.sleep(interval)


async def run_crosspost_forever():
    """Run the cross-post poll loop in the FOREGROUND, for the standalone writer
    process (src.main). The internal write-side owns community writes now."""
    await _poll_loop()
