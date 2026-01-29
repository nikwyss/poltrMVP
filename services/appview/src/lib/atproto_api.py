from datetime import datetime, timezone
import logging
import os
import httpx
from pydantic import BaseModel
from src.lib.pds_creds import sign_eid_verification
from src.lib import db
from src.auth.middleware import TSession

logger = logging.getLogger(__name__)


async def pds_api_write_eid_proof_record_to_pds(session: TSession, eid_hash: str) -> bool:
    """
    Write EID verification record to user's PDS repo.
    Returns True on success, False on failure.
    """
    if not session:
        raise ValueError("Session is required")

    pds_url = os.getenv("PDS_HOSTNAME")
    eid_issuer = os.getenv("APPVIEW_EID_TRUSTED_ISSUER_DID")
    verified_by = os.getenv("APPVIEW_SERVER_DID")

    if not eid_issuer:
        raise ValueError("APPVIEW_EID_TRUSTED_ISSUER_DID not set")

    verified_at_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    signature = sign_eid_verification(eid_hash, eid_issuer, verified_at_iso)

    record = {
        "$type": "app.info.poltr.eid.verification",
        "eidIssuer": eid_issuer,
        "eidHash": eid_hash,
        "verifiedBy": verified_by,
        "verifiedAt": verified_at_iso,
        "signature": signature,
    }

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
                            UPDATE pds_creds
                            SET access_token = $1, refresh_token = $2
                            WHERE session_token = $3 AND did = $4
                            """,
                            session.access_token,
                            session.refresh_token,
                            session.token,
                            session.did,
                        )
                else:
                    logger.error(f"Failed to refresh session: {res_refresh.status_code}")
                    return False

        # Write the record
        res = await client.post(
            f"https://{pds_url}/xrpc/com.atproto.repo.putRecord",
            headers=headers,
            json={
                "repo": session.did,
                "collection": "app.info.poltr.eid.verification",
                "rkey": "self",
                "record": record,
            },
        )

        if res.status_code == 200:
            logger.info(f"EID record written for {session.did}")
            return True
        else:
            logger.error(f"Failed to write EID record: {res.status_code} {res.text}")
            return False


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


async def pds_api_create_account(
    handle: str, password: str, user_email: str
) -> TCreateAccountResponse:
    """Create account on PDS via its API."""
    pds_url = os.getenv("PDS_HOSTNAME")
    if not pds_url:
        raise ValueError("PDS_HOSTNAME not set in environment")

    async with httpx.AsyncClient(http2=True, timeout=30.0) as client:
        try:
            resp = await client.post(
                f"https://{pds_url}/xrpc/com.atproto.server.createAccount",
                json={"handle": handle, "email": user_email, "password": password},
            )
        except httpx.RequestError as e:
            raise RuntimeError(f"PDS request error: {e}") from e

    if resp.status_code != 200:
        error_json = resp.json()
        raise RuntimeError(f"PDS error: {error_json['error']} - {error_json['message']}")

    return TCreateAccountResponse(**resp.json())


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
        raise RuntimeError(f"PDS error: {error_json['error']} - {error_json['message']}")

    return TLoginAccountResponse(**resp.json())


class TCreateAppPasswordResponse(BaseModel):
    name: str
    password: str
    createdAt: str


async def pds_api_create_app_password(session: TSession, name: str) -> TCreateAppPasswordResponse:
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
                            UPDATE pds_creds
                            SET access_token = $1, refresh_token = $2
                            WHERE session_token = $3 AND did = $4
                            """,
                            session.access_token,
                            session.refresh_token,
                            session.token,
                            session.did,
                        )
                else:
                    logger.error(f"Failed to refresh session: {res_refresh.status_code}")
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
