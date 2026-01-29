import os
from src.lib.fastapi import app


@app.get("/.well-known/did.json")
async def get_did_document():
    """DID Document for did:web:app.poltr.info"""
    server_did = os.getenv("APPVIEW_SERVER_DID", "did:web:app.poltr.info")

    return {
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": server_did,
    }
