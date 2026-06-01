#!/usr/bin/env python3
"""
Delete all app.ch.poltr.peerreview.invitation and app.ch.poltr.peerreview.response
records from the governance PDS repo, so they can be re-imported with createRecord.

Also clears the corresponding DB tables so the indexer re-indexes cleanly.

Prerequisites:
  - PDS port-forward: kubectl port-forward -n poltr svc/pds 2583:80
  - Governance account password set (see CLAUDE.md)

Environment variables:
  PDS_HOST        PDS endpoint (default: http://localhost:2583)
  GOV_DID         Governance account DID
  GOV_PASSWORD    Governance account password
"""

import os
import sys
import time

import requests

PDS_HOST = os.getenv("PDS_HOST", "http://localhost:2583")
GOV_DID = os.getenv("GOV_DID", "did:plc:3ch7iwf6od4szklpolupbv7o")
GOV_PASSWORD = os.getenv("GOV_PASSWORD", "TempPass12345678")

COLLECTIONS = [
    "app.ch.poltr.peerreview.invitation",
    "app.ch.poltr.peerreview.response",
]


def authenticate():
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.server.createSession",
        json={"identifier": GOV_DID, "password": GOV_PASSWORD},
    )
    resp.raise_for_status()
    data = resp.json()
    print(f"Authenticated as {data['did']}")
    return data["accessJwt"]


def list_records(collection):
    """List all records in a collection, paginating."""
    records = []
    cursor = None
    while True:
        url = (
            f"{PDS_HOST}/xrpc/com.atproto.repo.listRecords"
            f"?repo={GOV_DID}&collection={collection}&limit=100"
        )
        if cursor:
            url += f"&cursor={cursor}"
        resp = requests.get(url)
        if resp.status_code != 200:
            break
        data = resp.json()
        batch = data.get("records", [])
        records.extend(batch)
        cursor = data.get("cursor")
        if not cursor or not batch:
            break
    return records


def delete_record(token, collection, rkey):
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.repo.deleteRecord",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json={
            "repo": GOV_DID,
            "collection": collection,
            "rkey": rkey,
        },
    )
    return resp.status_code in (200, 201)


def main():
    token = authenticate()

    for collection in COLLECTIONS:
        records = list_records(collection)
        print(f"\n{collection}: {len(records)} record(s) to delete")

        deleted = 0
        failed = 0
        for rec in records:
            rkey = rec["uri"].split("/")[-1]
            time.sleep(0.05)
            if delete_record(token, collection, rkey):
                deleted += 1
            else:
                print(f"  Failed to delete: {rkey}")
                failed += 1

        print(f"  Deleted: {deleted}, Failed: {failed}")

    print("\nDone. Now re-import with: python3 infra/scripts/import_peerreviews.py")


if __name__ == "__main__":
    main()
