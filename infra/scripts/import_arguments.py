#!/usr/bin/env python3
"""
Import PRO/CONTRA arguments from the Demokratiefabrik content.xlsx dump
into AT Protocol as app.ch.poltr.ballot.argument records.

Arguments are assigned to random non-admin PDS users to simulate real
platform behaviour.  Authenticates using stored app passwords from the
auth.auth_creds table (same as the indexer) so credentials stay intact.

Environment variables:
  PDS_HOST                          PDS endpoint (default: http://localhost:2583)
  PDS_ADMIN_PASSWORD                PDS admin password (Basic auth, for user discovery)
  BALLOT_URI                        AT URI of the ballot to attach arguments to
  MAX_IMPORTS                       Number of arguments to import (default: 1, 0 = all)
  XLSX_PATH                         Path to content.xlsx (default: dump/content.xlsx)
  ADMIN_HANDLE                      Handle to exclude (default: admin.id.poltr.ch)
  INDEXER_POSTGRES_URL              Postgres connection string (reads auth.auth_creds)
  APPVIEW_PDS_CREDS_MASTER_KEY_B64  Base64-encoded NaCl secret key for app password decryption
"""

import base64
import os
import random
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import nacl.secret
import nacl.utils
import openpyxl
import psycopg2
import requests


@dataclass
class Argument:
    id: int
    title: str
    body: str
    type: str  # PRO or CONTRA
    date_created: Optional[str]


@dataclass
class PdsUser:
    did: str
    handle: str
    access_token: Optional[str] = None


class ArgumentImporter:
    def __init__(self, pds_host: str, pds_admin_password: str, ballot_uri: str,
                 admin_handle: str, db_url: str, master_key_b64: str):
        self.pds_host = pds_host
        self.pds_admin_password = pds_admin_password
        self.ballot_uri = ballot_uri
        self.admin_handle = admin_handle
        self.db_url = db_url
        self.master_key = base64.b64decode(master_key_b64)
        self.users: list[PdsUser] = []
        self.all_users: list[PdsUser] = []  # includes admin, for scanning existing records
        self.existing_rkey_to_did: dict[str, str] = {}  # rkey -> did of existing arguments
        self._app_passwords: dict[str, str] = {}  # did -> decrypted app password

    def _admin_auth_header(self) -> str:
        token = base64.b64encode(f"admin:{self.pds_admin_password}".encode()).decode()
        return f"Basic {token}"

    def _load_app_passwords(self):
        """Load and decrypt app passwords from auth.auth_creds."""
        print("Loading stored app passwords from DB...")
        conn = psycopg2.connect(self.db_url)
        try:
            cur = conn.cursor()
            cur.execute("SELECT did, app_pw_ciphertext, app_pw_nonce FROM auth.auth_creds")
            box = nacl.secret.SecretBox(self.master_key)
            for did, ciphertext, nonce in cur.fetchall():
                try:
                    plaintext = box.decrypt(bytes(ciphertext), bytes(nonce))
                    self._app_passwords[did] = plaintext.decode()
                except Exception as e:
                    print(f"  WARNING: Failed to decrypt app password for {did}: {e}")
            print(f"  Loaded {len(self._app_passwords)} app password(s)")
        finally:
            conn.close()

    def discover_users(self) -> bool:
        """List all repos on PDS, resolve handles, exclude admin."""
        print("Discovering PDS users...")

        # List all repos
        repos_url = f"{self.pds_host}/xrpc/com.atproto.sync.listRepos?limit=1000"
        try:
            resp = requests.get(repos_url)
            resp.raise_for_status()
            repos = resp.json().get("repos", [])
        except Exception as e:
            print(f"ERROR: Failed to list repos - {e}")
            return False

        # Resolve handles and filter
        for repo in repos:
            did = repo["did"]
            try:
                desc = requests.get(f"{self.pds_host}/xrpc/com.atproto.repo.describeRepo?repo={did}")
                desc.raise_for_status()
                handle = desc.json().get("handle", "")
            except Exception:
                handle = did

            user = PdsUser(did=did, handle=handle)
            self.all_users.append(user)

            if handle == self.admin_handle:
                print(f"  Skipping admin: {handle}")
                continue

            self.users.append(user)
            print(f"  Found user: {handle} ({did})")

        if not self.users:
            print("ERROR: No non-admin users found on PDS")
            return False

        print(f"  {len(self.users)} users available for argument assignment")
        return True

    def scan_existing_arguments(self):
        """Scan all user repos for existing app.ch.poltr.ballot.argument records.
        Builds a rkey->did mapping so re-imports reuse the same account."""
        print("Scanning PDS for existing argument records...")
        collection = "app.ch.poltr.ballot.argument"

        for user in self.all_users:
            cursor = None
            while True:
                url = (
                    f"{self.pds_host}/xrpc/com.atproto.repo.listRecords"
                    f"?repo={user.did}&collection={collection}&limit=100"
                )
                if cursor:
                    url += f"&cursor={cursor}"
                try:
                    resp = requests.get(url)
                    if resp.status_code != 200:
                        break
                    data = resp.json()
                    records = data.get("records", [])
                    for rec in records:
                        rkey = rec.get("uri", "").split("/")[-1]
                        if rkey:
                            self.existing_rkey_to_did[rkey] = user.did
                    cursor = data.get("cursor")
                    if not cursor or not records:
                        break
                except Exception:
                    break

        if self.existing_rkey_to_did:
            print(f"  Found {len(self.existing_rkey_to_did)} existing argument(s) on PDS")
            for rkey, did in self.existing_rkey_to_did.items():
                handle = next((u.handle for u in self.all_users if u.did == did), did)
                print(f"    rkey={rkey} -> {handle}")
        else:
            print("  No existing arguments found on PDS")

    def _get_user_by_did(self, did: str) -> Optional[PdsUser]:
        """Find a user by DID from all_users."""
        return next((u for u in self.all_users if u.did == did), None)

    def authenticate_user(self, user: PdsUser) -> bool:
        """Create session using stored app password from auth.auth_creds."""
        if user.access_token:
            return True

        password = self._app_passwords.get(user.did)
        if not password:
            print(f"  ERROR: No stored app password for {user.handle}")
            return False

        try:
            resp = requests.post(
                f"{self.pds_host}/xrpc/com.atproto.server.createSession",
                json={"identifier": user.did, "password": password},
            )
            resp.raise_for_status()
            data = resp.json()
            user.access_token = data.get("accessJwt")
            return bool(user.access_token)
        except Exception as e:
            print(f"  ERROR: Failed to create session for {user.handle} - {e}")
            return False

    def create_argument(self, arg: Argument, user: PdsUser) -> bool:
        """Create or update an argument record on the PDS as the given user."""
        rkey = str(arg.id)

        record = {
            "$type": "app.ch.poltr.ballot.argument",
            "title": arg.title.strip(),
            "body": arg.body.strip(),
            "type": arg.type,
            "ballot": self.ballot_uri,
            "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")[:-4] + "Z",
        }

        url = f"{self.pds_host}/xrpc/com.atproto.repo.putRecord"
        headers = {
            "Authorization": f"Bearer {user.access_token}",
            "Content-Type": "application/json",
        }
        payload = {
            "repo": user.did,
            "collection": "app.ch.poltr.ballot.argument",
            "rkey": rkey,
            "record": record,
        }

        try:
            time.sleep(0.05)
            response = requests.post(url, headers=headers, json=payload)

            if response.status_code in (200, 201):
                data = response.json()
                if "uri" in data:
                    print(f"  Synced [{arg.type:6s}] by {user.handle}: {arg.title[:40]} -> {data['uri']}")
                    return True

            try:
                error_data = response.json()
                error_msg = error_data.get("message") or error_data.get("error") or f"HTTP {response.status_code}"
                print(f"  Failed ({response.status_code}): {error_msg}")
            except Exception:
                print(f"  Failed ({response.status_code}): {response.text[:200]}")

            return False

        except requests.exceptions.RequestException as e:
            print(f"  Failed: {e}")
            return False

    def import_from_xlsx(self, xlsx_path: str, max_imports: int = 1):
        """Read PRO/CONTRA arguments from xlsx and import them as random users."""
        print(f"Reading arguments from: {xlsx_path}")

        wb = openpyxl.load_workbook(xlsx_path, read_only=True)
        ws = wb[wb.sheetnames[0]]

        headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
        arguments = []

        for row in ws.iter_rows(min_row=2, values_only=True):
            d = dict(zip(headers, row))
            if d.get("type") not in ("PRO", "CONTRA"):
                continue
            if d.get("deleted") == 1 or d.get("disabled") == 1:
                continue

            title = (d.get("title") or "").strip()
            body = (d.get("text") or "").strip()
            if not title or not body:
                continue

            arguments.append(Argument(
                id=d.get("id"),
                title=title,
                body=body,
                type=d.get("type"),
                date_created=str(d.get("date_created", "")),
            ))

        wb.close()
        print(f"Found {len(arguments)} valid arguments (PRO + CONTRA)")

        created = 0
        failed = 0
        limit = max_imports if max_imports > 0 else len(arguments)

        for arg in arguments[:limit]:
            rkey = str(arg.id)
            existing_did = self.existing_rkey_to_did.get(rkey)

            if existing_did:
                user = self._get_user_by_did(existing_did)
                if not user:
                    print(f"  WARNING: existing DID {existing_did} for rkey={rkey} not found in users, picking random")
                    user = random.choice(self.users)
                else:
                    print(f"  Reusing existing account {user.handle} for rkey={rkey}")
            else:
                user = random.choice(self.users)

            if not self.authenticate_user(user):
                failed += 1
                continue

            if self.create_argument(arg, user):
                created += 1
            else:
                failed += 1

        print()
        print("=" * 42)
        print(f"Imported: {created}, Failed: {failed}")
        print("=" * 42)


def main():
    pds_host = os.getenv("PDS_HOST", "http://localhost:2583")
    pds_admin_password = os.getenv("PDS_ADMIN_PASSWORD", "")
    ballot_uri = os.getenv("BALLOT_URI", "")
    max_imports = int(os.getenv("MAX_IMPORTS", "1"))
    xlsx_path = os.getenv("XLSX_PATH", "dump/content.xlsx")
    admin_handle = os.getenv("ADMIN_HANDLE", "admin.id.poltr.ch")
    db_url = os.getenv("INDEXER_POSTGRES_URL", "")
    master_key_b64 = os.getenv("APPVIEW_PDS_CREDS_MASTER_KEY_B64", "")

    if not pds_admin_password:
        print("ERROR: PDS_ADMIN_PASSWORD required")
        sys.exit(1)

    if not ballot_uri:
        print("ERROR: BALLOT_URI required (AT URI of the ballot to attach arguments to)")
        print("  e.g. BALLOT_URI='at://did:plc:.../app.ch.poltr.ballot.entry/663'")
        sys.exit(1)

    if not db_url or not master_key_b64:
        print("ERROR: INDEXER_POSTGRES_URL and APPVIEW_PDS_CREDS_MASTER_KEY_B64 required")
        print("  (used to read stored app passwords from auth.auth_creds)")
        sys.exit(1)

    print("=== AT Protocol Argument Import ===")
    print(f"PDS Host:    {pds_host}")
    print(f"Ballot URI:  {ballot_uri}")
    print(f"Max imports: {max_imports if max_imports > 0 else 'all'}")
    print(f"XLSX path:   {xlsx_path}")
    print()

    importer = ArgumentImporter(pds_host, pds_admin_password, ballot_uri,
                                admin_handle, db_url, master_key_b64)

    if not importer.discover_users():
        sys.exit(1)

    importer._load_app_passwords()
    importer.scan_existing_arguments()

    print()
    importer.import_from_xlsx(xlsx_path, max_imports=max_imports)


if __name__ == "__main__":
    main()
