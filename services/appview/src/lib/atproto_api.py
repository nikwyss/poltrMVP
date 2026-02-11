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


async def _pds_admin_create_invite_code() -> str:
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
        error_json = resp.json()
        raise RuntimeError(f"Failed to create invite code: {error_json}")

    return resp.json()["code"]


async def pds_api_admin_create_account(
    handle: str, password: str, user_email: str
) -> TCreateAccountResponse:
    """Create account on PDS: first generate invite code, then create account."""
    # Use internal K8s URL for reliability: admin account kann sich offenbar nicht remotely authenifizieren.
    pds_internal_url = os.getenv("PDS_INTERNAL_URL")
    assert (
        pds_internal_url is not None
    ), "PDS_INTERNAL_URL is not set: e.g. http://pds.poltr.svc.cluster.local"

    # Step 1: Generate a single-use invite code
    invite_code = await _pds_admin_create_invite_code()
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
        error_json = resp.json()
        raise RuntimeError(
            f"PDS error: {error_json['error']} - {error_json['message']}"
        )

    return TCreateAccountResponse(**resp.json())


async def pds_set_profile(access_jwt: str, did: str, display_name: str):
    """Write app.bsky.actor.profile record with displayName to PDS."""
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
                "collection": "app.bsky.actor.profile",
                "rkey": "self",
                "record": {
                    "$type": "app.bsky.actor.profile",
                    "displayName": display_name,
                },
            },
        )

    if resp.status_code != 200:
        logger.error(f"Failed to set profile for {did}: {resp.text}")
        raise RuntimeError(f"Failed to set profile: {resp.text}")

    logger.info(f"Profile set for {did}: {display_name}")


async def pds_write_pseudonym_record(access_jwt: str, did: str, pseudonym_data: dict):
    """Write app.ch.poltr.actor.pseudonym record to PDS."""
    pds_internal_url = os.getenv("PDS_INTERNAL_URL")
    assert pds_internal_url, "PDS_INTERNAL_URL is not set"

    headers = {
        "Authorization": f"Bearer {access_jwt}",
        "Content-Type": "application/json",
    }

    record = {
        "$type": "app.ch.poltr.actor.pseudonym",
        "displayName": pseudonym_data["displayName"],
        "mountainName": pseudonym_data["mountainName"],
        "mountainFullname": pseudonym_data.get("mountainFullname"),
        "canton": pseudonym_data["canton"],
        "height": pseudonym_data["height"],
        "color": pseudonym_data["color"],
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{pds_internal_url}/xrpc/com.atproto.repo.putRecord",
            headers=headers,
            json={
                "repo": did,
                "collection": "app.ch.poltr.actor.pseudonym",
                "rkey": "self",
                "record": record,
            },
        )

    if resp.status_code != 200:
        logger.error(f"Failed to write pseudonym record for {did}: {resp.text}")
        raise RuntimeError(f"Failed to write pseudonym record: {resp.text}")

    logger.info(f"Pseudonym record written for {did}")


async def pds_api_admin_delete_account(did: str) -> None:
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


async def pds_api_login(did: str, password: str) -> TLoginAccountResponse:
    """Login to PDS via its API."""
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


class TCreateAppPasswordResponse(BaseModel):
    name: str
    password: str
    createdAt: str


async def pds_api_create_app_password(
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


async def set_birthdate_on_bluesky(session: TSession) -> bool:
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
