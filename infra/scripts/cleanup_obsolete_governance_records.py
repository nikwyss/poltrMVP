#!/usr/bin/env python3
"""
Delete obsolete record collections from community ballot PDS repos.

The following collections are no longer used by the live AppView/Indexer code
and are leftovers from earlier iterations:

  - app.ch.poltr.ballot.entry      Ballots are CMS content, not ATProto records.
  - app.ch.poltr.content.rating    Ratings live on USER accounts, never on
                                   community accounts.
  - app.bsky.feed.like             Bsky cross-likes live on USER accounts.
  - app.bsky.feed.generator        The poltr feed-generator record lives on
                                   did:web:app.poltr.info, not on per-ballot
                                   community accounts.

By default this iterates over ALL community accounts in auth.community_accounts.
Pass COMMUNITY_DID to restrict to a single account.

Prerequisites:
  - PDS port-forward:      kubectl port-forward -n poltr svc/pds 2583:80
  - PostgreSQL port-forward: kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

Environment variables:
  PDS_HOST         PDS endpoint (default: http://localhost:2583)
  DB_URL           PostgreSQL connection URL (loads encrypted creds)
  MASTER_KEY_B64   APPVIEW_COMMUNITY_CREDS_MASTER_KEY_B64 (for decryption)
  COMMUNITY_DID          Optional: limit to a single community account
  DRY_RUN          Set to "true" to list records without deleting (default: false)
"""

import base64
import os
import sys
import time

import psycopg2
import requests
from nacl import secret as nacl_secret


PDS_HOST = os.getenv("PDS_HOST", "http://localhost:2583")
DB_URL = os.getenv("DB_URL", "")
MASTER_KEY_B64 = os.getenv("MASTER_KEY_B64", "")
COMMUNITY_DID_FILTER = os.getenv("COMMUNITY_DID", "").strip() or None
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"

OBSOLETE_COLLECTIONS = [
    "app.ch.poltr.ballot.entry",
    "app.ch.poltr.content.rating",
    "app.bsky.feed.like",
    "app.bsky.feed.generator",
]


def load_community_accounts():
    """Yield (did, handle, password) for each community account."""
    if not DB_URL or not MASTER_KEY_B64:
        print("ERROR: DB_URL and MASTER_KEY_B64 are required")
        sys.exit(1)

    key = base64.b64decode(MASTER_KEY_B64)
    box = nacl_secret.SecretBox(key)

    conn = psycopg2.connect(DB_URL)
    try:
        with conn.cursor() as cur:
            if COMMUNITY_DID_FILTER:
                cur.execute(
                    "SELECT did, handle, pw_ciphertext, pw_nonce "
                    "FROM auth.community_accounts WHERE did = %s",
                    (COMMUNITY_DID_FILTER,),
                )
            else:
                cur.execute(
                    "SELECT did, handle, pw_ciphertext, pw_nonce "
                    "FROM auth.community_accounts ORDER BY ballot_rkey"
                )
            rows = cur.fetchall()
    finally:
        conn.close()

    if not rows:
        print("ERROR: No community accounts matched the query")
        sys.exit(1)

    for did, handle, pw_ct, pw_nonce in rows:
        password = box.decrypt(bytes(pw_ct), bytes(pw_nonce)).decode("utf-8")
        yield did, handle, password


def authenticate(did, password):
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.server.createSession",
        json={"identifier": did, "password": password},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["accessJwt"]


def list_records(did, collection):
    records = []
    cursor = None
    while True:
        url = (
            f"{PDS_HOST}/xrpc/com.atproto.repo.listRecords"
            f"?repo={did}&collection={collection}&limit=100"
        )
        if cursor:
            url += f"&cursor={cursor}"
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            break
        data = resp.json()
        batch = data.get("records", [])
        records.extend(batch)
        cursor = data.get("cursor")
        if not cursor or not batch:
            break
    return records


def delete_record(token, did, collection, rkey):
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.repo.deleteRecord",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={"repo": did, "collection": collection, "rkey": rkey},
        timeout=15,
    )
    return resp.status_code in (200, 201)


def cleanup_account(did, handle, password):
    print(f"\n=== {handle} ({did}) ===")

    token = None
    totals = {"deleted": 0, "failed": 0, "found": 0}

    for collection in OBSOLETE_COLLECTIONS:
        records = list_records(did, collection)
        if not records:
            continue

        totals["found"] += len(records)
        print(f"  {collection}: {len(records)} record(s)")

        if DRY_RUN:
            continue

        if token is None:
            try:
                token = authenticate(did, password)
            except Exception as err:
                print(f"  ERROR: auth failed — {err}")
                return totals

        for rec in records:
            rkey = rec["uri"].split("/")[-1]
            time.sleep(0.03)
            if delete_record(token, did, collection, rkey):
                totals["deleted"] += 1
            else:
                print(f"    Failed to delete: {collection}/{rkey}")
                totals["failed"] += 1

    if totals["found"] == 0:
        print("  (clean — nothing to delete)")
    elif not DRY_RUN:
        print(f"  Deleted: {totals['deleted']}, Failed: {totals['failed']}")

    return totals


def main():
    print(f"PDS:     {PDS_HOST}")
    print(f"Mode:    {'DRY_RUN (no deletes)' if DRY_RUN else 'LIVE — records will be deleted'}")
    print(f"Filter:  {'did=' + COMMUNITY_DID_FILTER if COMMUNITY_DID_FILTER else 'ALL community accounts'}")
    print(f"Targets: {', '.join(OBSOLETE_COLLECTIONS)}")

    grand = {"deleted": 0, "failed": 0, "found": 0, "accounts": 0}
    for did, handle, password in load_community_accounts():
        grand["accounts"] += 1
        result = cleanup_account(did, handle, password)
        for k in ("deleted", "failed", "found"):
            grand[k] += result[k]

    print("\n--- Summary ---")
    print(f"Accounts scanned: {grand['accounts']}")
    print(f"Obsolete records found: {grand['found']}")
    if not DRY_RUN:
        print(f"Deleted: {grand['deleted']}, Failed: {grand['failed']}")
    else:
        print("DRY_RUN — re-run with DRY_RUN=false to delete")


if __name__ == "__main__":
    main()
