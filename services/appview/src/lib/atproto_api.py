import asyncio
import base64
import logging
import os
from datetime import datetime, timezone
import httpx
from pydantic import BaseModel
from src.lib import db
from src.auth.middleware import TSession
from src.config import DUMMY_BIRTHDATE

logger = logging.getLogger(__name__)


class TCreateAccountResponse(BaseModel):
    did: str
    didDoc: dict
    accessJwt: str
    refreshJwt: str
    handle: str


class TLoginAccountResponse(BaseModel):
    did: str
    handle: str
    accessJwt: str
    refreshJwt: str
    active: bool = True
    didDoc: dict | None = None  # Optional, not always returned


class TCreateAppPasswordResponse(BaseModel):
    name: str
    password: str
    createdAt: str


# =============================================================================
# Internal PDS helpers (use PDS_INTERNAL_URL, raw JWT or admin auth)
# =============================================================================


async def _pds_admin_create_invite() -> str:
    """Create a single-use invite code using admin auth."""
    # Use internal K8s URL for admin operations (external URL blocks admin auth)
    pds_internal_url = os.getenv(
        "PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local"
    )
    pds_admin_password = os.getenv("PDS_ADMIN_PASSWORD")

    if not pds_admin_password:
        raise ValueError("PDS_ADMIN_PASSWORD must be set")

    # Admin auth uses Basic auth with "admin" as username
    auth_string = f"admin:{pds_admin_password}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    headers = {"Authorization": f"Basic {auth_bytes}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{pds_internal_url}/xrpc/com.atproto.server.createInviteCode",
            headers=headers,
            json={"useCount": 1},
        )

    if resp.status_code != 200:
        try:
            error_json = resp.json()
        except Exception:
            error_json = resp.text
        logger.error(f"PDS createInviteCode failed ({resp.status_code}): {error_json}")
        raise RuntimeError(f"Failed to create invite code: {error_json}")

    return resp.json()["code"]


async def pds_admin_create_account(
    handle: str, password: str, user_email: str
) -> TCreateAccountResponse:
    """Create account on PDS: first generate invite code, then create account."""
    # Use internal K8s URL for reliability: admin account kann sich offenbar nicht remotely authenifizieren.
    pds_internal_url = os.getenv("PDS_INTERNAL_URL")
    assert (
        pds_internal_url is not None
    ), "PDS_INTERNAL_URL is not set: e.g. http://pds.poltr.svc.cluster.local"

    # Step 1: Generate a single-use invite code
    invite_code = await _pds_admin_create_invite()
    logger.info(f"Generated invite code for new account: {handle}")

    # Step 2: Create account with the invite code
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{pds_internal_url}/xrpc/com.atproto.server.createAccount",
                json={
                    "handle": handle,
                    "email": user_email,
                    "password": password,
                    "birthDate": "1970-01-01",
                    "inviteCode": invite_code,
                },
            )
        except httpx.RequestError as e:
            raise RuntimeError(f"PDS request error: {e}") from e

    if resp.status_code != 200:
        try:
            error_json = resp.json()
            error_type = error_json.get("error", "Unknown")
            error_message = error_json.get("message", resp.text)
        except Exception:
            error_type = "Unknown"
            error_message = resp.text
        logger.error(f"PDS createAccount failed ({resp.status_code}): {error_type} - {error_message}")
        raise RuntimeError(f"PDS error: {error_type} - {error_message}")

    return TCreateAccountResponse(**resp.json())


async def wait_for_plc_resolution(did: str, timeout: float = 10.0, interval: float = 2.0):
    """Poll plc.directory until the DID resolves. Prevents Bluesky AppView stub
    entries caused by the relay forwarding identity events before PLC propagation.
    Non-fatal: logs a warning and returns if resolution doesn't succeed in time.
    """
    plc_url = os.getenv("PLC_DIRECTORY_URL", "https://plc.directory")
    elapsed = 0.0
    async with httpx.AsyncClient(timeout=5.0) as client:
        while elapsed < timeout:
            try:
                resp = await client.get(f"{plc_url}/{did}")
                if resp.status_code == 200:
                    logger.info(f"DID {did} resolved on PLC after {elapsed:.1f}s")
                    return
            except httpx.RequestError:
                pass
            await asyncio.sleep(interval)
            elapsed += interval
    logger.warning(f"DID {did} not resolved on PLC after {timeout}s — continuing anyway")


async def wait_for_relay_repo_indexed(
    did: str, expected_rev: str | None = None, timeout: float = 30.0, interval: float = 3.0
):
    """Poll the Bluesky relay until it has indexed the expected repo commit.

    The Bluesky AppView creates permanent broken stub entries when it processes
    an #identity event before the corresponding repo commit (with the profile
    record) has been relayed.  By waiting until the relay confirms it has the
    specific commit (matched by rev), we ensure that a subsequent identity event
    (via handle toggle) will find the profile record already available on the
    relay.

    If expected_rev is provided, the relay must report that exact rev (or newer).
    Without it, any 200 response is accepted (backwards-compatible).

    Non-fatal: logs a warning and returns if the relay doesn't confirm in time.
    """
    relay_url = os.getenv("BSKY_RELAY_URL", "https://bsky.network")
    elapsed = 0.0
    async with httpx.AsyncClient(timeout=5.0) as client:
        while elapsed < timeout:
            try:
                resp = await client.get(
                    f"{relay_url}/xrpc/com.atproto.sync.getLatestCommit",
                    params={"did": did},
                )
                if resp.status_code == 200:
                    relay_rev = resp.json().get("rev", "")
                    if expected_rev is None or relay_rev >= expected_rev:
                        logger.info(
                            f"Relay has indexed repo for {did} after {elapsed:.1f}s "
                            f"(relay rev: {relay_rev}, expected: {expected_rev})"
                        )
                        return
                    else:
                        logger.debug(
                            f"Relay has older rev for {did}: {relay_rev} < {expected_rev}, "
                            f"waiting... ({elapsed:.1f}s)"
                        )
            except httpx.RequestError:
                pass
            await asyncio.sleep(interval)
            elapsed += interval
    logger.warning(
        f"Relay has not indexed expected rev for {did} after {timeout}s "
        f"(expected: {expected_rev}) — continuing anyway"
    )


async def pds_admin_delete_account(did: str) -> None:
    """Delete a PDS account using admin auth. Used as compensating action."""
    pds_internal_url = os.getenv(
        "PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local"
    )
    pds_admin_password = os.getenv("PDS_ADMIN_PASSWORD")
    if not pds_admin_password:
        raise ValueError("PDS_ADMIN_PASSWORD must be set")

    auth_string = f"admin:{pds_admin_password}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    headers = {"Authorization": f"Basic {auth_bytes}"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{pds_internal_url}/xrpc/com.atproto.admin.deleteAccount",
            headers=headers,
            json={"did": did},
        )

    if resp.status_code != 200:
        logger.error(f"Failed to delete PDS account {did}: {resp.text}")
        raise RuntimeError(f"Failed to delete PDS account: {resp.text}")

    logger.info(f"Compensating delete: removed PDS account {did}")


async def pds_put_record(access_jwt: str, did: str, collection: str, rkey: str, record: dict) -> dict:
    """Put (create/update) a record on PDS via internal URL. Used during registration.
    Returns the full response including commit rev."""
    pds_internal_url = os.getenv("PDS_INTERNAL_URL")
    assert pds_internal_url, "PDS_INTERNAL_URL is not set"

    headers = {
        "Authorization": f"Bearer {access_jwt}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{pds_internal_url}/xrpc/com.atproto.repo.putRecord",
            headers=headers,
            json={
                "repo": did,
                "collection": collection,
                "rkey": rkey,
                "record": record,
            },
        )

    if resp.status_code != 200:
        logger.error(f"pds_put_record failed ({collection}) for {did}: {resp.text}")
        raise RuntimeError(f"Failed to put record ({collection}): {resp.text}")

    data = resp.json()
    commit_rev = data.get("commit", {}).get("rev", "unknown")
    logger.info(f"Record written ({collection}) for {did}, commit rev: {commit_rev}")
    return data


async def pds_admin_toggle_handle(did: str, handle: str):
    """Toggle account handle to force a new #identity event on the firehose.

    Works around a Bluesky AppView bug where the initial identity event is
    lost (e.g. PLC resolution race), leaving the account un-indexed.
    Toggling the handle emits a fresh identity event that re-triggers indexing.
    See: https://github.com/bluesky-social/atproto/discussions/4379

    Fully non-fatal: never raises, only logs warnings on failure.
    """
    try:
        pds_internal_url = os.getenv(
            "PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local"
        )
        pds_admin_password = os.getenv("PDS_ADMIN_PASSWORD")
        if not pds_admin_password:
            logger.warning("PDS_ADMIN_PASSWORD not set, skipping handle toggle")
            return

        auth_string = f"admin:{pds_admin_password}"
        auth_bytes = base64.b64encode(auth_string.encode()).decode()
        headers = {
            "Authorization": f"Basic {auth_bytes}",
            "Content-Type": "application/json",
        }

        base, domain = handle.split(".", 1)
        tmp_handle = f"{base}-tmp.{domain}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Step 1: temporary handle
            resp = await client.post(
                f"{pds_internal_url}/xrpc/com.atproto.admin.updateAccountHandle",
                headers=headers,
                json={"did": did, "handle": tmp_handle},
            )
            if resp.status_code != 200:
                logger.warning(f"Handle toggle step 1 failed: {resp.status_code} {resp.text}")
                return

            # Step 2: revert to original
            resp = await client.post(
                f"{pds_internal_url}/xrpc/com.atproto.admin.updateAccountHandle",
                headers=headers,
                json={"did": did, "handle": handle},
            )
            if resp.status_code != 200:
                logger.warning(f"Handle toggle step 2 failed: {resp.status_code} {resp.text}")
                return

            logger.info(f"Handle toggled for {did} to force identity re-indexing")
    except Exception as e:
        logger.warning(f"Handle toggle failed (non-fatal): {e}")


async def relay_request_crawl(hostname: str | None = None):
    """Ask the Bluesky relay to crawl our PDS so new repos/records get indexed."""
    relay_url = os.getenv("BSKY_RELAY_URL", "https://bsky.network")
    pds_hostname = hostname or os.getenv("PDS_HOSTNAME")
    if not pds_hostname:
        logger.warning("PDS_HOSTNAME not set, skipping requestCrawl")
        return

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(
                f"{relay_url}/xrpc/com.atproto.sync.requestCrawl",
                json={"hostname": pds_hostname},
            )
            if resp.status_code == 200:
                logger.info(f"Relay crawl requested for {pds_hostname}")
            else:
                logger.warning(f"requestCrawl returned {resp.status_code}: {resp.text}")
        except httpx.RequestError as e:
            logger.warning(f"requestCrawl failed (non-fatal): {e}")


# =============================================================================
# Public PDS methods (use PDS_HOSTNAME, session-based auth)
# =============================================================================


async def pds_login(did: str, password: str) -> TLoginAccountResponse:
    """Login to PDS via createSession."""
    pds_url = os.getenv("PDS_HOSTNAME")
    if not pds_url:
        raise ValueError("PDS_HOSTNAME not set in environment")

    async with httpx.AsyncClient(http2=True, timeout=30.0) as client:
        try:
            resp = await client.post(
                f"https://{pds_url}/xrpc/com.atproto.server.createSession",
                json={"identifier": did, "password": password},
            )
        except httpx.RequestError as e:
            raise RuntimeError(f"PDS request error: {e}") from e

    if resp.status_code != 200:
        error_json = resp.json()
        raise RuntimeError(
            f"PDS error: {error_json['error']} - {error_json['message']}"
        )

    return TLoginAccountResponse(**resp.json())


async def pds_create_app_password(
    session: TSession, name: str
) -> TCreateAppPasswordResponse:
    """
    Create app password via com.atproto.server.createAppPassword.
    Returns the app password details (name, password, createdAt).
    """
    if not session:
        raise ValueError("Session is required")

    pds_url = os.getenv("PDS_HOSTNAME")
    if not pds_url:
        raise ValueError("PDS_HOSTNAME not set in environment")

    headers = {
        "Authorization": f"Bearer {session.access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Check session expiration
        res = await client.get(
            f"https://{pds_url}/xrpc/com.atproto.server.getSession",
            headers=headers,
        )

        if res.status_code != 200:
            error_data = res.json() if res.text else {}
            if error_data.get("error") == "ExpiredToken":
                # Refresh the session
                refresh_headers = {
                    "Authorization": f"Bearer {session.refresh_token}",
                    "Content-Type": "application/json",
                }
                res_refresh = await client.post(
                    f"https://{pds_url}/xrpc/com.atproto.server.refreshSession",
                    headers=refresh_headers,
                )

                if res_refresh.status_code == 200:
                    refresh_data = res_refresh.json()
                    session.access_token = refresh_data.get("accessJwt")
                    session.refresh_token = refresh_data.get("refreshJwt")
                    headers["Authorization"] = f"Bearer {session.access_token}"

                    # Update tokens in database
                    db_pool = await db.get_pool()
                    async with db_pool.acquire() as conn:
                        await conn.execute(
                            """
                            UPDATE auth_sessions
                            SET access_token = $1, refresh_token = $2
                            WHERE session_token = $3 AND did = $4
                            """,
                            session.access_token,
                            session.refresh_token,
                            session.token,
                            session.did,
                        )
                else:
                    logger.error(
                        f"Failed to refresh session: {res_refresh.status_code}"
                    )
                    raise RuntimeError("Failed to refresh session")

        # Create app password
        res = await client.post(
            f"https://{pds_url}/xrpc/com.atproto.server.createAppPassword",
            headers=headers,
            json={"name": name},
        )

        if res.status_code == 200:
            data = res.json()
            logger.info(f"App password created for {session.did}")
            return TCreateAppPasswordResponse(**data)
        else:
            logger.error(f"Failed to create app password: {res.status_code} {res.text}")
            raise RuntimeError(f"Failed to create app password: {res.text}")


async def pds_create_record(session: TSession, collection: str, record: dict) -> dict:
    """Create a record on the PDS on behalf of the user. Returns {uri, cid}."""
    pds_url = os.getenv("PDS_HOSTNAME")
    if not pds_url:
        raise ValueError("PDS_HOSTNAME not set")

    headers = {
        "Authorization": f"Bearer {session.access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://{pds_url}/xrpc/com.atproto.repo.createRecord",
            headers=headers,
            json={
                "repo": session.did,
                "collection": collection,
                "record": record,
            },
        )

    if resp.status_code != 200:
        logger.error(f"pds_create_record failed: {resp.text}")
        raise RuntimeError(f"PDS error: {resp.text}")

    return resp.json()


async def pds_delete_record(session: TSession, collection: str, rkey: str):
    """Delete a record from the PDS on behalf of the user."""
    pds_url = os.getenv("PDS_HOSTNAME")
    if not pds_url:
        raise ValueError("PDS_HOSTNAME not set")

    headers = {
        "Authorization": f"Bearer {session.access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"https://{pds_url}/xrpc/com.atproto.repo.deleteRecord",
            headers=headers,
            json={
                "repo": session.did,
                "collection": collection,
                "rkey": rkey,
            },
        )

    if resp.status_code != 200:
        logger.error(f"pds_delete_record failed: {resp.text}")
        raise RuntimeError(f"PDS error: {resp.text}")


async def pds_set_birthdate(session: TSession) -> bool:
    """
    Set birthDate preference on Bluesky's AppView.
    Called when user creates an app password (= wants to use Bluesky).
    Returns True on success, False on failure.
    """
    if not session:
        logger.error("Session required for setting birthDate")
        return False

    pds_url = os.getenv("PDS_HOSTNAME")
    headers = {
        "Authorization": f"Bearer {session.access_token}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Step 1: Get current preferences from Bluesky
        try:
            res = await client.get(
                f"https://{pds_url}/xrpc/app.bsky.actor.getPreferences",
                headers=headers,
            )
        except httpx.RequestError as e:
            logger.error(f"Failed to get preferences: {e}")
            return False

        if res.status_code != 200:
            logger.warning(
                f"Could not get preferences: {res.status_code} - continuing anyway"
            )
            preferences = []
        else:
            data = res.json()
            preferences = data.get("preferences", [])

        # Step 2: Check if birthDate already exists (in personalDetailsPref)
        has_birthdate = any(
            p.get("$type") == "app.bsky.actor.defs#personalDetailsPref"
            and p.get("birthDate")
            for p in preferences
        )

        if has_birthdate:
            logger.info(f"birthDate already set for {session.did}")
            return True

        # Step 3: Add birthDate as personalDetailsPref and save preferences
        preferences.append(
            {
                "$type": "app.bsky.actor.defs#personalDetailsPref",
                "birthDate": DUMMY_BIRTHDATE,
            }
        )

        try:
            res = await client.post(
                f"https://{pds_url}/xrpc/app.bsky.actor.putPreferences",
                headers=headers,
                json={"preferences": preferences},
            )
        except httpx.RequestError as e:
            logger.error(f"Failed to set preferences: {e}")
            return False

        if res.status_code == 200:
            logger.info(f"birthDate set for {session.did} on Bluesky")
            return True
        else:
            logger.error(f"Failed to set birthDate: {res.status_code} {res.text}")
            return False
