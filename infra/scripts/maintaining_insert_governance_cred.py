#!/usr/bin/env python3
"""One-shot script: encrypt the governance/community account password and emit the
INSERT into auth_creds.

The password is read from the GOVERNANCE_PASSWORD env var — NEVER hardcode it
here (a hardcoded value lands in git history forever). To rotate an account whose
password already leaked, use rotate_governance_cred.py instead.

Usage:
  export APPVIEW_USER_CREDS_MASTER_KEY_B64=$(kubectl get secret appview-secrets -n poltr \
      -o jsonpath='{.data.APPVIEW_USER_CREDS_MASTER_KEY_B64}' | base64 -d)
  export APPVIEW_EMAIL_HMAC_PEPPER_B64=$(kubectl get secret appview-secrets -n poltr \
      -o jsonpath='{.data.APPVIEW_EMAIL_HMAC_PEPPER_B64}' | base64 -d)
  GOVERNANCE_PASSWORD=<pw> python3 insert_governance_cred.py
"""

import os
import sys

# Allow importing pds_creds from the appview source
sys.path.insert(
    0, os.path.join(os.path.dirname(__file__), "..", "..", "services", "appview")
)

from src.atproto.pds_creds import encrypt_app_password
from src.auth.email_hmac import email_digest  # needs APPVIEW_EMAIL_HMAC_PEPPER_B64

DID = "did:plc:3ch7iwf6od4szklpolupbv7o"
HANDLE = "admin.id.poltr.ch"
EMAIL = "community@poltr.ch"  # placeholder — adjust if needed
PASSWORD = os.getenv("GOVERNANCE_PASSWORD", "")
if not PASSWORD:
    sys.exit("ERROR: set GOVERNANCE_PASSWORD (do not hardcode it)")

ciphertext, nonce = encrypt_app_password(PASSWORD)

print("-- Encrypted community account credentials")
print("-- Run this SQL against your PostgreSQL database:")
print()
print(
    f"INSERT INTO auth.auth_creds (did, handle, email_hmac, pds_url, app_pw_ciphertext, app_pw_nonce)"
)
print(f"VALUES (")
print(f"  '{DID}',")
print(f"  '{HANDLE}',")
print(f"  '{email_digest(EMAIL)}',")
print(f"  'https://pds2.poltr.info',")
print(f"  '\\x{ciphertext.hex()}',")
print(f"  '\\x{nonce.hex()}'")
print(f");")
