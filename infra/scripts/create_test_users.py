#!/usr/bin/env python3
"""
Bulk-create test users on the PDS + AppView DB.

Mirrors the AppView registration flow (services/appview/src/auth/register.py +
provisioning.py) but as a standalone batch script. Used to inflate the
test-user pool so that demokratiefabrik peer-review imports don't collapse
many reviewers onto the same PDS account via hash collisions.

For each user:
  1. createInviteCode + createAccount on the PDS (admin Basic auth)
  2. Write app.bsky.actor.profile record
  3. Encrypt app password (NaCl SecretBox) + INSERT into auth.auth_creds
  4. Draw a random mountain template + INSERT into public.app_profiles

Prerequisites:
  - PDS port-forward:        kubectl port-forward -n poltr svc/pds 2583:80
  - PostgreSQL port-forward: kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

Environment variables:
  PDS_HOST            PDS endpoint (default: http://localhost:2583)
  PDS_ADMIN_PASSWORD  PDS admin password (Basic auth)
  PDS_PUBLIC_HANDLE   Handle domain (default: id.poltr.ch)
  DB_URL              appview DB connection URL
  MASTER_KEY_B64      APPVIEW_PDS_CREDS_MASTER_KEY_B64 (NaCl encryption key)
  N                   Number of users to create (default: 1)
  EMAIL_DOMAIN        Email domain for generated test addresses (default: test.poltr.ch)
"""

import base64
import os
import random
import secrets
import string
import sys
import time

import psycopg2
import requests
from nacl import secret as nacl_secret
from nacl import utils as nacl_utils


PDS_HOST = os.getenv("PDS_HOST", "http://localhost:2583")
PDS_ADMIN_PASSWORD = os.getenv("PDS_ADMIN_PASSWORD", "")
PDS_PUBLIC_HANDLE = os.getenv("PDS_PUBLIC_HANDLE", "id.poltr.ch")
DB_URL = os.getenv("DB_URL", "")
MASTER_KEY_B64 = os.getenv("MASTER_KEY_B64", "")
N = int(os.getenv("N", "1"))
EMAIL_DOMAIN = os.getenv("EMAIL_DOMAIN", "test.poltr.ch")


def _require(name: str, value: str):
    if not value:
        print(f"ERROR: {name} is required")
        sys.exit(1)


def _gen_handle() -> str:
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"user{suffix}.{PDS_PUBLIC_HANDLE}"


def _gen_password() -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(32))


def _gen_color() -> str:
    while True:
        r, g, b = random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)
        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        if 30 < luma < 180:
            return "#%02x%02x%02x" % (r, g, b)


def _basic_auth_header() -> dict:
    auth = base64.b64encode(f"admin:{PDS_ADMIN_PASSWORD}".encode()).decode()
    return {"Authorization": f"Basic {auth}"}


def create_invite_code() -> str:
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.server.createInviteCode",
        headers=_basic_auth_header(),
        json={"useCount": 1},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()["code"]


def create_pds_account(handle: str, password: str, email: str, invite_code: str) -> dict:
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.server.createAccount",
        json={
            "handle": handle,
            "email": email,
            "password": password,
            "birthDate": "1970-01-01",
            "inviteCode": invite_code,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"createAccount failed ({resp.status_code}): {resp.text}")
    return resp.json()


def put_profile(access_jwt: str, did: str, display_name: str, bio: str):
    resp = requests.post(
        f"{PDS_HOST}/xrpc/com.atproto.repo.putRecord",
        headers={
            "Authorization": f"Bearer {access_jwt}",
            "Content-Type": "application/json",
        },
        json={
            "repo": did,
            "collection": "app.bsky.actor.profile",
            "rkey": "self",
            "record": {
                "$type": "app.bsky.actor.profile",
                "displayName": display_name,
                "description": bio,
            },
        },
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"putRecord profile failed ({resp.status_code}): {resp.text}")


def pick_mountain_template(conn) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, name, fullname, canton, height "
            "FROM auth.mountain_templates ORDER BY random() LIMIT 1"
        )
        row = cur.fetchone()
    if not row:
        raise RuntimeError("No rows in auth.mountain_templates")
    tid, name, fullname, canton, height = row
    return {
        "templateId": tid,
        "name": name,
        "fullname": fullname or name,
        "canton": canton,
        "height": float(height),
    }


def encrypt_password(plaintext: str, key: bytes) -> tuple[bytes, bytes]:
    box = nacl_secret.SecretBox(key)
    nonce = nacl_utils.random(nacl_secret.SecretBox.NONCE_SIZE)
    ct = box.encrypt(plaintext.encode("utf-8"), nonce).ciphertext
    return ct, nonce


def store_user(conn, did: str, handle: str, email: str, pw_ct: bytes, pw_nonce: bytes,
               template: dict, display_name: str, color: str):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO auth.auth_creds
                (did, handle, email, pds_url, app_pw_ciphertext, app_pw_nonce, pseudonym_template_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            (did, handle, email, PDS_HOST, pw_ct, pw_nonce, template["templateId"]),
        )
        cur.execute(
            """
            INSERT INTO app_profiles
                (did, display_name, mountain_name, mountain_fullname, canton, height, color, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (did) DO NOTHING
            """,
            (did, display_name, template["name"], template["fullname"],
             template["canton"], template["height"], color),
        )
    conn.commit()


def create_one(conn, key: bytes, idx: int):
    handle = _gen_handle()
    password = _gen_password()
    email = f"testuser{int(time.time())}-{idx}@{EMAIL_DOMAIN}"

    template = pick_mountain_template(conn)
    letter = random.choice(string.ascii_uppercase)
    display_name = f"{letter}. {template['name']}"
    color = _gen_color()
    bio = f"{display_name} — Testbenutzer"

    invite_code = create_invite_code()
    account = create_pds_account(handle, password, email, invite_code)
    did = account["did"]
    access_jwt = account["accessJwt"]

    put_profile(access_jwt, did, display_name, bio)

    pw_ct, pw_nonce = encrypt_password(password, key)
    store_user(conn, did, handle, email, pw_ct, pw_nonce, template, display_name, color)

    return did, handle


def main():
    _require("PDS_ADMIN_PASSWORD", PDS_ADMIN_PASSWORD)
    _require("DB_URL", DB_URL)
    _require("MASTER_KEY_B64", MASTER_KEY_B64)
    if N < 1:
        print("ERROR: N must be >= 1")
        sys.exit(1)

    key = base64.b64decode(MASTER_KEY_B64)
    if len(key) != nacl_secret.SecretBox.KEY_SIZE:
        print(f"ERROR: master key must be {nacl_secret.SecretBox.KEY_SIZE} bytes")
        sys.exit(1)

    print(f"PDS:    {PDS_HOST}")
    print(f"Domain: {PDS_PUBLIC_HANDLE}")
    print(f"N:      {N} test user(s)")
    print()

    conn = psycopg2.connect(DB_URL)
    created = 0
    failed = 0
    try:
        for i in range(N):
            try:
                did, handle = create_one(conn, key, i)
                print(f"  [{i+1:>3}/{N}] {handle}  {did}")
                created += 1
            except Exception as err:
                print(f"  [{i+1:>3}/{N}] FAILED: {err}")
                failed += 1
    finally:
        conn.close()

    print()
    print(f"Created: {created}, Failed: {failed}")


if __name__ == "__main__":
    main()
