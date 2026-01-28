import os
import base64
from lib.pds_creds import get_public_key_multibase
from src.lib.fastapi import app


@app.get("/.well-known/did.json")
async def get_did_document():
    """DID Document for did:web:app.poltr.info"""
    server_did = os.getenv("APPVIEW_SERVER_DID", "did:web:app.poltr.info")
    public_key_multibase = get_public_key_multibase()

    doc = {
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1",
        ],
        "id": server_did,
        "verificationMethod": [],
        "assertionMethod": [],
    }

    if public_key_multibase:
        doc["verificationMethod"].append(
            {
                "id": f"{server_did}#eid-signing",
                "type": "Ed25519VerificationKey2020",
                "controller": server_did,
                "publicKeyMultibase": public_key_multibase,
            }
        )
        doc["assertionMethod"].append(f"{server_did}#eid-signing")

    return doc


@app.get("/.well-known/lexicons/app/info/poltr/eid/verification.json")
async def get_lexicon_eid_verification():
    return {
        "lexicon": 1,
        "id": "app.info.poltr.eid.verification",
        "defs": {
            "main": {
                "type": "record",
                "description": "E-ID verification flag for a user.",
                "key": "literal",
                "record": {
                    "type": "object",
                    "required": ["eidIssuer", "verifiedBy", "verifiedAt", "signature"],
                    "properties": {
                        "eidIssuer": {"type": "string", "format": "did"},
                        "eidHash": {"type": "string"},
                        "verifiedBy": {"type": "string", "format": "did"},
                        "verifiedAt": {"type": "string", "format": "datetime"},
                        "signature": {
                            "type": "string",
                            "description": "Base64-encoded Ed25519 signature of 'eidHash|eidIssuer|verifiedAt' by verifiedBy",
                        },
                    },
                },
            }
        },
    }
