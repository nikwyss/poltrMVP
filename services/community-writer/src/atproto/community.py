"""
Per-ballot community PDS session management and record creation.

Each ballot has its own community account on the PDS. Credentials are
stored in the community_accounts table (encrypted with the same master
key used for user app passwords).
"""

import asyncio
import logging
import os

import httpx

from src.shared import db
from src.shared.pds_creds import decrypt_community_password
from src.shared.errors import from_network_error, from_response

logger = logging.getLogger("community_pds")

# Per-DID session cache: did -> (access_jwt, expires_at)
_sessions: dict[str, tuple[str, float]] = {}


def _pds_internal_url() -> str:
    return os.getenv("PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local")


async def _get_community_password(did: str) -> str:
    """Load and decrypt the community account password from the DB."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT pw_ciphertext, pw_nonce FROM auth.community_accounts WHERE did = $1",
            did,
        )
    if not row:
        raise RuntimeError(f"No community account found for DID {did}")
    return decrypt_community_password(row["pw_ciphertext"], row["pw_nonce"])


async def _create_session(client: httpx.AsyncClient, did: str) -> str:
    """Create a PDS session for a community account. Returns access JWT."""
    password = await _get_community_password(did)

    try:
        resp = await client.post(
            f"{_pds_internal_url()}/xrpc/com.atproto.server.createSession",
            json={"identifier": did, "password": password},
        )
    except httpx.RequestError as exc:
        raise from_network_error(exc, op="community.createSession", did=did) from exc
    if resp.status_code != 200:
        logger.error(
            f"Community createSession failed for {did} ({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op="community.createSession", did=did)

    access_jwt = resp.json()["accessJwt"]
    expires_at = asyncio.get_event_loop().time() + 90 * 60
    _sessions[did] = (access_jwt, expires_at)
    return access_jwt


async def get_community_token(client: httpx.AsyncClient, did: str) -> str:
    """Get a valid community access token for the given DID, creating a new session if expired."""
    now = asyncio.get_event_loop().time()
    cached = _sessions.get(did)

    if cached and now < cached[1]:
        return cached[0]
    return await _create_session(client, did)


async def create_community_record(
    client: httpx.AsyncClient,
    did: str,
    collection: str,
    record: dict,
    rkey: str | None = None,
) -> dict:
    """Write a record to a community account's PDS repo. Returns {uri, cid}.

    When `rkey` is given, createRecord is create-only at that key: a second
    write to the same (collection, rkey) is rejected by the PDS *before* any
    commit is written. This both makes the record immutable at the source and
    makes redundant re-writes impossible (no firehose commit on conflict).
    """
    token = await get_community_token(client, did)

    body = {"repo": did, "collection": collection, "record": record}
    if rkey is not None:
        body["rkey"] = rkey

    try:
        resp = await client.post(
            f"{_pds_internal_url()}/xrpc/com.atproto.repo.createRecord",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            json=body,
        )
    except httpx.RequestError as exc:
        raise from_network_error(
            exc, op=f"community.createRecord:{collection}", did=did
        ) from exc

    if resp.status_code != 200:
        logger.error(
            f"Community createRecord failed for {collection} "
            f"({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op=f"community.createRecord:{collection}", did=did)

    return resp.json()


async def put_community_record(
    client: httpx.AsyncClient, did: str, collection: str, rkey: str, record: dict
) -> dict:
    """Write a record to a community account's PDS repo with an explicit rkey (upsert).
    Returns {uri, cid}."""
    token = await get_community_token(client, did)

    try:
        resp = await client.post(
            f"{_pds_internal_url()}/xrpc/com.atproto.repo.putRecord",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}",
            },
            json={
                "repo": did,
                "collection": collection,
                "rkey": rkey,
                "record": record,
            },
        )
    except httpx.RequestError as exc:
        raise from_network_error(
            exc, op=f"community.putRecord:{collection}", did=did
        ) from exc

    if resp.status_code != 200:
        logger.error(
            f"Community putRecord failed for {collection}/{rkey} "
            f"({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op=f"community.putRecord:{collection}", did=did)

    return resp.json()


async def get_community_record(
    client: httpx.AsyncClient, did: str, collection: str, rkey: str
) -> dict | None:
    """Fetch the current value of a record from a community repo (read-only).

    Returns the record `value` dict, or None if it doesn't exist. getRecord is
    public, so no session token is needed. Used for read-modify-write so we
    never reconstruct a record from scratch (which would drop fields like
    `source`)."""
    try:
        resp = await client.get(
            f"{_pds_internal_url()}/xrpc/com.atproto.repo.getRecord",
            params={"repo": did, "collection": collection, "rkey": rkey},
        )
    except httpx.RequestError as exc:
        raise from_network_error(
            exc, op=f"community.getRecord:{collection}", did=did
        ) from exc

    if resp.status_code == 400:
        # RecordNotFound / could-not-locate → treat as missing.
        return None
    if resp.status_code != 200:
        logger.error(
            f"Community getRecord failed for {collection}/{rkey} "
            f"({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op=f"community.getRecord:{collection}", did=did)

    return resp.json().get("value")


def compose_review_rkey(argument_uri: str, did: str) -> str:
    """Compose a deterministic rkey for review records.

    Format: {argument_rkey}-{did_suffix}
    This makes duplicate invitations/responses structurally impossible
    at the PDS level when used with putRecord.
    """
    arg_rkey = argument_uri.split("/")[-1]
    did_suffix = did.split(":")[-1]
    return f"{arg_rkey}-{did_suffix}"


# ---------------------------------------------------------------------------
# Ballot community account management
# ---------------------------------------------------------------------------


async def get_did_for_ballot(ballot_rkey: str) -> str | None:
    """Look up the community DID for a ballot rkey."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT did FROM auth.community_accounts WHERE ballot_rkey = $1",
            ballot_rkey,
        )
