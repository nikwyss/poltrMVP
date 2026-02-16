#!/usr/bin/env python3
"""
PDS Hard Reset Script
=====================
Generates a new PDS server DID (did:plc) and registers it at plc.directory,
giving the PDS a clean relay reputation. Also prints the K8s reset checklist
and DB cleanup SQL.

Mode 1 (default):  python pds_reset.py
  → Generate new secp256k1 key, derive did:plc, register at plc.directory
  → Print new secret values, K8s checklist, DB cleanup SQL

Mode 2 (verify):   python pds_reset.py --verify
  → Post-reset verification: health check, relay status, test account creation
  → Confirms the new PDS is NOT throttled by the relay

Dependencies: pip install coincurve dag-cbor multiformats httpx
"""

import argparse
import base64
import hashlib
import json
import os
import random
import secrets
import signal
import string
import sys
import time

import coincurve
import dag_cbor
import httpx
from multiformats import multibase

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PDS_INTERNAL_URL = os.getenv("PDS_INTERNAL_URL", "http://localhost:2583")
PDS_ADMIN_PASSWORD = os.getenv("PDS_ADMIN_PASSWORD")
PDS_HOSTNAME = os.getenv("PDS_HOSTNAME", "pds2.poltr.info")
PLC_DIRECTORY_URL = os.getenv("PLC_DIRECTORY_URL", "https://plc.directory")
RELAY_URL = os.getenv("BSKY_RELAY_URL", "https://bsky.network")
BSKY_PUBLIC_API = os.getenv("BSKY_PUBLIC_API", "https://public.api.bsky.app")
PDS_PUBLIC_HANDLE_DOMAIN = os.getenv("PDS_PUBLIC_HANDLE", "id.poltr.ch")

# State for cleanup
_test_did: str | None = None

# ---------------------------------------------------------------------------
# Colors (reused from test_registration.py)
# ---------------------------------------------------------------------------

class C:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


def _pass(msg: str):
    print(f"  {C.GREEN}PASS{C.RESET} {msg}")


def _fail(msg: str):
    print(f"  {C.RED}FAIL{C.RESET} {msg}")


def _warn(msg: str):
    print(f"  {C.YELLOW}WARN{C.RESET} {msg}")


def _info(msg: str):
    print(f"  {C.DIM}{msg}{C.RESET}")


def _step(num: str, title: str):
    print(f"\n{C.BOLD}{C.CYAN}[Step {num}]{C.RESET} {C.BOLD}{title}{C.RESET}")


# ---------------------------------------------------------------------------
# Admin auth helper
# ---------------------------------------------------------------------------

def admin_headers() -> dict:
    auth_string = f"admin:{PDS_ADMIN_PASSWORD}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    return {"Authorization": f"Basic {auth_bytes}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Cleanup helper for --verify mode
# ---------------------------------------------------------------------------

def cleanup_account(did: str | None = None):
    """Delete a test account from PDS."""
    if not did:
        return
    print(f"\n{C.BOLD}Cleaning up test account {did}...{C.RESET}")
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{PDS_INTERNAL_URL}/xrpc/com.atproto.admin.deleteAccount",
                headers=admin_headers(),
                json={"did": did},
            )
        if resp.status_code == 200:
            _pass(f"Account {did} deleted")
        else:
            _fail(f"Delete failed: {resp.status_code} {resp.text}")
    except Exception as e:
        _fail(f"Delete error: {e}")


def _signal_handler(sig, frame):
    print(f"\n\n{C.YELLOW}Interrupted.{C.RESET}")
    cleanup_account(_test_did)
    sys.exit(1)


# ===========================================================================
# MODE 1: Generate new PDS identity
# ===========================================================================

def derive_did_key(pubkey_compressed: bytes) -> str:
    """Derive did:key from a compressed secp256k1 public key."""
    # multicodec prefix for secp256k1-pub: 0xe7 (varint: 0xe7, 0x01)
    mc_prefix = bytes([0xe7, 0x01])
    encoded = multibase.encode(mc_prefix + pubkey_compressed, "base58btc")
    # multibase returns 'z...' for base58btc, did:key format is 'did:key:z...'
    return f"did:key:{encoded}"


def build_plc_operation(did_key: str) -> dict:
    """Build an unsigned PLC genesis operation."""
    return {
        "type": "plc_operation",
        "rotationKeys": [did_key],
        "verificationMethods": {"atproto": did_key},
        "alsoKnownAs": [f"at://{PDS_HOSTNAME}"],
        "services": {
            "atproto_pds": {
                "type": "AtprotoPersonalDataServer",
                "endpoint": f"https://{PDS_HOSTNAME}",
            }
        },
        "prev": None,
    }


def sign_plc_operation(op: dict, privkey: coincurve.PrivateKey) -> dict:
    """Sign a PLC operation (DAG-CBOR encode → SHA-256 → secp256k1 recoverable sig)."""
    encoded = dag_cbor.encode(op)
    digest = hashlib.sha256(encoded).digest()
    # sign_recoverable returns 65 bytes: 64-byte sig + 1-byte recovery id
    sig_full = privkey.sign_recoverable(digest, hasher=None)
    sig_64 = sig_full[:64]
    sig_b64url = base64.urlsafe_b64encode(sig_64).rstrip(b"=").decode()
    signed_op = dict(op)
    signed_op["sig"] = sig_b64url
    return signed_op


def compute_did_plc(signed_op: dict) -> str:
    """Compute did:plc from the signed operation (SHA-256 of DAG-CBOR → base32 → first 24)."""
    encoded = dag_cbor.encode(signed_op)
    h = hashlib.sha256(encoded).digest()
    suffix = base64.b32encode(h).decode().lower().rstrip("=")[:24]
    return f"did:plc:{suffix}"


def mode_generate():
    """Mode 1: Generate new PDS identity and register at plc.directory."""
    print(f"\n{C.BOLD}{'=' * 60}{C.RESET}")
    print(f"{C.BOLD} PDS Hard Reset — Generate New Identity{C.RESET}")
    print(f"{C.BOLD}{'=' * 60}{C.RESET}")
    print(f"  PDS hostname: {PDS_HOSTNAME}")
    print(f"  PLC directory: {PLC_DIRECTORY_URL}")
    print()

    # Step 1: Generate secp256k1 key
    _step("1", "Generate secp256k1 key pair")
    privkey_bytes = secrets.token_bytes(32)
    privkey = coincurve.PrivateKey(privkey_bytes)
    pubkey = privkey.public_key.format(compressed=True)
    privkey_hex = privkey_bytes.hex()
    _pass(f"Private key: {privkey_hex[:8]}...{privkey_hex[-8:]}")
    _pass(f"Public key (compressed): {pubkey.hex()[:16]}...")

    # Step 2: Derive did:key
    _step("2", "Derive did:key")
    did_key = derive_did_key(pubkey)
    _pass(f"did:key: {did_key}")

    # Step 3: Build PLC genesis operation
    _step("3", "Build PLC genesis operation")
    op = build_plc_operation(did_key)
    _pass("Operation built:")
    _info(f"  rotationKeys: {op['rotationKeys']}")
    _info(f"  services.atproto_pds.endpoint: {op['services']['atproto_pds']['endpoint']}")
    _info(f"  alsoKnownAs: {op['alsoKnownAs']}")

    # Step 4: Sign operation
    _step("4", "Sign operation (DAG-CBOR + SHA-256 + secp256k1)")
    signed_op = sign_plc_operation(op, privkey)
    _pass(f"Signature: {signed_op['sig'][:32]}...")

    # Step 5: Compute did:plc
    _step("5", "Compute did:plc")
    did = compute_did_plc(signed_op)
    _pass(f"DID: {did}")

    # Step 6: Confirm + submit to plc.directory
    _step("6", "Submit to plc.directory")
    print(f"\n  {C.YELLOW}About to register {did} at {PLC_DIRECTORY_URL}{C.RESET}")
    print(f"  {C.YELLOW}This is IRREVERSIBLE — the DID will be permanently registered.{C.RESET}")
    confirm = input(f"  {C.BOLD}Proceed? [y/N]: {C.RESET}").strip().lower()
    if confirm not in ("y", "yes"):
        print(f"\n  {C.YELLOW}Aborted.{C.RESET}")
        print(f"\n  To register manually later, POST to: {PLC_DIRECTORY_URL}/{did}")
        print(f"  Signed operation (JSON):")
        print(f"  {json.dumps(signed_op, indent=2)}")
        _print_new_values(privkey_hex, did)
        return

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{PLC_DIRECTORY_URL}/{did}",
            json=signed_op,
        )

    if resp.status_code in (200, 201, 204):
        _pass(f"PLC registration successful!")
    elif resp.status_code == 409:
        # Conflict — DID already exists. This shouldn't happen with fresh keys.
        _fail(f"PLC returned 409 Conflict: {resp.text}")
        _warn("DID already exists at plc.directory. This should not happen with a fresh key.")
        return
    else:
        _fail(f"PLC registration failed: {resp.status_code} {resp.text}")
        # The PLC directory may return the correct DID if ours differs
        _warn("If the error includes a different DID, use that one instead.")
        _info(f"Our computed DID: {did}")
        _info(f"Signed operation:\n  {json.dumps(signed_op, indent=2)}")
        return

    # Step 7: Verify PLC registration
    _step("7", "Verify PLC registration")
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(f"{PLC_DIRECTORY_URL}/{did}")

    if resp.status_code == 200:
        doc = resp.json()
        services = doc.get("service", [])
        pds_endpoint = None
        for svc in services:
            if svc.get("id") == "#atproto_pds":
                pds_endpoint = svc.get("serviceEndpoint")
        _pass(f"DID resolves at plc.directory")
        _info(f"  PDS endpoint: {pds_endpoint}")
    else:
        _fail(f"DID verification failed: {resp.status_code} {resp.text}")
        return

    # Step 8-10: Print new values, checklist, SQL
    _print_new_values(privkey_hex, did)
    _print_k8s_checklist(did)
    _print_db_cleanup_sql()


def _print_new_values(privkey_hex: str, did: str):
    """Step 8: Print new secret values."""
    _step("8", "New secret values")
    print(f"\n  {C.BOLD}Update these in pds-secrets:{C.RESET}")
    print(f"  {C.GREEN}PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX{C.RESET}: \"{privkey_hex}\"")
    print(f"  {C.GREEN}PDS_SERVER_DID{C.RESET}: \"{did}\"")
    print()
    print(f"  {C.DIM}(Copy these values — they are not stored anywhere else){C.RESET}")


def _print_k8s_checklist(did: str):
    """Step 9: Print K8s reset checklist."""
    _step("9", "K8s reset checklist")
    print(f"""
  Execute these steps in order:

  {C.BOLD}1.{C.RESET} kubectl scale deployment/pds -n poltr --replicas=0
  {C.BOLD}2.{C.RESET} kubectl scale deployment/indexer -n poltr --replicas=0
  {C.BOLD}3.{C.RESET} kubectl delete pvc pds-data -n poltr
  {C.BOLD}4.{C.RESET} kubectl apply -f infra/kube/poltr.yaml          # recreates PVC
  {C.BOLD}5.{C.RESET} Update pds-secrets with new PDS_SERVER_DID + rotation key
     kubectl edit secret pds-secrets -n poltr
     # or: kubectl apply -f infra/kube/secrets.yaml
  {C.BOLD}6.{C.RESET} kubectl scale deployment/pds -n poltr --replicas=1
  {C.BOLD}7.{C.RESET} kubectl rollout status deployment/pds -n poltr
  {C.BOLD}8.{C.RESET} Verify PDS reports new DID:
     curl https://{PDS_HOSTNAME}/xrpc/com.atproto.server.describeServer | jq .did
     # Expected: "{did}"
  {C.BOLD}9.{C.RESET} kubectl scale deployment/indexer -n poltr --replicas=1
  {C.BOLD}10.{C.RESET} Run verification:
     PDS_ADMIN_PASSWORD=<pw> python pds_reset.py --verify""")


def _print_db_cleanup_sql():
    """Step 10: Print DB cleanup SQL."""
    _step("10", "DB cleanup SQL")
    print(f"""
  Run this against the appview database:

  {C.YELLOW}-- Clear all user sessions and credentials (accounts are on PDS, now wiped)
  DELETE FROM auth.auth_sessions;
  DELETE FROM auth.auth_creds;
  DELETE FROM auth.auth_pending_logins;
  DELETE FROM auth.auth_pending_registrations;

  -- Clear app data tied to old DIDs
  DELETE FROM app_profiles;
  DELETE FROM app_likes;

  -- Reset indexer cursors (indexer must re-sync from new PDS)
  DELETE FROM indexer_cursors;

  -- Keep: auth.mountain_templates (static data)
  -- Keep: app_ballots (governance content, update DID after re-creating governance account)

  -- After re-creating the governance account:
  --   UPDATE app_ballots SET did = '<new_governance_did>';{C.RESET}
""")
    print(f"  {C.DIM}Post-reset: recreate governance account:{C.RESET}")
    print(f"  {C.DIM}  PDS_ADMIN_PASSWORD=<pw> python create_gov_handle.py admin.id.poltr.ch admin@poltr.ch{C.RESET}")
    print(f"  {C.DIM}  Then update PDS_GOVERNANCE_ACCOUNT_DID in pds-secrets with the new DID.{C.RESET}")


# ===========================================================================
# MODE 2: Post-reset verification (--verify)
# ===========================================================================

def mode_verify():
    """Mode 2: Post-reset verification — confirms PDS is healthy and NOT throttled."""
    signal.signal(signal.SIGINT, _signal_handler)
    global _test_did

    print(f"\n{C.BOLD}{'=' * 60}{C.RESET}")
    print(f"{C.BOLD} PDS Hard Reset — Post-Reset Verification{C.RESET}")
    print(f"{C.BOLD}{'=' * 60}{C.RESET}")
    print(f"  PDS:   {PDS_INTERNAL_URL}")
    print(f"  Relay: {RELAY_URL}")
    print(f"  PLC:   {PLC_DIRECTORY_URL}")
    print(f"  Bsky:  {BSKY_PUBLIC_API}")
    print()

    if not PDS_ADMIN_PASSWORD:
        _fail("PDS_ADMIN_PASSWORD not set")
        sys.exit(1)

    success = True

    with httpx.Client(timeout=30.0) as client:

        # Step 1: PDS health check
        pds_did = verify_step1_health(client)
        if not pds_did:
            sys.exit(1)

        # Step 2: describeServer — returns new DID
        pds_did = verify_step2_describe_server(client)
        if not pds_did:
            sys.exit(1)

        # Step 3: PLC resolution
        if not verify_step3_plc_resolution(client, pds_did):
            success = False

        # Step 4: requestCrawl
        verify_step4_request_crawl(client)

        # Step 5: Create test account
        account = verify_step5_create_test_account(client)
        if not account:
            _fail("Cannot continue without test account")
            sys.exit(1)
        _test_did = account["did"]

        # Step 6: Write profile
        commit_rev = verify_step6_write_profile(client, account)
        if not commit_rev:
            success = False

        # Step 7: Check relay — THE CRITICAL CHECK
        relay_ok = verify_step7_check_relay(client, account["did"])
        if not relay_ok:
            success = False

        # Step 8: Wait for relay to index
        if relay_ok:
            verify_step8_wait_relay_index(client, account["did"], commit_rev)

        # Step 9: Toggle handle
        verify_step9_toggle_handle(client, account["did"], account["handle"])

        # Step 10: Check Bluesky AppView
        verify_step10_check_bsky_appview(client, account["did"])

        # Step 11: Cleanup
        verify_step11_cleanup(account["did"])

    # Final verdict
    print(f"\n{'=' * 60}")
    if success:
        print(f"{C.BOLD}{C.GREEN}SUCCESS: PDS reset verified — relay is NOT throttling!{C.RESET}")
    else:
        print(f"{C.BOLD}{C.RED}ISSUES DETECTED: Check output above for details.{C.RESET}")
    print(f"{'=' * 60}\n")

    return 0 if success else 1


def verify_step1_health(client: httpx.Client) -> str | None:
    """Step 1: PDS health check."""
    _step("1", "PDS health check")
    try:
        resp = client.get(f"{PDS_INTERNAL_URL}/xrpc/_health")
        if resp.status_code == 200:
            _pass(f"PDS healthy at {PDS_INTERNAL_URL}")
            return "ok"
        else:
            _fail(f"PDS health check failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        _fail(f"PDS unreachable: {e}")
        return None


def verify_step2_describe_server(client: httpx.Client) -> str | None:
    """Step 2: describeServer — returns the PDS server DID."""
    _step("2", "describeServer")
    try:
        resp = client.get(f"{PDS_INTERNAL_URL}/xrpc/com.atproto.server.describeServer")
        if resp.status_code == 200:
            data = resp.json()
            pds_did = data.get("did", "?")
            _pass(f"PDS server DID: {pds_did}")
            return pds_did
        else:
            _fail(f"describeServer failed: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        _fail(f"describeServer error: {e}")
        return None


def verify_step3_plc_resolution(client: httpx.Client, pds_did: str) -> bool:
    """Step 3: Check PLC resolves the PDS DID to the PDS hostname."""
    _step("3", "PLC resolution")
    try:
        resp = client.get(f"{PLC_DIRECTORY_URL}/{pds_did}")
        if resp.status_code == 200:
            doc = resp.json()
            services = doc.get("service", [])
            pds_endpoint = None
            for svc in services:
                if svc.get("id") == "#atproto_pds":
                    pds_endpoint = svc.get("serviceEndpoint")
            if pds_endpoint and PDS_HOSTNAME in pds_endpoint:
                _pass(f"PLC resolves to {pds_endpoint}")
                return True
            else:
                _fail(f"PLC endpoint mismatch: {pds_endpoint} (expected {PDS_HOSTNAME})")
                return False
        else:
            _fail(f"PLC resolution failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        _fail(f"PLC resolution error: {e}")
        return False


def verify_step4_request_crawl(client: httpx.Client) -> bool:
    """Step 4: POST requestCrawl to relay."""
    _step("4", "requestCrawl")
    try:
        resp = client.post(
            f"{RELAY_URL}/xrpc/com.atproto.sync.requestCrawl",
            json={"hostname": PDS_HOSTNAME},
        )
        if resp.status_code == 200:
            _pass(f"requestCrawl accepted for {PDS_HOSTNAME}")
            return True
        else:
            _fail(f"requestCrawl failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        _fail(f"requestCrawl error: {e}")
        return False


def verify_step5_create_test_account(client: httpx.Client) -> dict | None:
    """Step 5: Create a test account."""
    _step("5", "Create test account")

    name = "rst" + "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
    handle = f"{name}.{PDS_PUBLIC_HANDLE_DOMAIN}"
    password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(32))
    email = f"{name}@test.poltr.ch"

    _info(f"Handle: {handle}")
    _info(f"Email:  {email}")

    # Create invite code
    try:
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.server.createInviteCode",
            headers=admin_headers(),
            json={"useCount": 1},
        )
        if resp.status_code != 200:
            _fail(f"createInviteCode failed: {resp.status_code} {resp.text}")
            return None
        invite_code = resp.json()["code"]
        _pass(f"Invite code: {invite_code}")
    except Exception as e:
        _fail(f"createInviteCode error: {e}")
        return None

    # Create account
    try:
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
            _fail(f"createAccount failed: {resp.status_code} {resp.text}")
            return None
        data = resp.json()
        _pass(f"Account created: DID={data['did']}")
        return {
            "did": data["did"],
            "handle": handle,
            "accessJwt": data["accessJwt"],
            "password": password,
            "email": email,
        }
    except Exception as e:
        _fail(f"createAccount error: {e}")
        return None


def verify_step6_write_profile(client: httpx.Client, account: dict) -> str | None:
    """Step 6: Write app.bsky.actor.profile/self."""
    _step("6", "Write profile record")
    try:
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.repo.putRecord",
            headers={
                "Authorization": f"Bearer {account['accessJwt']}",
                "Content-Type": "application/json",
            },
            json={
                "repo": account["did"],
                "collection": "app.bsky.actor.profile",
                "rkey": "self",
                "record": {
                    "$type": "app.bsky.actor.profile",
                    "displayName": "PDS Reset Verification",
                    "description": "Automated reset verification — will be deleted.",
                },
            },
        )
        if resp.status_code != 200:
            _fail(f"putRecord failed: {resp.status_code} {resp.text}")
            return None
        commit_rev = resp.json().get("commit", {}).get("rev")
        _pass(f"Profile written (commit rev: {commit_rev})")
        return commit_rev
    except Exception as e:
        _fail(f"putRecord error: {e}")
        return None


def verify_step7_check_relay(client: httpx.Client, did: str) -> bool:
    """Step 7: THE CRITICAL CHECK — is the repo active (NOT throttled)?"""
    _step("7", "Check relay status (NOT throttled?)")

    # Poll relay — it may take time for the relay to subscribe to our new PDS
    timeout = 45.0
    interval = 3.0
    elapsed = 0.0
    _info(f"Polling relay for up to {timeout:.0f}s...")

    while elapsed < timeout:
        try:
            resp = client.get(
                f"{RELAY_URL}/xrpc/com.atproto.sync.getRepoStatus",
                params={"did": did},
            )
            if resp.status_code == 200:
                data = resp.json()
                active = data.get("active", False)
                status = data.get("status", "?")
                if active:
                    _pass(f"getRepoStatus: active=true, status={status} (after {elapsed:.0f}s)")
                    print(f"\n  {C.GREEN}{C.BOLD}*** RELAY IS NOT THROTTLING — PDS RESET WORKED! ***{C.RESET}\n")
                    return True
                else:
                    _fail(f"getRepoStatus: active={active}, status={status}")
                    if "throttled" in str(status).lower():
                        print(f"\n  {C.RED}{C.BOLD}*** STILL THROTTLED — problem is NOT PDS reputation ***{C.RESET}")
                        print(f"  {C.RED}Need to investigate further (IP reputation? rate limit?){C.RESET}\n")
                    return False
            elif resp.status_code in (400, 403, 404):
                error = resp.json()
                error_name = error.get("error", "")
                if "RepoNotFound" in error_name:
                    if elapsed % 9 < interval:
                        _info(f"Relay: RepoNotFound — waiting for relay to discover PDS... ({elapsed:.0f}s)")
                else:
                    _info(f"getRepoStatus: {error_name} — {error.get('message', '')} ({elapsed:.0f}s)")
            else:
                _info(f"getRepoStatus returned {resp.status_code} ({elapsed:.0f}s)")
        except Exception as e:
            _info(f"getRepoStatus error: {e} ({elapsed:.0f}s)")
        time.sleep(interval)
        elapsed += interval

    _fail(f"Relay did not pick up the repo within {timeout:.0f}s")
    _warn("The relay may need more time to subscribe to the new PDS firehose.")
    _warn("Try running --verify again in a few minutes.")
    return False


def verify_step8_wait_relay_index(client: httpx.Client, did: str, expected_rev: str | None) -> bool:
    """Step 8: Wait for relay to index the repo commit."""
    _step("8", "Wait for relay to index (rev check)")
    timeout = 30.0
    interval = 1.0
    elapsed = 0.0

    while elapsed < timeout:
        try:
            resp = client.get(
                f"{RELAY_URL}/xrpc/com.atproto.sync.getLatestCommit",
                params={"did": did},
            )
            if resp.status_code == 200:
                data = resp.json()
                relay_rev = data.get("rev", "")
                if expected_rev is None or relay_rev >= expected_rev:
                    _pass(f"Relay indexed after {elapsed:.1f}s (rev: {relay_rev})")
                    return True
                else:
                    if elapsed % 5 < interval:
                        _info(f"Relay rev {relay_rev} < expected {expected_rev}, waiting... ({elapsed:.0f}s)")
            elif resp.status_code in (400, 403):
                error = resp.json()
                if elapsed % 5 < interval:
                    _info(f"{error.get('error', '')}: {error.get('message', '')} ({elapsed:.0f}s)")
        except Exception:
            pass
        time.sleep(interval)
        elapsed += interval

    _fail(f"Relay did not index within {timeout}s")
    return False


def verify_step9_toggle_handle(client: httpx.Client, did: str, handle: str) -> bool:
    """Step 9: Toggle handle to emit #identity event."""
    _step("9", "Toggle handle (emit #identity event)")
    headers = admin_headers()

    base, domain = handle.split(".", 1)
    tmp_handle = f"{base}-tmp.{domain}"

    try:
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.admin.updateAccountHandle",
            headers=headers,
            json={"did": did, "handle": tmp_handle},
        )
        if resp.status_code != 200:
            _fail(f"Handle toggle step 1 failed: {resp.status_code} {resp.text}")
            return False
        _info(f"Handle → {tmp_handle}")

        time.sleep(1)

        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.admin.updateAccountHandle",
            headers=headers,
            json={"did": did, "handle": handle},
        )
        if resp.status_code != 200:
            _fail(f"Handle toggle step 2 failed: {resp.status_code} {resp.text}")
            _warn(f"Handle stuck at {tmp_handle}! Manual fix needed.")
            return False
        _pass(f"Handle toggled: {handle} → {tmp_handle} → {handle}")
        return True
    except Exception as e:
        _fail(f"Handle toggle error: {e}")
        return False


def verify_step10_check_bsky_appview(client: httpx.Client, did: str) -> bool:
    """Step 10: Check profile on Bluesky AppView."""
    _step("10", "Check Bluesky AppView")

    _info("Waiting 5s for AppView to process...")
    time.sleep(5)

    try:
        resp = client.get(
            f"{BSKY_PUBLIC_API}/xrpc/app.bsky.actor.getProfile",
            params={"actor": did},
        )
        if resp.status_code == 200:
            data = resp.json()
            display_name = data.get("displayName", "")
            created_at = data.get("createdAt", "?")
            if display_name:
                _pass(f"Profile found: displayName='{display_name}', createdAt={created_at}")
                return True
            else:
                _warn(f"Profile found but NO displayName (stub entry?), createdAt={created_at}")
                if created_at.startswith("0001"):
                    _fail("createdAt=0001-01-01 — broken stub entry!")
                return False
        elif resp.status_code == 400:
            error = resp.json()
            _warn(f"AppView: {error.get('error', '')} — {error.get('message', '')}")
            _info("Profile not yet on AppView (may take longer to index)")
            return False
        else:
            _warn(f"AppView returned {resp.status_code}: {resp.text[:200]}")
            return False
    except Exception as e:
        _fail(f"AppView check error: {e}")
        return False


def verify_step11_cleanup(did: str):
    """Step 11: Cleanup test account."""
    _step("11", "Cleanup test account")
    resp = input(f"  Delete test account {did}? [Y/n]: ").strip().lower()
    if resp in ("", "y", "yes"):
        cleanup_account(did)
    else:
        _info(f"Account left in place: {did}")


# ===========================================================================
# Main
# ===========================================================================

def main():
    parser = argparse.ArgumentParser(
        description="PDS Hard Reset — generate new identity or verify post-reset",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Run post-reset verification (Mode 2)",
    )
    args = parser.parse_args()

    if args.verify:
        sys.exit(mode_verify())
    else:
        mode_generate()


if __name__ == "__main__":
    main()
