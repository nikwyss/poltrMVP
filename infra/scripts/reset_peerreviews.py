#!/usr/bin/env python3
"""
Delete all peer-review *invitation* records from a ballot's community PDS repo.

Use to reset peer-review assignment for a fresh test. Because the writer
recreates invitations at a *deterministic* rkey via createRecord (create-only),
the old PDS records MUST be removed or every re-assignment collides and is
silently skipped. This script removes them; clear the DB projection
(app_peerreview_invitations) and restart appview + community-writer separately.

Only `app.ch.poltr.peerreview.invitation` is touched. Reviews (app_peerreviews),
responses and arguments are left intact.

Environment variables:
  PDS_HOST        PDS endpoint (default: http://localhost:2583)
  DB_URL          PostgreSQL connection URL (for community_accounts lookup)
  BALLOT_RKEY     Ballot rkey — credentials loaded from community_accounts table
  MASTER_KEY_B64  APPVIEW_COMMUNITY_CREDS_MASTER_KEY_B64 (decrypts community pw)
  DRY_RUN         "true" to list without deleting (default: false)
"""

import base64
import os
import sys

import psycopg2
import requests
from nacl import secret as nacl_secret

COLLECTION = "app.ch.poltr.peerreview.invitation"
BATCH = 100  # applyWrites deletes per request


def load_community_creds(db_url: str, ballot_rkey: str, master_key_b64: str):
    """Return (did, handle, password) for the ballot's community account."""
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT did, handle, pw_ciphertext, pw_nonce "
                "FROM auth.community_accounts WHERE ballot_rkey = %s",
                (ballot_rkey,),
            )
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        sys.exit(f"ERROR: no community account for ballot_rkey={ballot_rkey}")
    did, handle, pw_ct, pw_nonce = row
    box = nacl_secret.SecretBox(base64.b64decode(master_key_b64))
    password = box.decrypt(bytes(pw_ct), bytes(pw_nonce)).decode("utf-8")
    return did, handle, password


def authenticate(pds_host: str, identifier: str, password: str):
    resp = requests.post(
        f"{pds_host}/xrpc/com.atproto.server.createSession",
        json={"identifier": identifier, "password": password},
    )
    resp.raise_for_status()
    data = resp.json()
    return data["accessJwt"], data["did"]


def list_all_rkeys(pds_host: str, did: str) -> list[str]:
    rkeys: list[str] = []
    cursor = None
    while True:
        params = {"repo": did, "collection": COLLECTION, "limit": 100}
        if cursor:
            params["cursor"] = cursor
        resp = requests.get(
            f"{pds_host}/xrpc/com.atproto.repo.listRecords", params=params
        )
        resp.raise_for_status()
        body = resp.json()
        for rec in body.get("records", []):
            rkeys.append(rec["uri"].rsplit("/", 1)[-1])
        cursor = body.get("cursor")
        if not cursor or not body.get("records"):
            break
    return rkeys


def delete_batch(pds_host: str, token: str, did: str, rkeys: list[str]) -> None:
    writes = [
        {"$type": "com.atproto.repo.applyWrites#delete",
         "collection": COLLECTION, "rkey": rk}
        for rk in rkeys
    ]
    resp = requests.post(
        f"{pds_host}/xrpc/com.atproto.repo.applyWrites",
        headers={"Authorization": f"Bearer {token}"},
        json={"repo": did, "writes": writes},
    )
    resp.raise_for_status()


def main() -> None:
    pds_host = os.getenv("PDS_HOST", "http://localhost:2583").rstrip("/")
    db_url = os.environ["DB_URL"]
    ballot_rkey = os.environ["BALLOT_RKEY"]
    master_key_b64 = os.environ["MASTER_KEY_B64"]
    dry_run = os.getenv("DRY_RUN", "false").lower() == "true"

    did, handle, password = load_community_creds(db_url, ballot_rkey, master_key_b64)
    print(f"Community account: {handle} ({did}) — ballot {ballot_rkey}")

    rkeys = list_all_rkeys(pds_host, did)
    print(f"Found {len(rkeys)} {COLLECTION} records on PDS.")
    if not rkeys:
        print("Nothing to delete.")
        return
    if dry_run:
        print("DRY_RUN=true — not deleting.")
        return

    token, _ = authenticate(pds_host, handle, password)
    deleted = 0
    for i in range(0, len(rkeys), BATCH):
        chunk = rkeys[i : i + BATCH]
        delete_batch(pds_host, token, did, chunk)
        deleted += len(chunk)
        print(f"  deleted {deleted}/{len(rkeys)}")
    print(f"Done. Deleted {deleted} invitation records from {handle}.")


if __name__ == "__main__":
    main()
