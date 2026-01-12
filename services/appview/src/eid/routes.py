from datetime import datetime, timedelta, timezone
from hashlib import sha256
import os

import httpx
from typing import Literal
from uuid import uuid4
from fastapi import Query, Request, Depends
from src.auth.middleware import TSession, verify_session_token
from src.lib.atproto_api import pds_api_write_eid_proof_record_to_pds
from src.lib.fastapi import app


@app.get("/xrpc/app.ch.poltr.user.verification.initiate")
async def verification_initiate(
    request: Request, session: TSession = Depends(verify_session_token)
):

    assert session, "Session is required"
    presentation_random_id = uuid4().hex
    input_id = uuid4().hex

    # Make the verification request
    async with httpx.AsyncClient() as client:
        response = await client.post(
            os.getenv("APPVIEW_EID_VERIFIER_API", "UNKNOWN"),
            headers={
                "accept": "*/*",
                "Content-Type": "application/json",
            },
            json={
                "accepted_issuer_dids": (
                    [os.getenv("APPVIEW_EID_TRUSTED_ISSUER_DID")]
                    if os.getenv("APPVIEW_EID_TRUSTED_ISSUER_DID")
                    else []
                ),
                # TODO: add oauth token and pass it throught the verification process
                "jwt_secured_authorization_request": False,
                "response_mode": "direct_post",
                "presentation_definition": {
                    "id": presentation_random_id,
                    "input_descriptors": [
                        {
                            "id": input_id,
                            "format": {
                                "vc+sd-jwt": {
                                    "sd-jwt_alg_values": ["ES256"],
                                    "kb-jwt_alg_values": ["ES256"],
                                }
                            },
                            "constraints": {
                                "fields": [
                                    {
                                        "path": ["$.vct"],
                                        "filter": {
                                            "type": "string",
                                            "const": "betaid-sdjwt",
                                        },
                                    },
                                    {"path": ["$.personal_administrative_number"]},
                                ]
                            },
                        }
                    ],
                },
            },
        )
        response.raise_for_status()
        data = response.json()
        verification_id = data["id"]
        verification_url = data["verification_url"]
        verification_deep_link = data["verification_deeplink"]

    return {
        "verification_id": verification_id,
        "verification_url": verification_url,
        "verification_deep_link": verification_deep_link,
        "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat(),
    }


@app.get("/xrpc/app.ch.poltr.user.verification.polling")
async def verification_polling(
    request: Request,
    verification_id: str = Query(...),
    session: TSession = Depends(verify_session_token),
):

    # Get the verification result
    assert session, "Session is required"
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{os.getenv('APPVIEW_EID_VERIFIER_API', 'UNKNOWN')}/{verification_id}",
            headers={
                "Accept": "application/json",
            },
        )
        response.raise_for_status()

        data = response.json()
        status: Literal["PENDING", "SUCCESS", "FAILED", "ERROR"] = data.get(
            "state", "ERROR"
        )

        unique_id = None

        if status == "SUCCESS":

            ahv = (
                data.get("wallet_response", {})
                .get("credential_subject_data", {})
                .get("personal_administrative_number", None)
            )

            if not ahv:
                return {
                    "status": "ERROR",
                    "error": "Missing personal_administrative_number (AHV) in credential",
                    "UUID": None,
                }

            unique_id = sha256(
                f"{ahv}{os.getenv('APPVIEW_EID_HASH_SECRET', '')}".encode("utf-8")
            ).hexdigest()

            await pds_api_write_eid_proof_record_to_pds(session, eid_hash=unique_id)

        return {
            "status": status,
            "UUID": unique_id if status == "SUCCESS" else None,
        }

    return {
        "status": "ERROR",
        "UUID": None,
    }
