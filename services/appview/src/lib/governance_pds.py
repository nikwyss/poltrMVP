"""
Shared governance PDS session management and record creation.

Extracted from crosspost.py so that both the crosspost loop and the
peer-review system can authenticate as the governance account and
write records to the governance PDS.
"""

import asyncio
import logging
import os

import httpx

logger = logging.getLogger("governance_pds")

# Session cache
_gov_access_jwt: str | None = None
_gov_refresh_jwt: str | None = None
_gov_token_expires_at: float = 0


def _pds_internal_url() -> str:
    return os.getenv("PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local")


def _governance_did() -> str | None:
    return os.getenv("PDS_GOVERNANCE_ACCOUNT_DID")


def _governance_password() -> str | None:
    return os.getenv("PDS_GOVERNANCE_PASSWORD")


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


async def get_governance_token(client: httpx.AsyncClient) -> str:
    """Get a valid governance access token, refreshing if needed."""
    now = asyncio.get_event_loop().time()
    if not _gov_access_jwt or now >= _gov_token_expires_at:
        if _gov_refresh_jwt and now < _gov_token_expires_at + 30 * 60:
            return await _refresh_governance_session(client)
        return await _create_governance_session(client)
    return _gov_access_jwt


async def create_governance_record(
    client: httpx.AsyncClient, collection: str, record: dict
) -> dict:
    """Write a record to the governance PDS repo. Returns {uri, cid}."""
    gov_did = _governance_did()
    if not gov_did:
        raise RuntimeError("PDS_GOVERNANCE_ACCOUNT_DID not configured")

    token = await get_governance_token(client)

    resp = await client.post(
        f"{_pds_internal_url()}/xrpc/com.atproto.repo.createRecord",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        json={
            "repo": gov_did,
            "collection": collection,
            "record": record,
        },
    )

    if resp.status_code != 200:
        raise RuntimeError(
            f"Governance createRecord failed for {collection} "
            f"({resp.status_code}): {resp.text}"
        )

    return resp.json()
