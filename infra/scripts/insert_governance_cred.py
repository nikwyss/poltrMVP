#!/usr/bin/env python3
"""One-shot script: encrypt the governance account password and INSERT into auth_creds.

Usage:
  APPVIEW_PDS_CREDS_MASTER_KEY_B64=<key> python3 insert_governance_cred.py

Or pipe the master key:
  export APPVIEW_PDS_CREDS_MASTER_KEY_B64=$(kubectl get secret appview-secrets -n poltr \
      -o jsonpath='{.data.APPVIEW_PDS_CREDS_MASTER_KEY_B64}' | base64 -d)
  python3 insert_governance_cred.py
"""

import os
import sys

# Allow importing pds_creds from the appview source
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "services", "appview"))

from src.lib.pds_creds import encrypt_app_password

DID = "did:plc:3ch7iwf6od4szklpolupbv7o"
HANDLE = "admin.id.poltr.ch"
EMAIL = "governance@poltr.ch"  # placeholder — adjust if needed
PASSWORD = "U88+yGBFb4f9iDzl//RPBUj6dn6GZFfC"

ciphertext, nonce = encrypt_app_password(PASSWORD)

print("-- Encrypted governance account credentials")
print("-- Run this SQL against your PostgreSQL database:")
print()
print(f"INSERT INTO auth.auth_creds (did, handle, email, pds_url, app_pw_ciphertext, app_pw_nonce)")
print(f"VALUES (")
print(f"  '{DID}',")
print(f"  '{HANDLE}',")
print(f"  '{EMAIL}',")
print(f"  'https://pds2.poltr.info',")
print(f"  '\\x{ciphertext.hex()}',")
print(f"  '\\x{nonce.hex()}'")
print(f");")
