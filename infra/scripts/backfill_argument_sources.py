#!/usr/bin/env python3
"""
Backfill: rewrite existing user-submitted argument records on the PDS so
they carry an explicit `source: { $type: '...#sourceUser', authorDid }`
union instead of the legacy top-level `authorDid` field.

For each governance account (one per ballot), the script:
  1. Loads & decrypts the governance password from auth.governance_accounts.
  2. Opens a PDS session.
  3. Lists existing app.ch.poltr.ballot.argument records.
  4. Skips records that already have a `source` field (idempotent).
  5. Rewrites the rest via putRecord, preserving rkey, type, ballot, etc.

Environment:
  PDS_HOST         PDS endpoint                          (default: http://localhost:2583)
  DB_URL           PostgreSQL connection URL             (required)
  MASTER_KEY_B64   APPVIEW_PDS_CREDS_MASTER_KEY_B64      (required)
  BALLOT_RKEY      Only backfill this ballot             (optional: omit = all)
  DRY_RUN          'true' = inspect only, no writes      (default: false)
  LIMIT_PER_REPO   Max records per governance account    (default: 0 = no limit)
"""

import os
import sys
from typing import Optional

import psycopg2
import requests
from nacl import secret as nacl_secret
import base64


ARGUMENT_NSID = "app.ch.poltr.ballot.argument"
USER_REF = f"{ARGUMENT_NSID}#sourceUser"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def env(name: str, default: Optional[str] = None) -> str:
    val = os.getenv(name, default)
    if val is None:
        print(f"ERROR: env var {name} is required", file=sys.stderr)
        sys.exit(2)
    return val


def decrypt(ciphertext: bytes, nonce: bytes, master_key_b64: str) -> str:
    key = base64.b64decode(master_key_b64)
    if len(key) != 32:
        raise RuntimeError("MASTER_KEY_B64 must decode to 32 bytes")
    box = nacl_secret.SecretBox(key)
    return box.decrypt(ciphertext, nonce).decode("utf-8")


def create_session(pds_host: str, did: str, password: str) -> str:
    resp = requests.post(
        f"{pds_host}/xrpc/com.atproto.server.createSession",
        json={"identifier": did, "password": password},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["accessJwt"]


def list_records(pds_host: str, did: str, cursor: Optional[str] = None) -> dict:
    params = {"repo": did, "collection": ARGUMENT_NSID, "limit": 100}
    if cursor:
        params["cursor"] = cursor
    resp = requests.get(
        f"{pds_host}/xrpc/com.atproto.repo.listRecords",
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def put_record(
    pds_host: str,
    did: str,
    jwt: str,
    rkey: str,
    record: dict,
) -> dict:
    resp = requests.post(
        f"{pds_host}/xrpc/com.atproto.repo.putRecord",
        json={
            "repo": did,
            "collection": ARGUMENT_NSID,
            "rkey": rkey,
            "record": record,
        },
        headers={"Authorization": f"Bearer {jwt}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def needs_backfill(record: dict) -> bool:
    """True iff this record does not yet carry an explicit `source` union."""
    src = record.get("source")
    if isinstance(src, dict) and src.get("$type"):
        return False
    return True


def rewrite_record(record: dict) -> Optional[dict]:
    """Return a new record dict with `source.sourceUser` derived from the
    legacy top-level `authorDid`. Returns None if no authorDid is available."""
    author_did = record.get("authorDid")
    if not author_did:
        return None

    new_record = {k: v for k, v in record.items() if k != "authorDid"}
    new_record["source"] = {
        "$type": USER_REF,
        "authorDid": author_did,
    }
    return new_record


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    pds_host = os.getenv("PDS_HOST", "http://localhost:2583")
    db_url = env("DB_URL")
    master_key_b64 = env("MASTER_KEY_B64")
    only_ballot = os.getenv("BALLOT_RKEY")
    dry_run = os.getenv("DRY_RUN", "false").lower() == "true"
    limit_per_repo = int(os.getenv("LIMIT_PER_REPO", "0"))

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            if only_ballot:
                cur.execute(
                    "SELECT did, handle, ballot_rkey, pw_ciphertext, pw_nonce "
                    "FROM auth.governance_accounts WHERE ballot_rkey = %s",
                    (only_ballot,),
                )
            else:
                cur.execute(
                    "SELECT did, handle, ballot_rkey, pw_ciphertext, pw_nonce "
                    "FROM auth.governance_accounts ORDER BY ballot_rkey"
                )
            accounts = cur.fetchall()
    finally:
        conn.close()

    print(f"Found {len(accounts)} governance account(s) to scan.")

    total_seen = 0
    total_rewritten = 0
    total_skipped = 0
    total_unfixable = 0

    for did, handle, ballot_rkey, pw_ct, pw_nonce in accounts:
        print(f"\n=== Ballot {ballot_rkey} — {handle} ({did}) ===")
        try:
            password = decrypt(bytes(pw_ct), bytes(pw_nonce), master_key_b64)
        except Exception as err:
            print(f"  ! Failed to decrypt password: {err}")
            continue

        try:
            jwt = create_session(pds_host, did, password)
        except Exception as err:
            print(f"  ! createSession failed: {err}")
            continue

        cursor = None
        n_in_repo = 0
        while True:
            page = list_records(pds_host, did, cursor)
            records = page.get("records", [])
            if not records:
                break

            for rec in records:
                total_seen += 1
                n_in_repo += 1
                if limit_per_repo and n_in_repo > limit_per_repo:
                    cursor = None
                    break

                uri = rec.get("uri", "")
                rkey = uri.rsplit("/", 1)[-1]
                value = rec.get("value", {})

                if not needs_backfill(value):
                    total_skipped += 1
                    continue

                new_value = rewrite_record(value)
                if not new_value:
                    print(f"  ? {rkey}: no authorDid, can't backfill — leaving as-is")
                    total_unfixable += 1
                    continue

                if dry_run:
                    print(f"  [dry-run] would rewrite {rkey}")
                else:
                    try:
                        put_record(pds_host, did, jwt, rkey, new_value)
                        print(f"  ✓ rewrote {rkey}")
                    except Exception as err:
                        print(f"  ! putRecord failed for {rkey}: {err}")
                        continue
                total_rewritten += 1

            cursor = page.get("cursor")
            if not cursor or (limit_per_repo and n_in_repo >= limit_per_repo):
                break

    print("\n=== Summary ===")
    print(f"  seen:        {total_seen}")
    print(f"  rewritten:   {total_rewritten}{' (dry-run)' if dry_run else ''}")
    print(f"  skipped:     {total_skipped} (already had source)")
    print(f"  unfixable:   {total_unfixable} (no authorDid)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
