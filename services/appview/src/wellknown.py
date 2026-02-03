import os
from src.lib.fastapi import app


@app.get("/.well-known/did.json")
async def get_did_document():
    """DID Document
    e.g. did:web:app.poltr.info
    """
    server_did = os.getenv("APPVIEW_SERVER_DID")
    assert server_did is not None, "APPVIEW_SERVER_DID is not set"

    return {
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": server_did,
    }
