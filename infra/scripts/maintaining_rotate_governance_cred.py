#!/usr/bin/env python3
"""Rotate the governance/community account password.

The old password was hardcoded in infra/scripts/insert_governance_cred.py and is
therefore in git history (leaked). This script invalidates it end-to-end:

  1. Sets a FRESH password on the PDS via the admin API
     (com.atproto.admin.updateAccountPassword) — this kills the leaked one.
  2. Verifies the new password works (createSession returns an accessJwt).
  3. Re-encrypts the new password (USER master key) and UPDATEs auth.auth_creds
     so the live appview keeps logging in.
  4. Prints the new password ONCE so you can update the import/cleanup-job
     secrets (PDS_COMMUNITY_ACCOUNT_PASSWORD / COMMUNITY_PASSWORD).

Prerequisites — port-forward for a local run:
  kubectl port-forward -n poltr svc/pds 2583:80
  kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

Environment:
  PDS_HOST            PDS endpoint               (default: http://localhost:2583)
  PDS_ADMIN_PASSWORD  PDS admin password          (required)
  DID                 account to rotate           (default: the governance DID)
  DB_URL              appview DB connection URL    (required)
  MASTER_KEY_B64      APPVIEW_USER_CREDS_MASTER_KEY_B64 (required, for re-encrypt)
  NEW_PASSWORD        explicit new password        (optional; generated if absent)
  DRY_RUN             'true' to print steps without changing anything (default: false)

After a successful run:
  - kubectl rollout restart deploy/appview -n poltr   # drop the cached PDS token
  - update PDS_COMMUNITY_ACCOUNT_PASSWORD / COMMUNITY_PASSWORD wherever the
    one-shot import jobs read them.
"""

import base64
import os
import secrets
import string
import sys

import psycopg2
import requests

# Re-encrypt with the appview's exact USER-key SecretBox helper.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "services", "appview"))

PDS_HOST = os.getenv("PDS_HOST", "http://localhost:2583").rstrip("/")
PDS_ADMIN_PASSWORD = os.getenv("PDS_ADMIN_PASSWORD", "")
DID = os.getenv("DID", "did:plc:3ch7iwf6od4szklpolupbv7o")
DB_URL = os.getenv("DB_URL", "")
MASTER_KEY_B64 = os.getenv("MASTER_KEY_B64") or os.getenv("APPVIEW_USER_CREDS_MASTER_KEY_B64", "")
NEW_PASSWORD = os.getenv("NEW_PASSWORD", "")
DRY_RUN = os.getenv("DRY_RUN", "false").lower() == "true"


def _die(msg: str) -> None:
    print(f"ERROR: {msg}")
    sys.exit(1)


def _gen_password(length: int = 40) -> str:
    # Letters+digits only: unambiguous to copy into a secret, no shell-quoting
    # surprises for the import-job env vars.
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main() -> int:
    if not PDS_ADMIN_PASSWORD:
        _die("PDS_ADMIN_PASSWORD is required")
    if not DB_URL:
        _die("DB_URL is required")
    if not MASTER_KEY_B64:
        _die("MASTER_KEY_B64 (APPVIEW_USER_CREDS_MASTER_KEY_B64) is required")

    # encrypt_app_password reads APPVIEW_USER_CREDS_MASTER_KEY_B64 from env.
    os.environ["APPVIEW_USER_CREDS_MASTER_KEY_B64"] = MASTER_KEY_B64
    from src.atproto.pds_creds import encrypt_app_password

    new_password = NEW_PASSWORD or _gen_password()

    print(f"Rotating credential for {DID}")
    print(f"  PDS:  {PDS_HOST}")
    print(f"  mode: {'DRY_RUN (no changes)' if DRY_RUN else 'LIVE'}")

    admin_auth = "Basic " + base64.b64encode(
        f"admin:{PDS_ADMIN_PASSWORD}".encode()
    ).decode()

    if DRY_RUN:
        print("[DRY_RUN] would: updateAccountPassword -> createSession verify -> UPDATE auth_creds")
        return 0

    # 1. Set the new password on the PDS (admin auth). Invalidates the leaked one.
    r = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.admin.updateAccountPassword",
        headers={"Content-Type": "application/json", "Authorization": admin_auth},
        json={"did": DID, "password": new_password},
        timeout=30,
    )
    if r.status_code != 200:
        _die(f"updateAccountPassword failed: {r.status_code} {r.text}")
    print("  [1/3] PDS password updated.")

    # 2. Verify the new password actually authenticates.
    r = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.server.createSession",
        headers={"Content-Type": "application/json"},
        json={"identifier": DID, "password": new_password},
        timeout=30,
    )
    if r.status_code != 200 or not r.json().get("accessJwt"):
        _die(f"createSession verify failed: {r.status_code} {r.text} "
             "(PDS password WAS changed — re-run with NEW_PASSWORD set to retry the DB step)")
    print("  [2/3] New password verified via createSession.")

    # 3. Re-encrypt and store so the live appview keeps logging in.
    ciphertext, nonce = encrypt_app_password(new_password)
    conn = psycopg2.connect(DB_URL)
    try:
        with conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE auth.auth_creds
                SET app_pw_ciphertext = %s, app_pw_nonce = %s
                WHERE did = %s
                """,
                (psycopg2.Binary(ciphertext), psycopg2.Binary(nonce), DID),
            )
            if cur.rowcount != 1:
                conn.rollback()
                _die(f"auth_creds has {cur.rowcount} rows for {DID} (expected 1); "
                     "PDS password WAS changed — fix the row and re-run with NEW_PASSWORD.")
    finally:
        conn.close()
    print("  [3/3] auth_creds re-encrypted.")

    print("\nDONE. New password (store it in the import-job secrets, then forget it):")
    print(f"\n    {new_password}\n")
    print("Next:")
    print("  - kubectl rollout restart deploy/appview -n poltr   # drop cached PDS token")
    print("  - update PDS_COMMUNITY_ACCOUNT_PASSWORD / COMMUNITY_PASSWORD wherever the")
    print("    one-shot import/cleanup jobs read them.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
