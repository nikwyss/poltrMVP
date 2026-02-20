"""
Background cross-posting loop: mirrors ballots and arguments to Bluesky.

Ballots are posted under the governance account.
Arguments are posted under the argument author's account (as replies to the ballot post).

Controlled by CROSSPOST_ENABLED env var (checked at runtime each iteration).
Poll interval configurable via CROSSPOST_POLL_INTERVAL_SECONDS (default 30).
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx

from src.lib.db import get_pool
from src.lib.pds_creds import decrypt_app_password
from src.lib.governance_pds import get_governance_token, _pds_internal_url, _governance_did

logger = logging.getLogger("crosspost")

_task: asyncio.Task | None = None

# User session cache: did -> {access_jwt, expires_at}
_user_sessions: dict[str, dict] = {}


def _frontend_url() -> str:
    return os.getenv("APPVIEW_FRONTEND_URL", "https://poltr.ch")


async def _get_user_token(client: httpx.AsyncClient, did: str) -> str | None:
    """Get a PDS access token for a user by decrypting their stored credentials."""
    cached = _user_sessions.get(did)
    now = asyncio.get_event_loop().time()
    if cached and now < cached["expires_at"]:
        return cached["access_jwt"]

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT app_pw_ciphertext, app_pw_nonce FROM auth.auth_creds WHERE did = $1",
            did,
        )
    if not row:
        return None

    password = decrypt_app_password(row["app_pw_ciphertext"], row["app_pw_nonce"])

    resp = await client.post(
        f"{_pds_internal_url()}/xrpc/com.atproto.server.createSession",
        json={"identifier": did, "password": password},
    )
    if resp.status_code != 200:
        logger.error(f"createSession for user {did} failed ({resp.status_code}): {resp.text}")
        return None

    data = resp.json()
    _user_sessions[did] = {
        "access_jwt": data["accessJwt"],
        "expires_at": now + 60 * 60,
    }
    return data["accessJwt"]


# ---------------------------------------------------------------------------
# Cross-post: ballots
# ---------------------------------------------------------------------------


async def _crosspost_ballots(client: httpx.AsyncClient):
    """Find ballots without a bsky cross-post and create them."""
    gov_did = _governance_did()
    if not gov_did:
        return

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT uri, rkey, title, description
            FROM app_ballots
            WHERE bsky_post_uri IS NULL AND NOT deleted AND did = $1
            ORDER BY created_at ASC
            """,
            gov_did,
        )

    if not rows:
        return

    logger.info(f"Found {len(rows)} pending ballot(s) to cross-post")
    token = await get_governance_token(client)

    for row in rows:
        try:
            title = row["title"] or "New ballot"
            description = row["description"] or ""
            rkey = row["rkey"]
            ballot_url = f"{_frontend_url()}/ballots/{rkey}"
            text = f"{title}\n\n{ballot_url}"

            # Compute byte offsets for the URL facet
            text_bytes = text.encode("utf-8")
            url_bytes = ballot_url.encode("utf-8")
            byte_start = len(text_bytes) - len(url_bytes)
            byte_end = len(text_bytes)

            post_record = {
                "$type": "app.bsky.feed.post",
                "text": text,
                "embed": {
                    "$type": "app.bsky.embed.external",
                    "external": {
                        "uri": ballot_url,
                        "title": title,
                        "description": description,
                    },
                },
                "facets": [
                    {
                        "index": {"byteStart": byte_start, "byteEnd": byte_end},
                        "features": [{"$type": "app.bsky.richtext.facet#link", "uri": ballot_url}],
                    },
                ],
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }

            resp = await client.post(
                f"{_pds_internal_url()}/xrpc/com.atproto.repo.createRecord",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                json={
                    "repo": gov_did,
                    "collection": "app.bsky.feed.post",
                    "record": post_record,
                },
            )

            if resp.status_code != 200:
                logger.error(f"Ballot cross-post failed for {row['uri']} ({resp.status_code}): {resp.text}")
                continue

            data = resp.json()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE app_ballots SET bsky_post_uri = $1, bsky_post_cid = $2 WHERE uri = $3",
                    data["uri"],
                    data.get("cid"),
                    row["uri"],
                )
            logger.info(f"Ballot cross-posted: {data['uri']}")

        except Exception as err:
            logger.error(f"Ballot cross-post failed for {row['uri']}: {err}")


# ---------------------------------------------------------------------------
# Cross-post: arguments
# ---------------------------------------------------------------------------


async def _crosspost_arguments(client: httpx.AsyncClient):
    """Find arguments without a bsky cross-post and create them as replies.

    Preliminary arguments are cross-posted under the author's account with [Preliminary] prefix.
    Approved governance copies are cross-posted under the governance account.
    """
    gov_did = _governance_did()
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT a.uri, a.did, a.title, a.body, a.type, a.review_status, a.original_uri,
                   b.bsky_post_uri AS ballot_bsky_uri, b.bsky_post_cid AS ballot_bsky_cid
            FROM app_arguments a
            JOIN app_ballots b ON a.ballot_uri = b.uri
            WHERE a.bsky_post_uri IS NULL AND NOT a.deleted
              AND b.bsky_post_uri IS NOT NULL
            ORDER BY a.created_at ASC
            """,
        )

    if not rows:
        return

    logger.info(f"Found {len(rows)} pending argument(s) to cross-post")
    peer_review_on = os.getenv("PEER_REVIEW_ENABLED", "false").lower() == "true"

    for row in rows:
        try:
            is_governance_copy = row["original_uri"] is not None and row["did"] == gov_did

            if is_governance_copy:
                # Approved governance copy: post under governance account
                token = await get_governance_token(client)
                repo_did = gov_did
            else:
                # Preliminary or user-submitted: post under author's account
                token = await _get_user_token(client, row["did"])
                if not token:
                    logger.warning(f"No credentials for {row['did']}, skipping argument cross-post")
                    continue
                repo_did = row["did"]

            prefix = "PRO" if row["type"] == "PRO" else "CONTRA"
            title = row["title"] or ""
            body = row["body"] or ""

            if is_governance_copy:
                text = f"[{prefix}] {title}\n\n{body}"[:300]
            elif peer_review_on:
                text = f"[Preliminary] [{prefix}] {title}\n\n{body}"[:300]
            else:
                text = f"[{prefix}] {title}\n\n{body}"[:300]

            post_record = {
                "$type": "app.bsky.feed.post",
                "text": text,
                "reply": {
                    "root": {"uri": row["ballot_bsky_uri"], "cid": row["ballot_bsky_cid"]},
                    "parent": {"uri": row["ballot_bsky_uri"], "cid": row["ballot_bsky_cid"]},
                },
                "createdAt": datetime.now(timezone.utc).isoformat(),
            }

            resp = await client.post(
                f"{_pds_internal_url()}/xrpc/com.atproto.repo.createRecord",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                json={
                    "repo": repo_did,
                    "collection": "app.bsky.feed.post",
                    "record": post_record,
                },
            )

            if resp.status_code != 200:
                logger.error(f"Argument cross-post failed for {row['uri']} ({resp.status_code}): {resp.text}")
                continue

            data = resp.json()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE app_arguments SET bsky_post_uri = $1, bsky_post_cid = $2 WHERE uri = $3",
                    data["uri"],
                    data.get("cid"),
                    row["uri"],
                )
            logger.info(f"Argument cross-posted by {row['did']}: {data['uri']}")

        except Exception as err:
            logger.error(f"Argument cross-post failed for {row['uri']}: {err}")


# ---------------------------------------------------------------------------
# Poll loop
# ---------------------------------------------------------------------------


async def _poll_loop():
    """Main poll loop: periodically checks for pending cross-posts."""
    logger.info("Crosspost poll loop started")

    while True:
        interval = int(os.getenv("CROSSPOST_POLL_INTERVAL_SECONDS", "30"))

        if os.getenv("CROSSPOST_ENABLED", "false").lower() != "true":
            logger.debug("Crosspost disabled, sleeping")
            await asyncio.sleep(interval)
            continue

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                await _crosspost_ballots(client)
                await _crosspost_arguments(client)
        except Exception as err:
            logger.error(f"Crosspost poll error: {err}")

        await asyncio.sleep(interval)


def start_crosspost_loop():
    """Start the crosspost background task."""
    global _task
    if _task is not None:
        return
    _task = asyncio.get_event_loop().create_task(_poll_loop())
    logger.info("Crosspost background task scheduled")


def stop_crosspost_loop():
    """Cancel the crosspost background task."""
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
        logger.info("Crosspost background task cancelled")
