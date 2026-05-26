"""
Per-ballot governance PDS session management and record creation.

Each ballot has its own governance account on the PDS. Credentials are
stored in the governance_accounts table (encrypted with the same master
key used for user app passwords).
"""

import asyncio
import logging
import os
import secrets
import string

import httpx

from src.core import db
from src.atproto.pds_creds import decrypt_app_password, encrypt_app_password
from src.atproto.errors import from_network_error, from_response

logger = logging.getLogger("governance_pds")

# Per-DID session cache: did -> (access_jwt, expires_at)
_sessions: dict[str, tuple[str, float]] = {}


def _pds_internal_url() -> str:
    return os.getenv("PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local")


async def _get_governance_password(did: str) -> str:
    """Load and decrypt the governance account password from the DB."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT pw_ciphertext, pw_nonce FROM auth.governance_accounts WHERE did = $1",
            did,
        )
    if not row:
        raise RuntimeError(f"No governance account found for DID {did}")
    return decrypt_app_password(row["pw_ciphertext"], row["pw_nonce"])


async def _create_session(client: httpx.AsyncClient, did: str) -> str:
    """Create a PDS session for a governance account. Returns access JWT."""
    password = await _get_governance_password(did)

    try:
        resp = await client.post(
            f"{_pds_internal_url()}/xrpc/com.atproto.server.createSession",
            json={"identifier": did, "password": password},
        )
    except httpx.RequestError as exc:
        raise from_network_error(exc, op="governance.createSession", did=did) from exc
    if resp.status_code != 200:
        logger.error(
            f"Governance createSession failed for {did} ({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op="governance.createSession", did=did)

    access_jwt = resp.json()["accessJwt"]
    expires_at = asyncio.get_event_loop().time() + 90 * 60
    _sessions[did] = (access_jwt, expires_at)
    return access_jwt


async def get_governance_token(client: httpx.AsyncClient, did: str) -> str:
    """Get a valid governance access token for the given DID, creating a new session if expired."""
    now = asyncio.get_event_loop().time()
    cached = _sessions.get(did)

    if cached and now < cached[1]:
        return cached[0]
    return await _create_session(client, did)


async def create_governance_record(
    client: httpx.AsyncClient,
    did: str,
    collection: str,
    record: dict,
    rkey: str | None = None,
) -> dict:
    """Write a record to a governance account's PDS repo. Returns {uri, cid}.

    When `rkey` is given, createRecord is create-only at that key: a second
    write to the same (collection, rkey) is rejected by the PDS *before* any
    commit is written. This both makes the record immutable at the source and
    makes redundant re-writes impossible (no firehose commit on conflict).
    """
    token = await get_governance_token(client, did)

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
            exc, op=f"governance.createRecord:{collection}", did=did
        ) from exc

    if resp.status_code != 200:
        logger.error(
            f"Governance createRecord failed for {collection} "
            f"({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op=f"governance.createRecord:{collection}", did=did)

    return resp.json()


async def put_governance_record(
    client: httpx.AsyncClient, did: str, collection: str, rkey: str, record: dict
) -> dict:
    """Write a record to a governance account's PDS repo with an explicit rkey (upsert).
    Returns {uri, cid}."""
    token = await get_governance_token(client, did)

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
            exc, op=f"governance.putRecord:{collection}", did=did
        ) from exc

    if resp.status_code != 200:
        logger.error(
            f"Governance putRecord failed for {collection}/{rkey} "
            f"({resp.status_code}): {resp.text}"
        )
        raise from_response(resp, op=f"governance.putRecord:{collection}", did=did)

    return resp.json()


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
# Ballot governance account management
# ---------------------------------------------------------------------------


def _generate_password(length: int = 32) -> str:
    """Generate a random password for a governance account."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


async def create_ballot_account(ballot_rkey: str) -> str:
    """Create a new PDS account for a ballot. Returns the DID.

    1. Generates handle: ballot-{rkey}.id.poltr.ch
    2. Creates PDS account via admin API
    3. Stores encrypted credentials in governance_accounts
    4. Waits for PLC resolution
    """
    from src.atproto.atproto_api import pds_admin_create_account, wait_for_plc_resolution

    handle = f"ballot-{ballot_rkey}.id.poltr.ch"
    password = _generate_password()
    email = f"ballot-{ballot_rkey}@poltr.ch"

    # Create PDS account
    result = await pds_admin_create_account(handle, password, email)
    did = result.did

    logger.info(f"Created ballot governance account: {handle} ({did})")

    # Encrypt and store credentials
    pw_ct, pw_nonce = encrypt_app_password(password)

    pool = await db.get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO auth.governance_accounts (did, handle, ballot_rkey, pw_ciphertext, pw_nonce)
            VALUES ($1, $2, $3, $4, $5)
            """,
            did, handle, ballot_rkey, pw_ct, pw_nonce,
        )

    # Wait for PLC directory to resolve the DID
    await wait_for_plc_resolution(did)

    return did


async def get_did_for_ballot(ballot_rkey: str) -> str | None:
    """Look up the governance DID for a ballot rkey."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT did FROM auth.governance_accounts WHERE ballot_rkey = $1",
            ballot_rkey,
        )


async def get_did_for_ballot_uri(ballot_uri: str) -> str | None:
    """Look up the governance DID for a ballot AT URI."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT did FROM auth.governance_accounts WHERE ballot_uri = $1",
            ballot_uri,
        )


async def is_governance_did(did: str) -> bool:
    """Check if a DID belongs to a governance account."""
    pool = await db.get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM auth.governance_accounts WHERE did = $1)",
            did,
        )
