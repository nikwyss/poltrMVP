#!/usr/bin/env python3
"""
Create a governance/admin handle on the PDS.
Usage: python create_gov_handle.py <handle> <email>
Example: python create_gov_handle.py admin.id.poltr.ch admin@poltr.ch
"""
import os
import sys
import base64
import secrets
import string
import httpx

# Configuration - adjust these or set via environment
PDS_INTERNAL_URL = os.getenv("PDS_INTERNAL_URL", "http://pds.poltr.svc.cluster.local")
PDS_ADMIN_PASSWORD = os.getenv("PDS_ADMIN_PASSWORD")


def generate_password(length: int = 32) -> str:
    """Generate a secure random password."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def create_invite_code() -> str:
    """Create a single-use invite code using admin auth."""
    if not PDS_ADMIN_PASSWORD:
        raise ValueError("PDS_ADMIN_PASSWORD environment variable must be set")

    auth_string = f"admin:{PDS_ADMIN_PASSWORD}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    headers = {"Authorization": f"Basic {auth_bytes}"}

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.server.createInviteCode",
            headers=headers,
            json={"useCount": 1},
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Failed to create invite code: {resp.text}")

    return resp.json()["code"]


def create_account(handle: str, email: str, password: str, invite_code: str) -> dict:
    """Create an account on the PDS."""
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.server.createAccount",
            json={
                "handle": handle,
                "email": email,
                "password": password,
                "birthDate": "1970-01-01",
                "inviteCode": invite_code,
            },
        )

    if resp.status_code != 200:
        raise RuntimeError(f"Failed to create account: {resp.text}")

    return resp.json()


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <handle> <email>")
        print(f"Example: {sys.argv[0]} admin.id.poltr.ch admin@poltr.ch")
        sys.exit(1)

    handle = sys.argv[1]
    email = sys.argv[2]
    password = generate_password()

    print(f"Creating account: {handle}")
    print(f"Email: {email}")

    # Step 1: Create invite code
    print("Creating invite code...")
    invite_code = create_invite_code()
    print(f"Invite code: {invite_code}")

    # Step 2: Create account
    print("Creating account...")
    result = create_account(handle, email, password, invite_code)

    print("\n" + "=" * 50)
    print("Account created successfully!")
    print("=" * 50)
    print(f"Handle: {handle}")
    print(f"DID: {result['did']}")
    print(f"Email: {email}")
    print(f"Password: {password}")
    print("=" * 50)
    print("\nSave this password securely - it cannot be recovered!")


if __name__ == "__main__":
    main()
