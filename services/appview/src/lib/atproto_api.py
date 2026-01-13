from datetime import datetime, timezone
import os
import httpx
from pydantic import BaseModel
from src.lib import db
from src.auth.middleware import TSession


async def pds_api_write_eid_proof_record_to_pds(session: TSession, eid_hash: str):

    assert session, "Session is required"
    pds_url = os.getenv("PDS_HOSTNAME")
    assert os.getenv(
        "APPVIEW_EID_TRUSTED_ISSUER_DID"
    ), "APPVIEW_EID_TRUSTED_ISSUER_DID not set in environment"
    verified_at_iso = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    record = {
        "$type": "app.info.poltr.eid.verification",
        "eidIssuer": os.getenv("APPVIEW_EID_TRUSTED_ISSUER_DID"),
        "eidHash": eid_hash,
        "verifiedBy": os.getenv("APPVIEW_SERVER_DID"),
        "verifiedAt": verified_at_iso,
    }

    headers = {
        "Authorization": f"Bearer {session.access_token}",
        "Content-Type": "application/json",
    }

    # check session expiration
    res = httpx.get(
        f"{pds_url}/xrpc/com.atproto.server.getSession",
        headers=headers,
    )
    if (
        res.status_code != 200
        and res.json()
        and res.json().get("error", "UNKNOWN") == "ExpiredToken"
    ):
        refresh_headers = {
            "Authorization": f"Bearer {session.refresh_token}",
            "Content-Type": "application/json",
        }
        res_refresh = httpx.post(
            f"{pds_url}/xrpc/com.atproto.server.refreshSession",
            headers=refresh_headers,
        )
        if res_refresh.status_code == 200:
            refresh_data = res_refresh.json()
            session.access_token = refresh_data.get("accessJwt")
            session.refresh_token = refresh_data.get("refreshJwt")
            headers["Authorization"] = f"Bearer {session.access_token}"

            # store new tokens in session db
            session.refresh_token

            db_pool = await db.get_pool()
            async with db_pool.acquire() as conn:

                # Insert new entry in pds_creds table
                await conn.execute(
                    """
                    UPDATE access_token, refresh_token FROM pds_creds WHERE session_token = $1 and did = $2 LIMIT 1
                    """,
                    session.token,
                    session.did,
                )

    res = httpx.post(
        f"{pds_url}/xrpc/com.atproto.repo.putRecord",
        headers=headers,
        json={
            "repo": session.did,
            "collection": "app.info.poltr.eid.verification",
            "rkey": "self",
            "record": record,
        },
    )

    print(res.status_code, res.text)


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
    """Create account on PDS via its API"""

    pds_url = os.getenv("PDS_HOSTNAME")
    # pds_admin_password = os.getenv("PDS_ADMIN_PASSWORD")

    if not pds_url:
        raise Exception("PDS_HOSTNAME not set in environment")
    # if not pds_admin_password:
    #     raise Exception("PDS_ADMIN_PASSWORD not set in environment")

    # Ensure pds_url has a scheme
    if not pds_url.startswith("http://") and not pds_url.startswith("https://"):
        pds_url = f"https://{pds_url}"  # https://pds.poltr.info'

    async with httpx.AsyncClient(http2=True, timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{pds_url}/xrpc/com.atproto.server.createAccount",
                # headers={"Authorization": f"Basic {auth}"},
                json={"handle": handle, "email": user_email, "password": password},
            )
        except httpx.RequestError as e:
            raise Exception(f"PDS request error: {e}") from e
    if resp.status_code != 200:
        errorjson = resp.json()
        raise Exception(f"PDS error: {errorjson['error']} - {errorjson['message']}")

    return TCreateAccountResponse(**resp.json())


async def pds_api_login(did: str, password: str) -> TLoginAccountResponse:
    """Login to PDS via its API"""

    pds_url = os.getenv("PDS_HOSTNAME")

    if not pds_url:
        raise Exception("PDS_HOSTNAME not set in environment")

    # Ensure pds_url has a scheme
    # if not pds_url.startswith("http://") and not pds_url.startswith("https://"):
    #     pds_url = f"https://{pds_url}"  # https://pds.poltr.info'

    async with httpx.AsyncClient(http2=True, timeout=30.0) as client:
        try:
            resp = await client.post(
                f"{pds_url}/xrpc/com.atproto.server.createSession",
                json={"identifier": did, "password": password},
            )
        except httpx.RequestError as e:
            raise Exception(f"PDS request error: {e}") from e
    if resp.status_code != 200:
        errorjson = resp.json()
        raise Exception(f"PDS error: {errorjson['error']} - {errorjson['message']}")

    return TLoginAccountResponse(**resp.json())
