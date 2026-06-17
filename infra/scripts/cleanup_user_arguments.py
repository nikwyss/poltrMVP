#!/usr/bin/env python3
"""
Delete all app.ch.poltr.ballot.argument records from user repos on the PDS.

Arguments are now stored exclusively in the community repo. This script
removes the old user-repo copies.

Usage:
    # Dry run (default):
    python cleanup_user_arguments.py

    # Actually delete:
    python cleanup_user_arguments.py --execute

Requires:
    - PDS port-forwarded to localhost:2583  (kubectl port-forward -n poltr svc/pds 2583:80)
    - PDS_ADMIN_PASSWORD env var set
    - COMMUNITY_DIDS env var set (comma-separated DIDs to skip, i.e. community repos)
"""

import argparse
import base64
import json
import os
import sys
import urllib.request
import urllib.error

PDS_HOST = os.getenv("PDS_HOST", "http://localhost:2583")
ADMIN_PASSWORD = os.getenv("PDS_ADMIN_PASSWORD", "")
COMMUNITY_DIDS = set(
    d.strip() for d in os.getenv("COMMUNITY_DIDS", "").split(",") if d.strip()
)
COLLECTION = "app.ch.poltr.ballot.argument"


def admin_auth_header() -> str:
    return "Basic " + base64.b64encode(f"admin:{ADMIN_PASSWORD}".encode()).decode()


def xrpc_get(endpoint: str, params: dict) -> dict:
    qs = "&".join(f"{k}={v}" for k, v in params.items() if v is not None)
    url = f"{PDS_HOST}/xrpc/{endpoint}?{qs}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def list_accounts() -> list[str]:
    """List all account DIDs on the PDS via admin API."""
    req = urllib.request.Request(
        f"{PDS_HOST}/xrpc/com.atproto.admin.listAccounts?limit=500",
        headers={"Authorization": admin_auth_header()},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
    return [a["did"] for a in data.get("accounts", [])]


def list_records(repo: str, cursor: str | None = None) -> tuple[list[dict], str | None]:
    """List argument records for a repo."""
    params = {"repo": repo, "collection": COLLECTION, "limit": "100"}
    if cursor:
        params["cursor"] = cursor
    try:
        data = xrpc_get("com.atproto.repo.listRecords", params)
    except urllib.error.HTTPError as e:
        if e.code in (400, 404):
            return [], None
        raise
    records = data.get("records", [])
    next_cursor = data.get("cursor")
    return records, next_cursor


def get_user_session(did: str, temp_password: str) -> str | None:
    """Set temp password and create session. Returns accessJwt."""
    # Set temp password
    body = json.dumps({"did": did, "password": temp_password}).encode()
    req = urllib.request.Request(
        f"{PDS_HOST}/xrpc/com.atproto.admin.updateAccountPassword",
        data=body,
        headers={
            "Authorization": admin_auth_header(),
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as e:
        print(f"  Failed to set temp password for {did}: {e.code} {e.read().decode()}")
        return None

    # Create session
    body = json.dumps({"identifier": did, "password": temp_password}).encode()
    req = urllib.request.Request(
        f"{PDS_HOST}/xrpc/com.atproto.server.createSession",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
        return data.get("accessJwt")
    except urllib.error.HTTPError as e:
        print(f"  Failed to create session for {did}: {e.code} {e.read().decode()}")
        return None


def delete_record(token: str, repo: str, rkey: str) -> bool:
    body = json.dumps({
        "repo": repo,
        "collection": COLLECTION,
        "rkey": rkey,
    }).encode()
    req = urllib.request.Request(
        f"{PDS_HOST}/xrpc/com.atproto.repo.deleteRecord",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
        return True
    except urllib.error.HTTPError as e:
        print(f"  Delete failed for {repo}/{rkey}: {e.code} {e.read().decode()}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Delete user-repo argument records from PDS")
    parser.add_argument("--execute", action="store_true", help="Actually delete (default: dry run)")
    args = parser.parse_args()

    if not ADMIN_PASSWORD:
        print("Error: PDS_ADMIN_PASSWORD env var required")
        sys.exit(1)

    print(f"PDS: {PDS_HOST}")
    print(f"Community DIDs: {COMMUNITY_DIDS or '(not set — will process ALL repos)'}")
    print(f"Mode: {'EXECUTE' if args.execute else 'DRY RUN'}")
    print()

    accounts = list_accounts()
    print(f"Found {len(accounts)} account(s)")

    total_found = 0
    total_deleted = 0
    temp_password = "TempCleanup!2026x"

    for did in accounts:
        if did in COMMUNITY_DIDS:
            print(f"  Skipping community account {did}")
            continue

        # Collect all records first
        all_records = []
        cursor = None
        while True:
            records, cursor = list_records(did)
            all_records.extend(records)
            if not cursor:
                break

        if not all_records:
            continue

        total_found += len(all_records)
        print(f"  {did}: {len(all_records)} argument record(s)")

        if not args.execute:
            for r in all_records:
                print(f"    [dry-run] would delete {r['uri']}")
            continue

        # Get session for deletion
        token = get_user_session(did, temp_password)
        if not token:
            print(f"    Skipping {did} — could not get session")
            continue

        for r in all_records:
            rkey = r["uri"].split("/")[-1]
            if delete_record(token, did, rkey):
                total_deleted += 1
                print(f"    Deleted {r['uri']}")

    print()
    print(f"Total argument records found in user repos: {total_found}")
    if args.execute:
        print(f"Total deleted: {total_deleted}")
    else:
        print("(dry run — use --execute to delete)")


if __name__ == "__main__":
    main()
