#!/usr/bin/env python3
"""
Federation Registration Test Script
====================================
Step-by-step diagnostic that creates a test account on the PDS and traces
the full federation chain: PDS → PLC → relay → Bluesky AppView.

Identifies exactly where the chain breaks for RepoInactive/throttled accounts.

Usage:
  # With port-forward active (kubectl port-forward -n poltr svc/pds 2583:2583):
  PDS_ADMIN_PASSWORD=<pw> python test_registration.py

  # Or with env vars:
  PDS_INTERNAL_URL=http://localhost:2583 PDS_ADMIN_PASSWORD=<pw> python test_registration.py

Dependencies: pip install httpx websockets dag-cbor
"""

import base64
import json
import os
import random
import secrets
import signal
import string
import sys
import time

import httpx

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
_test_handle: str | None = None

# ---------------------------------------------------------------------------
# Colors
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
# Interactive pause
# ---------------------------------------------------------------------------

def pause(label: str = "Press Enter to continue (s = skip, q = quit)") -> str:
    """Wait for user input. Returns 'continue', 'skip', or 'quit'."""
    try:
        resp = input(f"  {C.DIM}{label}: {C.RESET}").strip().lower()
    except EOFError:
        return "continue"
    if resp == "s":
        return "skip"
    if resp == "q":
        sys.exit(0)
    return "continue"


# ---------------------------------------------------------------------------
# Admin auth helper
# ---------------------------------------------------------------------------

def admin_headers() -> dict:
    auth_string = f"admin:{PDS_ADMIN_PASSWORD}"
    auth_bytes = base64.b64encode(auth_string.encode()).decode()
    return {"Authorization": f"Basic {auth_bytes}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup_account(did: str | None = None):
    """Delete the test account from PDS."""
    did = did or _test_did
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
    cleanup_account()
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step implementations
# ---------------------------------------------------------------------------

def step0_preflight(client: httpx.Client) -> bool:
    """Check env vars, PDS connectivity, relay connectivity."""
    _step("0", "Pre-flight checks")
    ok = True

    # Env vars
    if not PDS_ADMIN_PASSWORD:
        _fail("PDS_ADMIN_PASSWORD not set")
        return False
    _pass("PDS_ADMIN_PASSWORD set")

    # PDS connectivity
    try:
        resp = client.get(f"{PDS_INTERNAL_URL}/xrpc/com.atproto.server.describeServer")
        if resp.status_code == 200:
            data = resp.json()
            pds_did = data.get("did", "?")
            _pass(f"PDS reachable at {PDS_INTERNAL_URL} (DID: {pds_did})")
        else:
            _fail(f"PDS returned {resp.status_code}")
            ok = False
    except Exception as e:
        _fail(f"PDS unreachable: {e}")
        ok = False

    # PLC directory
    try:
        resp = client.get(f"{PLC_DIRECTORY_URL}/health")
        if resp.status_code == 200:
            _pass(f"PLC directory reachable ({PLC_DIRECTORY_URL})")
        else:
            # Some PLC instances don't have /health, try a known DID
            _warn(f"PLC /health returned {resp.status_code} (may not have health endpoint)")
    except Exception as e:
        _warn(f"PLC directory check failed: {e}")

    # Relay connectivity
    try:
        # Use a known-good DID to test relay, or just check that it responds
        resp = client.get(
            f"{RELAY_URL}/xrpc/com.atproto.sync.getLatestCommit",
            params={"did": "did:plc:z72i7hdynmk6r22z27h6tvur"},  # @bsky.app
        )
        if resp.status_code in (200, 400):
            _pass(f"Relay reachable ({RELAY_URL})")
        else:
            _warn(f"Relay returned {resp.status_code}")
    except Exception as e:
        _fail(f"Relay unreachable: {e}")
        ok = False

    # Bluesky public API
    try:
        resp = client.get(
            f"{BSKY_PUBLIC_API}/xrpc/app.bsky.actor.getProfile",
            params={"actor": "bsky.app"},
        )
        if resp.status_code == 200:
            _pass(f"Bluesky public API reachable ({BSKY_PUBLIC_API})")
        else:
            _warn(f"Bluesky public API returned {resp.status_code}")
    except Exception as e:
        _warn(f"Bluesky public API check failed: {e}")

    return ok


def step1_create_account(client: httpx.Client) -> dict | None:
    """Create a test account on PDS via admin invite."""
    _step("1", "Create PDS account")
    global _test_did, _test_handle

    # Generate random handle
    name = "test" + "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
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
        _pass(f"Invite code created: {invite_code}")
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
        did = data["did"]
        access_jwt = data["accessJwt"]
        _test_did = did
        _test_handle = handle
        _pass(f"Account created: DID={did}")
        return {
            "did": did,
            "handle": handle,
            "accessJwt": access_jwt,
            "password": password,
            "email": email,
        }
    except Exception as e:
        _fail(f"createAccount error: {e}")
        return None


def step2_plc_resolution(client: httpx.Client, did: str) -> bool:
    """Poll plc.directory until DID resolves."""
    _step("2", "Check PLC resolution")
    timeout = 15.0
    interval = 0.5
    elapsed = 0.0
    while elapsed < timeout:
        try:
            resp = client.get(f"{PLC_DIRECTORY_URL}/{did}")
            if resp.status_code == 200:
                doc = resp.json()
                services = doc.get("service", [])
                pds_endpoint = None
                for svc in services:
                    if svc.get("id") == "#atproto_pds":
                        pds_endpoint = svc.get("serviceEndpoint")
                _pass(f"DID resolved on PLC after {elapsed:.1f}s (PDS endpoint: {pds_endpoint})")
                return True
        except Exception:
            pass
        time.sleep(interval)
        elapsed += interval
    _fail(f"DID {did} not resolved on PLC after {timeout}s")
    return False


def step3_relay_status_before(client: httpx.Client, did: str) -> dict:
    """Check relay status before writing profile."""
    _step("3", "Check relay status (before profile)")
    result = {"status": "unknown", "rev": None}
    try:
        resp = client.get(
            f"{RELAY_URL}/xrpc/com.atproto.sync.getLatestCommit",
            params={"did": did},
        )
        if resp.status_code == 200:
            data = resp.json()
            result["status"] = "active"
            result["rev"] = data.get("rev")
            _pass(f"Relay already has repo (rev: {result['rev']})")
        elif resp.status_code in (400, 403, 404):
            error = resp.json()
            error_name = error.get("error", "")
            message = error.get("message", "")
            if "RepoNotFound" in error_name:
                result["status"] = "not_found"
                _info("Relay: RepoNotFound (expected for new account)")
            elif "RepoTakendown" in error_name:
                result["status"] = "takendown"
                _fail(f"Relay: RepoTakendown — {message}")
            elif "RepoDeactivated" in error_name or "RepoInactive" in error_name:
                result["status"] = "inactive"
                _fail(f"Relay: {error_name} — {message}")
                _warn("BUG: Repo is already inactive BEFORE any profile write!")
                _warn("This confirms the relay received the account event but marked it inactive.")
            else:
                result["status"] = error_name
                _warn(f"Relay: {error_name} — {message}")
        else:
            _warn(f"Relay returned unexpected {resp.status_code}: {resp.text}")
    except Exception as e:
        _fail(f"Relay check error: {e}")

    # Also check getRepoStatus — more authoritative than getLatestCommit
    try:
        resp = client.get(
            f"{RELAY_URL}/xrpc/com.atproto.sync.getRepoStatus",
            params={"did": did},
        )
        if resp.status_code == 200:
            status_data = resp.json()
            active = status_data.get("active", False)
            status_str = status_data.get("status", "?")
            result["repo_status"] = status_data
            if active:
                _pass(f"getRepoStatus: active=true, status={status_str}")
            else:
                # getRepoStatus is more authoritative — override status
                result["status"] = status_str  # e.g. "throttled"
                _warn(f"getRepoStatus: active={active}, status={status_str}")
                if status_data.get("rev"):
                    _info(f"  rev: {status_data['rev']}")
        elif resp.status_code in (400, 403):
            _info(f"getRepoStatus: {resp.json().get('error', resp.text)}")
        else:
            _info(f"getRepoStatus: {resp.status_code}")
    except Exception as e:
        _info(f"getRepoStatus error: {e}")

    return result


def step4_write_profile(client: httpx.Client, access_jwt: str, did: str) -> str | None:
    """Write app.bsky.actor.profile/self to PDS."""
    _step("4", "Write profile record")
    try:
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.repo.putRecord",
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
                    "displayName": "Federation Test",
                    "description": "Automated federation test account — will be deleted.",
                },
            },
        )
        if resp.status_code != 200:
            _fail(f"putRecord failed: {resp.status_code} {resp.text}")
            return None
        data = resp.json()
        commit_rev = data.get("commit", {}).get("rev")
        _pass(f"Profile written (commit rev: {commit_rev})")
        return commit_rev
    except Exception as e:
        _fail(f"putRecord error: {e}")
        return None


def step5_verify_profile_on_pds(client: httpx.Client, access_jwt: str, did: str) -> bool:
    """Verify profile record exists on PDS."""
    _step("5", "Verify profile on PDS")
    try:
        resp = client.get(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.repo.getRecord",
            params={
                "repo": did,
                "collection": "app.bsky.actor.profile",
                "rkey": "self",
            },
        )
        if resp.status_code == 200:
            record = resp.json().get("value", {})
            display_name = record.get("displayName", "?")
            _pass(f"Profile exists on PDS (displayName: '{display_name}')")
            return True
        else:
            _fail(f"getRecord failed: {resp.status_code} {resp.text}")
            return False
    except Exception as e:
        _fail(f"getRecord error: {e}")
        return False


def step5a_get_repo_on_pds(client: httpx.Client, did: str) -> bool:
    """Check com.atproto.sync.getRepo on PDS — verifies repo root + commit DAG exists."""
    _step("5a", "Verify repo DAG on PDS (getRepo)")
    try:
        resp = client.get(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.sync.getRepo",
            params={"did": did},
        )
        if resp.status_code == 200:
            content_type = resp.headers.get("content-type", "")
            body_len = len(resp.content)
            _pass(f"getRepo OK — {body_len} bytes, content-type: {content_type}")
            return True
        else:
            _fail(f"getRepo failed: {resp.status_code} {resp.text[:200]}")
            return False
    except Exception as e:
        _fail(f"getRepo error: {e}")
        return False


def step5b_firehose_check(did: str, timeout_seconds: int = 10) -> dict:
    """Connect to PDS firehose WebSocket, look for #commit and #identity frames."""
    _step("5b", "Firehose live-check (WebSocket)")

    result = {"commit_seen": False, "identity_seen": False, "error": None}

    try:
        import websockets.sync.client as ws_sync
    except ImportError:
        _warn("'websockets' not installed (pip install websockets) — skipping firehose check")
        result["error"] = "websockets not installed"
        return result

    try:
        import dag_cbor
        from io import BytesIO
    except ImportError:
        _warn("'dag-cbor' not installed (pip install dag-cbor) — skipping firehose check")
        result["error"] = "dag-cbor not installed"
        return result

    # Connect to PDS firehose (not relay) to check our PDS is emitting events
    firehose_url = PDS_INTERNAL_URL.replace("http://", "ws://").replace("https://", "wss://")
    firehose_url += "/xrpc/com.atproto.sync.subscribeRepos"

    _info(f"Connecting to {firehose_url} (watching for {timeout_seconds}s)...")

    try:
        with ws_sync.connect(firehose_url, open_timeout=5, close_timeout=5) as ws:
            deadline = time.time() + timeout_seconds
            frame_count = 0

            while time.time() < deadline:
                remaining = deadline - time.time()
                if remaining <= 0:
                    break
                try:
                    ws.socket.settimeout(min(2.0, remaining))
                    raw = ws.recv()
                except TimeoutError:
                    continue
                except Exception:
                    break

                if not isinstance(raw, bytes):
                    continue

                frame_count += 1

                # DAG-CBOR framed stream: [header][body] per WebSocket message
                try:
                    buf = BytesIO(raw)
                    header = dag_cbor.decode(buf, allow_concat=True)
                    body = dag_cbor.decode(buf, allow_concat=True)

                    msg_type = header.get("t", "")

                    if msg_type == "#commit":
                        repo = body.get("repo", "")
                        if repo == did:
                            result["commit_seen"] = True
                            _pass(f"#commit frame seen for our DID (seq: {body.get('seq', '?')})")
                    elif msg_type == "#identity":
                        identity_did = body.get("did", "")
                        if identity_did == did:
                            result["identity_seen"] = True
                            _pass(f"#identity frame seen for our DID (seq: {body.get('seq', '?')})")
                except Exception:
                    pass  # Malformed frame, skip

            if frame_count == 0:
                _fail("No firehose frames received — firehose may be broken")
            else:
                _info(f"Received {frame_count} frames total")

            if not result["commit_seen"]:
                _warn("No #commit frame seen for our DID (may have already passed)")
            if not result["identity_seen"]:
                _warn("No #identity frame seen for our DID (may have already passed)")

    except Exception as e:
        _fail(f"Firehose connection error: {e}")
        result["error"] = str(e)

    return result


def step5c_relay_repo_status(client: httpx.Client, did: str) -> dict:
    """Check com.atproto.sync.getRepoStatus on relay."""
    _step("5c", "Repo status on relay (after profile write)")

    result = {"active": None, "status": "unknown"}

    try:
        resp = client.get(
            f"{RELAY_URL}/xrpc/com.atproto.sync.getRepoStatus",
            params={"did": did},
        )
        if resp.status_code == 200:
            data = resp.json()
            result.update(data)
            active = data.get("active", False)
            status = data.get("status", "?")
            if active:
                _pass(f"Relay repo status: active=true, status={status}")
            else:
                _fail(f"Relay repo status: active={active}, status={status}")
                _warn("Relay has blocked this repo immediately after creation!")
        elif resp.status_code in (400, 403):
            error = resp.json()
            result["status"] = error.get("error", "unknown")
            _info(f"getRepoStatus: {error.get('error', '')} — {error.get('message', '')}")
        else:
            _warn(f"getRepoStatus returned {resp.status_code}")
    except Exception as e:
        _fail(f"getRepoStatus error: {e}")
        result["error"] = str(e)

    # Also re-check getLatestCommit
    try:
        resp = client.get(
            f"{RELAY_URL}/xrpc/com.atproto.sync.getLatestCommit",
            params={"did": did},
        )
        if resp.status_code == 200:
            data = resp.json()
            result["relay_rev"] = data.get("rev")
            _pass(f"getLatestCommit: rev={data.get('rev')}")
        elif resp.status_code in (400, 403):
            error = resp.json()
            _info(f"getLatestCommit: {error.get('error', '')} — {error.get('message', '')}")
        else:
            _info(f"getLatestCommit: {resp.status_code}")
    except Exception as e:
        _info(f"getLatestCommit error: {e}")

    return result


def step6_request_crawl(client: httpx.Client) -> bool:
    """POST requestCrawl to relay."""
    _step("6", "Request relay crawl")
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


def step7_wait_relay_index(client: httpx.Client, did: str, expected_rev: str | None) -> dict:
    """Poll relay getLatestCommit until rev matches profile commit."""
    _step("7", "Wait for relay to index (rev check)")
    timeout = 30.0
    interval = 1.0
    elapsed = 0.0

    result = {"indexed": False, "relay_rev": None, "status": "unknown"}

    while elapsed < timeout:
        try:
            resp = client.get(
                f"{RELAY_URL}/xrpc/com.atproto.sync.getLatestCommit",
                params={"did": did},
            )
            if resp.status_code == 200:
                data = resp.json()
                relay_rev = data.get("rev", "")
                result["relay_rev"] = relay_rev
                result["status"] = "active"
                if expected_rev is None or relay_rev >= expected_rev:
                    _pass(f"Relay indexed after {elapsed:.1f}s (rev: {relay_rev})")
                    result["indexed"] = True
                    return result
                else:
                    _info(f"  Relay rev {relay_rev} < expected {expected_rev}, waiting... ({elapsed:.0f}s)")
            elif resp.status_code in (400, 403):
                error = resp.json()
                error_name = error.get("error", "")
                message = error.get("message", "")
                result["status"] = error_name
                if elapsed % 5 < interval:  # Log every ~5s
                    _info(f"  {error_name}: {message} ({elapsed:.0f}s)")
        except Exception:
            pass
        time.sleep(interval)
        elapsed += interval

    if result["status"] == "unknown":
        _fail(f"Relay never responded for {did} after {timeout}s")
    elif "RepoNotFound" in result["status"]:
        _fail(f"Relay: RepoNotFound after {timeout}s — relay never saw any commits")
    elif "RepoInactive" in result["status"] or "RepoDeactivated" in result["status"]:
        _fail(f"Relay: {result['status']} after {timeout}s")
    else:
        _fail(f"Relay: {result['status']} after {timeout}s, rev={result['relay_rev']}")

    return result


def step8_toggle_handle(client: httpx.Client, did: str, handle: str) -> bool:
    """Admin updateAccountHandle: tmp handle → back to original."""
    _step("8", "Toggle handle (force #identity event)")
    headers = admin_headers()

    base, domain = handle.split(".", 1)
    tmp_handle = f"{base}-tmp.{domain}"

    try:
        # Step 1: change to temp handle
        resp = client.post(
            f"{PDS_INTERNAL_URL}/xrpc/com.atproto.admin.updateAccountHandle",
            headers=headers,
            json={"did": did, "handle": tmp_handle},
        )
        if resp.status_code != 200:
            _fail(f"Handle toggle step 1 failed: {resp.status_code} {resp.text}")
            return False
        _info(f"Handle changed to {tmp_handle}")

        # Brief pause to let events propagate
        time.sleep(1)

        # Step 2: revert to original
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


def step9_check_bsky_appview(client: httpx.Client, did: str, handle: str) -> dict:
    """Check profile on public.api.bsky.app."""
    _step("9", "Check Bluesky AppView")
    result = {"found": False, "has_display_name": False, "data": None}

    # Wait a few seconds for AppView to process the identity event
    _info("Waiting 5s for AppView to process identity event...")
    time.sleep(5)

    try:
        resp = client.get(
            f"{BSKY_PUBLIC_API}/xrpc/app.bsky.actor.getProfile",
            params={"actor": did},
        )
        if resp.status_code == 200:
            data = resp.json()
            result["found"] = True
            result["data"] = data
            display_name = data.get("displayName", "")
            created_at = data.get("createdAt", "?")
            if display_name:
                result["has_display_name"] = True
                _pass(f"Profile found: displayName='{display_name}', createdAt={created_at}")
            else:
                _warn(f"Profile found but NO displayName (stub entry?), createdAt={created_at}")
                if created_at.startswith("0001"):
                    _fail("createdAt=0001-01-01 — confirmed broken stub entry!")
        elif resp.status_code == 400:
            error = resp.json()
            _info(f"AppView: {error.get('error', '')} — {error.get('message', '')}")
            _warn("Profile not found on Bluesky AppView (may take longer to index)")
        else:
            _warn(f"AppView returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        _fail(f"AppView check error: {e}")

    return result


def step10_check_author_feed(client: httpx.Client, did: str) -> bool:
    """Check getAuthorFeed on Bluesky public API."""
    _step("10", "Check getAuthorFeed")
    try:
        resp = client.get(
            f"{BSKY_PUBLIC_API}/xrpc/app.bsky.feed.getAuthorFeed",
            params={"actor": did, "limit": 1},
        )
        if resp.status_code == 200:
            data = resp.json()
            feed_items = data.get("feed", [])
            _pass(f"getAuthorFeed returned successfully ({len(feed_items)} items)")
            return True
        elif resp.status_code == 400:
            error = resp.json()
            error_name = error.get("error", "")
            message = error.get("message", "")
            _fail(f"getAuthorFeed: {error_name} — {message}")
            return False
        else:
            _fail(f"getAuthorFeed: {resp.status_code} {resp.text[:200]}")
            return False
    except Exception as e:
        _fail(f"getAuthorFeed error: {e}")
        return False


def step11_cleanup(did: str):
    """Offer to delete the test account."""
    _step("11", "Cleanup")
    resp = input(f"  Delete test account {did}? [Y/n]: ").strip().lower()
    if resp in ("", "y", "yes"):
        cleanup_account(did)
    else:
        _info(f"Account left in place: {did}")
        _info("Delete manually with:")
        _info(f"  goat pds admin account delete --pds-host {PDS_INTERNAL_URL} --admin-password <pw> {did}")


# ---------------------------------------------------------------------------
# Decision tree
# ---------------------------------------------------------------------------

def print_diagnosis(results: dict):
    """Print the diagnosis based on collected results."""
    print(f"\n{'='*60}")
    print(f"{C.BOLD}DIAGNOSIS{C.RESET}")
    print(f"{'='*60}")

    step3 = results.get("step3", {})
    step5c = results.get("step5c", {})
    step7 = results.get("step7", {})
    step9 = results.get("step9", {})

    relay_status_before = step3.get("status", "unknown")
    relay_status_after = step5c.get("status", "unknown")
    relay_indexed = step7.get("indexed", False)
    appview_found = step9.get("found", False)
    appview_has_name = step9.get("has_display_name", False)

    # Normalize status values — relay uses different fields/codes:
    #   getLatestCommit error field: "RepoInactive", "RepoNotFound", "RepoDeactivated"
    #   getRepoStatus status field:  "throttled", "deactivated", "takendown"
    #   step3 normalizes to:         "inactive", "not_found", "takendown", "active"
    _inactive_statuses = ("inactive", "throttled", "deactivated", "RepoInactive", "RepoDeactivated")

    if relay_status_before in _inactive_statuses:
        print(f"\n{C.RED}FINDING: Repo marked inactive BEFORE profile write (Fall B){C.RESET}")
        print("  The relay received the account creation event (likely #identity)")
        print("  but immediately marked the repo as inactive/throttled.")
        print("  This happens when the PDS emits #identity before the repo is")
        print("  fully initialized on the relay side.")
        print(f"\n  {C.BOLD}Root cause:{C.RESET} PDS event ordering — #identity fires before #commit")
        print(f"  {C.BOLD}Fix:{C.RESET} PDS should emit #identity AFTER repo init + first commit")

    elif not relay_indexed and "RepoNotFound" in step7.get("status", ""):
        print(f"\n{C.RED}FINDING: Relay never saw any commits (Fall A){C.RESET}")
        print("  The relay does not have the repo at all.")
        print("  Possible causes:")
        print("  - Firehose connection from relay to PDS is broken")
        print("  - PDS WebSocket killed by nginx timeout (check pds-ingress)")
        print("  - requestCrawl not reaching the PDS")

    elif not relay_indexed and step7.get("status", "") in _inactive_statuses:
        print(f"\n{C.RED}FINDING: Relay has repo but marked inactive (Fall B){C.RESET}")
        print("  The relay saw the repo but marked it inactive/throttled.")
        print("  This is the firehose ordering bug: #identity arrives before")
        print("  the repo is properly initialized.")
        print(f"\n  {C.BOLD}Root cause:{C.RESET} PDS emits #identity before #commit (ordering bug)")

    elif relay_indexed and appview_found and not appview_has_name:
        print(f"\n{C.YELLOW}FINDING: Relay OK but AppView has stub entry (Fall C){C.RESET}")
        print("  The relay has the repo and the correct rev, but the Bluesky")
        print("  AppView created a broken stub entry (no displayName).")
        print("  The initial #identity event was processed before the profile")
        print("  record was available.")
        print(f"\n  {C.BOLD}Root cause:{C.RESET} Race condition — #identity processed before profile available")
        print(f"  {C.BOLD}Status:{C.RESET} Handle toggle should fix this if relay had the correct rev")

    elif relay_indexed and appview_found and appview_has_name:
        print(f"\n{C.GREEN}SUCCESS: Full federation chain works!{C.RESET}")
        print("  Account created → PLC resolved → relay indexed → AppView has profile")
        print("  The handle toggle workaround is effective.")

    elif relay_indexed and not appview_found:
        print(f"\n{C.YELLOW}FINDING: Relay OK but AppView hasn't indexed yet{C.RESET}")
        print("  The relay has the repo but Bluesky AppView hasn't picked it up.")
        print("  This may just need more time, or the handle toggle didn't emit")
        print("  an #identity event that the AppView processed.")
        print("  Try checking again in a few minutes:")
        print(f"  curl '{BSKY_PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor={results.get('did', '?')}'")

    else:
        print(f"\n{C.YELLOW}INCONCLUSIVE{C.RESET}")
        print(f"  relay_before={relay_status_before}")
        print(f"  relay_after_profile={relay_status_after}")
        print(f"  relay_indexed={relay_indexed} (status: {step7.get('status', '?')})")
        print(f"  appview_found={appview_found}, has_displayName={appview_has_name}")

    print(f"\n{'='*60}\n")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    signal.signal(signal.SIGINT, _signal_handler)

    print(f"\n{C.BOLD}{'='*60}{C.RESET}")
    print(f"{C.BOLD} Federation Registration Test{C.RESET}")
    print(f"{C.BOLD}{'='*60}{C.RESET}")
    print(f"  PDS:   {PDS_INTERNAL_URL}")
    print(f"  Relay: {RELAY_URL}")
    print(f"  PLC:   {PLC_DIRECTORY_URL}")
    print(f"  Bsky:  {BSKY_PUBLIC_API}")
    print()

    results = {}

    with httpx.Client(timeout=30.0) as client:

        # Step 0: Pre-flight
        if not step0_preflight(client):
            _fail("Pre-flight failed, cannot continue")
            sys.exit(1)

        if pause() == "skip":
            pass

        # Step 1: Create account
        account = step1_create_account(client)
        if not account:
            _fail("Account creation failed, cannot continue")
            sys.exit(1)
        results["did"] = account["did"]

        if pause() == "skip":
            pass

        # Step 2: PLC resolution
        step2_plc_resolution(client, account["did"])

        if pause() == "skip":
            pass

        # Step 3: Relay status before profile
        results["step3"] = step3_relay_status_before(client, account["did"])

        if pause() == "skip":
            pass

        # Step 4: Write profile
        commit_rev = step4_write_profile(client, account["accessJwt"], account["did"])
        results["profile_rev"] = commit_rev

        if pause() == "skip":
            pass

        # Step 5: Verify on PDS
        step5_verify_profile_on_pds(client, account["accessJwt"], account["did"])

        # Step 5a: Verify repo DAG on PDS (getRepo)
        step5a_get_repo_on_pds(client, account["did"])

        # Step 5b: Firehose check
        action = pause("Press Enter for firehose check, s to skip, q to quit")
        if action != "skip":
            results["step5b"] = step5b_firehose_check(account["did"])
        else:
            _step("5b", "Firehose live-check (skipped)")

        # Step 5c: Relay repo status after profile
        results["step5c"] = step5c_relay_repo_status(client, account["did"])

        if pause() == "skip":
            pass

        # Step 6: Request crawl
        step6_request_crawl(client)

        if pause() == "skip":
            pass

        # Step 7: Wait for relay indexing
        results["step7"] = step7_wait_relay_index(client, account["did"], commit_rev)

        if pause() == "skip":
            pass

        # Step 8: Toggle handle
        step8_toggle_handle(client, account["did"], account["handle"])

        if pause() == "skip":
            pass

        # Step 9: Check Bluesky AppView
        results["step9"] = step9_check_bsky_appview(client, account["did"], account["handle"])

        if pause() == "skip":
            pass

        # Step 10: Check getAuthorFeed
        step10_check_author_feed(client, account["did"])

    # Diagnosis
    print_diagnosis(results)

    # Step 11: Cleanup
    step11_cleanup(account["did"])


if __name__ == "__main__":
    main()
