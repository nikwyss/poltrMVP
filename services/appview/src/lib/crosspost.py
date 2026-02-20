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

logger = logging.getLogger("crosspost")

_task: asyncio.Task | None = None

# Governance session cache
_gov_access_jwt: str | None = None
_gov_refresh_jwt: str | None = None
_gov_token_expires_at: float = 0

# User session cache: did -> {access_jwt, expires_at}
_user_sessions: dict[str, dict] = {}


def _pds_internal_url() -> str:
    return os.getenv("PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local")


def _governance_did() -> str | None:
    return os.getenv("PDS_GOVERNANCE_ACCOUNT_DID")


def _governance_password() -> str | None:
    return os.getenv("PDS_GOVERNANCE_PASSWORD")


def _frontend_url() -> str:
    return os.getenv("APPVIEW_FRONTEND_URL", "https://poltr.ch")


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------


async def _create_governance_session(client: httpx.AsyncClient) -> str:
    """Create a PDS session for the governance account. Returns access JWT."""
    global _gov_access_jwt, _gov_refresh_jwt, _gov_token_expires_at

    gov_did = _governance_did()
    gov_pw = _governance_password()
    if not gov_did or not gov_pw:
        raise RuntimeError("Governance DID or password not configured")

    resp = await client.post(
        f"{_pds_internal_url()}/xrpc/com.atproto.server.createSession",
        json={"identifier": gov_did, "password": gov_pw},
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Governance createSession failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    _gov_access_jwt = data["accessJwt"]
    _gov_refresh_jwt = data.get("refreshJwt")
    _gov_token_expires_at = asyncio.get_event_loop().time() + 90 * 60
    return _gov_access_jwt


async def _refresh_governance_session(client: httpx.AsyncClient) -> str:
    """Refresh governance session. Falls back to full login on failure."""
    global _gov_access_jwt, _gov_refresh_jwt, _gov_token_expires_at

    if not _gov_refresh_jwt:
        return await _create_governance_session(client)

    resp = await client.post(
        f"{_pds_internal_url()}/xrpc/com.atproto.server.refreshSession",
        headers={"Authorization": f"Bearer {_gov_refresh_jwt}"},
    )
    if resp.status_code != 200:
        logger.warning("Governance refreshSession failed, falling back to createSession")
        return await _create_governance_session(client)

    data = resp.json()
    _gov_access_jwt = data["accessJwt"]
    _gov_refresh_jwt = data.get("refreshJwt")
    _gov_token_expires_at = asyncio.get_event_loop().time() + 90 * 60
    return _gov_access_jwt


async def _get_governance_token(client: httpx.AsyncClient) -> str:
    """Get a valid governance access token, refreshing if needed."""
    now = asyncio.get_event_loop().time()
    if not _gov_access_jwt or now >= _gov_token_expires_at:
        if _gov_refresh_jwt and now < _gov_token_expires_at + 30 * 60:
            return await _refresh_governance_session(client)
        return await _create_governance_session(client)
    return _gov_access_jwt


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
    token = await _get_governance_token(client)

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
    """Find arguments without a bsky cross-post and create them as replies."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT a.uri, a.did, a.title, a.body, a.type,
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

    for row in rows:
        try:
            token = await _get_user_token(client, row["did"])
            if not token:
                logger.warning(f"No credentials for {row['did']}, skipping argument cross-post")
                continue

            prefix = "PRO" if row["type"] == "PRO" else "CONTRA"
            title = row["title"] or ""
            body = row["body"] or ""
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
                    "repo": row["did"],
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
