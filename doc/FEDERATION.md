# Federation with Bluesky

How to set up a POLTR PDS so it federates with the Bluesky network. This document covers the full procedure for fresh PDS setups, PDS resets, relay limits, throttling recovery, and operational commands.

## Overview

For POLTR user profiles to be visible on bsky.app, the PDS must federate with the Bluesky relay (`bsky.network`). The relay subscribes to the PDS firehose (`com.atproto.sync.subscribeRepos` WebSocket) and forwards events to the Bluesky AppView, which indexes `app.bsky.*` records.

```
PDS (pds2.poltr.info)
  │
  │  WebSocket firehose (com.atproto.sync.subscribeRepos)
  ▼
Relay (bsky.network)
  │
  │  #commit (repo data), #identity (DID updates), #account (status changes)
  ▼
Bluesky AppView (bsky.app)
```

### Discovery

- PDS sets `PDS_CRAWLERS=https://bsky.network` → notifies relay on startup
- `com.atproto.sync.requestCrawl` → tells relay to discover the PDS
- Relay resolves the PDS server DID via `plc.directory` → finds the service endpoint → connects to firehose

## Current PDS Status (2026-02-14)

**PDS renamed to `pds2.poltr.info`.** The old hostname `pds.poltr.info` was permanently throttled on the Bluesky relay (hostname-based). A new server identity will be registered with the new hostname for a clean relay reputation.

| Item | Value |
|------|-------|
| PDS hostname | `pds2.poltr.info` (renamed from `pds.poltr.info`) |
| PDS server DID | Pending — run `pds_reset.py` to generate new `did:plc` |
| Old DID (burned) | `did:plc:iwuulu67r3mcu4gv7ocn6yry` (throttled on `pds.poltr.info`) |
| Older DID (burned) | `did:plc:qxh5huiavlu3lfejrhkpsl3q` |
| PDS data | To be wiped (fresh `pds-data` PVC) |
| DB cleanup | Pending |
| Handle domain CNAME | `*.id.poltr.ch` → must be updated to point to `pds2.poltr.info` |

### Why the rename was needed

All accounts on the old PDS (`pds.poltr.info`) were permanently `RepoInactive: throttled` by the Bluesky relay. The relay's spam detection flagged the PDS during initial setup (race condition: `#identity` events emitted before repos were ready). A new PDS server DID was registered but **throttling is hostname-based**, so the new DID alone didn't help. Renaming to `pds2.poltr.info` gives a clean relay reputation.

### Next steps

1. Run `pds_reset.py` to generate new `did:plc` with `pds2.poltr.info` endpoint
2. Follow K8s reset procedure (scale down, wipe PVC, apply secrets, scale up)
3. Update DNS: `*.id.poltr.ch` CNAME → `pds2.poltr.info`
4. Verify with `pds_reset.py --verify` — relay must report `active: true`
5. Recreate governance account, update `PDS_GOVERNANCE_ACCOUNT_DID`, update `app_ballots` DIDs
6. Rebuild frontend Docker image (new `NEXT_PUBLIC_PDS_URL` baked in)

## Prerequisites

- PDS running and publicly reachable (HTTPS)
- `goat` CLI installed (`go install github.com/bluesky-social/goat@latest`)
- Access to PDS admin password
- Access to PDS rotation key (`PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`)
- `kubectl` access to the poltr namespace

## Step-by-Step Setup

### 1. Generate and register a `did:plc` for the PDS

Every PDS needs a server DID. We use `did:plc` (not `did:web`) because the Bluesky PDS image does not serve `/.well-known/did.json` and `did:plc` is the standard for Bluesky PDSes.

The `did:plc` is derived from the PDS rotation key and must be registered at `plc.directory`.

#### 1a. Extract the public key from the rotation key

The PDS rotation key is a secp256k1 private key stored as hex in `PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`. To get the compressed public key:

```python
# pip install secp256k1
import secp256k1
import binascii

private_hex = "<PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX>"
privkey = secp256k1.PrivateKey(binascii.unhexlify(private_hex))
pubkey_compressed = privkey.pubkey.serialize()  # 33 bytes compressed
print(pubkey_compressed.hex())
```

#### 1b. Create the PLC genesis operation

The PLC genesis operation is a signed JSON document that registers the DID. It must contain:

- `type`: `"plc_operation"`
- `rotationKeys`: array with the did:key multicodec encoding of the secp256k1 public key
- `verificationMethods`: `{ "atproto": "<did:key of the key>" }`
- `alsoKnownAs`: `["at://pds2.poltr.info"]`
- `services`: `{ "atproto_pds": { "type": "AtprotoPersonalDataServer", "endpoint": "https://pds2.poltr.info" } }`
- `prev`: `null`
- `sig`: secp256k1 signature over the DAG-CBOR encoding of the operation (without the `sig` field)

The did:key encoding for secp256k1 uses multicodec prefix `0xe7` (varint `0xe701`):

```python
import base64
import hashlib

multicodec_prefix = bytes([0xe7, 0x01])
did_key = "did:key:z" + base58btc_encode(multicodec_prefix + pubkey_compressed)
```

#### 1c. Sign and submit to plc.directory

```python
import cbor2
import requests

# Build the operation without sig
op = {
    "type": "plc_operation",
    "rotationKeys": [did_key],
    "verificationMethods": {"atproto": did_key},
    "alsoKnownAs": ["at://pds2.poltr.info"],
    "services": {
        "atproto_pds": {
            "type": "AtprotoPersonalDataServer",
            "endpoint": "https://pds2.poltr.info"
        }
    },
    "prev": None
}

# DAG-CBOR encode and sign
cbor_bytes = cbor2.dumps(op, canonical=True)
sig_bytes = privkey.ecdsa_sign(hashlib.sha256(cbor_bytes).digest())
sig_compact = privkey.ecdsa_serialize_compact(sig_bytes)
op["sig"] = base64.urlsafe_b64encode(sig_compact).rstrip(b"=").decode()

# Compute the DID (SHA-256 of the DAG-CBOR, base32 lower, first 24 chars)
op_hash = hashlib.sha256(cbor2.dumps(op, canonical=True)).digest()
did = "did:plc:" + base64.b32encode(op_hash).decode().lower().rstrip("=")[:24]

# Submit
resp = requests.post(f"https://plc.directory/{did}", json=op)
```

**Important:** If the DID the PLC directory computes differs from yours (due to CBOR encoding differences), use the DID from the PLC directory's error response. The PLC directory returns the correct DID it computed.

#### 1d. Verify registration

```bash
curl https://plc.directory/<did>
# Should return the DID document with the PDS service endpoint
```

### 2. Configure PDS secrets

Add the DID to the PDS secrets. **The env var the PDS reads is `PDS_SERVICE_DID`** (not `PDS_SERVER_DID` despite what older docs may say):

```yaml
# In pds-secrets (secrets.yaml):
PDS_SERVICE_DID: "did:plc:..."    # The did:plc registered in step 1
PDS_CRAWLERS: "https://bsky.network"  # Tells PDS to notify relay on startup
PDS_HOSTNAME: "pds2.poltr.info"
```

After updating secrets, restart the PDS:

```bash
kubectl rollout restart deployment/pds -n poltr
```

Verify the PDS reports the correct DID:

```bash
curl https://pds2.poltr.info/xrpc/com.atproto.server.describeServer | jq .did
# Should return "did:plc:..."
```

### 3. Configure Kubernetes Ingress for WebSocket

The Bluesky relay maintains a persistent WebSocket connection to the PDS firehose. Nginx's default 60-second `proxy-read-timeout` will kill this connection, causing `ERR_STREAM_PREMATURE_CLOSE` errors in PDS logs.

**The PDS must have its own Ingress resource with extended timeouts**, separate from the main poltr-ingress:

```yaml
---
# Separate Ingress for PDS — needs long WebSocket timeouts
# so the Bluesky relay can maintain a persistent firehose subscription.
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: pds-ingress
  namespace: poltr
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod-dns"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "30"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - "*.poltr.info"
      secretName: poltr-wildcard-tls
  rules:
    - host: pds2.poltr.info
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: pds
                port:
                  number: 80
```

Make sure `pds2.poltr.info` is **not** also listed in the main `poltr-ingress` (which has default timeouts). Only one ingress should handle the PDS host.

Use `spec.ingressClassName: nginx` (not the deprecated `kubernetes.io/ingress.class` annotation).

### 4. Request relay crawl

Tell the Bluesky relay to discover and subscribe to the PDS:

```bash
curl -X POST https://bsky.network/xrpc/com.atproto.sync.requestCrawl \
  -H 'Content-Type: application/json' \
  -d '{"hostname": "pds2.poltr.info"}'
# Should return {"success": true}
```

This is also done automatically by the AppView after user registration (see `relay_request_crawl()` in `services/appview/src/lib/atproto_api.py`).

### 5. Write Bluesky profiles

For user profiles to appear on bsky.app, each account needs an `app.bsky.actor.profile` record at `self`. The POLTR registration flow already writes this (see `login.py`), but for existing accounts or after a PDS reset, you may need to re-write them.

Using `goat`:

```bash
# Port-forward to PDS
kubectl port-forward -n poltr svc/pds 2583:80

# Login as user
goat pds account login --pds-host http://localhost:2583 \
  --handle <handle> --password <password>

# Write/update profile
goat repo put-record --pds-host http://localhost:2583 \
  --did <user-did> \
  --collection app.bsky.actor.profile \
  --rkey self \
  --record '{"$type":"app.bsky.actor.profile","displayName":"Name","description":"Bio"}'
```

Or via the PDS XRPC API directly:

```bash
# Get session token
TOKEN=$(curl -s -X POST http://localhost:2583/xrpc/com.atproto.server.createSession \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"<handle>","password":"<password>"}' | jq -r .accessJwt)

# Write profile
curl -X POST http://localhost:2583/xrpc/com.atproto.repo.putRecord \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "repo": "<did>",
    "collection": "app.bsky.actor.profile",
    "rkey": "self",
    "record": {
      "$type": "app.bsky.actor.profile",
      "displayName": "Display Name",
      "description": "Bio text"
    }
  }'
```

### 6. Verify federation

Check that the relay can see your PDS accounts:

```bash
# Check if relay knows about a specific DID
curl "https://bsky.network/xrpc/com.atproto.sync.getLatestCommit?did=<user-did>"
# Success: returns { "cid": "...", "rev": "..." }
# Failure: returns error (RepoNotFound, RepoInactive, etc.)

# Check if profile appears on Bluesky
curl "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=<handle>"
```

## Relay Federation Limits

The Bluesky relay (`bsky.network`) enforces per-PDS limits that are **not fully documented** in official docs. Understanding these is critical for any third-party PDS planning to grow.

### Per-PDS Account Limit (default: 100)

The relay has a **hard account limit per PDS hostname**, defaulting to **100 accounts**.

This is defined in the relay source code ([indigo/cmd/relay/relay/relay.go](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/relay/relay.go)):

```go
DefaultRepoLimit: 100          // third-party PDS instances
TrustedRepoLimit: 10_000_000   // Bluesky's own PDS fleet (*.host.bsky.network)
```

**What happens at account 101+:**

1. The relay marks new accounts with status `host-throttled` (in `CreateAccountHost()`, [account.go](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/relay/account.go))
2. During event ingestion, throttled accounts are treated as **inactive** — all their events (commits, identity updates) are **silently dropped** ([ingest.go](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/relay/ingest.go))
3. No error is returned to the PDS. `requestCrawl` still succeeds. The PDS has no way to know accounts are being throttled
4. Posts, likes, follows, and profile updates from throttled accounts never reach the Bluesky AppView

**There is no notification when the limit is hit. It fails silently.**

### Per-PDS Event Rate Limits

Separate from the account limit, the relay enforces event rate limits per PDS:

| Limit | Value | Window |
|-------|-------|--------|
| Events per second | 50 | Rolling |
| Events per hour | 1,500 | Rolling |
| Events per day | 10,000 | Rolling |
| Account creation | 5/sec | Rolling |

For non-trusted hosts, limits scale with the account limit:
- Per second: `50 + (account_limit / 1000)`
- Per hour: `2500 + account_limit`
- Per day: `20000 + account_limit * 10`

Rate limiters are **in-memory only** — they reset when the relay process restarts. When a rate limit is exceeded, the relay blocks (waits) rather than disconnecting — events are delayed, not dropped.

These are documented at [docs.bsky.app/docs/advanced-guides/rate-limits](https://docs.bsky.app/docs/advanced-guides/rate-limits).

### Host Statuses on the Relay

The relay tracks five host statuses ([models.go](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/relay/models/models.go)):

| Status | Meaning |
|--------|---------|
| `active` | Normal operation, firehose subscribed |
| `idle` | No recent activity |
| `offline` | PDS unreachable |
| `throttled` | Rate-limited (temporary) |
| `banned` | Blocked by relay admin — no connection maintained |

And three account-level statuses:

| Status | Meaning |
|--------|---------|
| `active` | Events flow through normally |
| `throttled` | Rate-limited (temporary) |
| `host-throttled` | Over the per-PDS account limit — events **silently dropped** |

Note: `host-throttled` is mapped to `throttled` in the external API (`getRepoStatus`), so you can't distinguish them from outside.

### Historical Timeline

| Period | Per-PDS Account Limit | Notes |
|--------|----------------------|-------|
| Early 2024 (sandbox) | 1,000 | Separate test environment |
| Feb 2024 (early federation) | 10 | Discord approval required |
| Mid-2024 (open federation) | **100** (current default) | Auto-crawl enabled |
| Trusted domains (`*.host.bsky.network`) | 10,000,000 | Bluesky's own PDS fleet |

### Requesting Higher Limits

The relay has an admin API (`/admin/pds/changeLimits`) that Bluesky staff can use to raise the account limit for a specific PDS hostname. To request an increase:

1. Contact the Bluesky team via the [PDS Admins Discord](https://discord.gg/e7hpHxRfBP)
2. Be prepared to provide: project description, expected account count, moderation plan, abuse handling approach, operator identity
3. There is **no self-service process** — it requires Bluesky team intervention

If the limit is raised after accounts were already throttled, previously throttled accounts are automatically promoted to `active` status (up to the new limit).

### Implications for POLTR

- The 100-account limit must be raised **before** reaching 100 users on `pds2.poltr.info`
- Proactively contact Bluesky team when approaching ~80 accounts
- Monitor account count: `goat pds account list --pds-host http://localhost:2583 | wc -l`
- If accounts are already throttled after a limit raise, the relay auto-promotes them

### The Practical Reality

AT Protocol is **technically decentralized but socially centralized**. While anyone can run a PDS and the protocol is open, meaningful participation in the Bluesky network depends on the relay (`bsky.network`) choosing to index your PDS. The relay operators (Bluesky PBC) control:

- Whether your PDS is crawled at all
- How many accounts are indexed (the 100-account default)
- Event rate limits (how fast your PDS can emit changes)
- Throttling decisions (hostname-based, no appeal process documented)

This is not necessarily malicious — it's spam prevention infrastructure. But it means federation with `bsky.network` is **permissioned in practice**, even though the protocol itself is permissionless.

## Recovering a Throttled PDS

If your PDS hostname is throttled on the relay, **you cannot fix this yourself**. Recovery requires the Bluesky relay operator to act via their admin API. All admin endpoints require HTTP Basic Auth with the relay admin password (only the Bluesky team has this).

### Diagnosis

From outside, you can check individual accounts:

```bash
# Check account status on relay
curl "https://bsky.network/xrpc/com.atproto.sync.getRepoStatus?did=<did>"
# Throttled: {"did":"...","active":false,"status":"throttled"}
# Active:   {"did":"...","active":true,"status":"active"}
# Unknown:  {"error":"RepoNotFound","message":"account not found"}
```

You **cannot** see the host-level status or distinguish `throttled` from `host-throttled` via public APIs.

The relay admin can check with:

```bash
# List all PDS hosts with status, account counts, limits
curl -u "admin:<RELAY_ADMIN_PASSWORD>" \
  "https://bsky.network/admin/pds/list" | jq '.[] | select(.Host == "pds2.poltr.info")'
# Returns: RepoCount, RepoLimit, Blocked, HasActiveConnection, rate limit stats
```

### Recovery Option 1: Raise the account limit (most common fix)

If the PDS hit the 100-account limit, or the limit was lowered:

```bash
# Relay admin runs:
curl -X POST -u "admin:<RELAY_ADMIN_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{"host": "pds2.poltr.info", "repo_limit": 1000}' \
  "https://bsky.network/admin/pds/changeLimits"
```

This does three things:
1. Raises the `account_limit` for the PDS
2. Automatically transitions `host-throttled` accounts back to `active` (up to the delta)
3. Updates in-memory rate limiters to scale with the new limit

Source: `UpdateHostAccountLimit()` in [host.go](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/relay/host.go)

### Recovery Option 2: Unblock a banned host

If the host status is `banned`, the relay won't maintain a firehose connection at all:

```bash
# Relay admin runs:
curl -X POST -u "admin:<RELAY_ADMIN_PASSWORD>" \
  "https://bsky.network/admin/pds/unblock?host=pds2.poltr.info"
```

Source: `handleUnblockHost()` in [handlers_admin.go](https://github.com/bluesky-social/indigo/blob/main/cmd/relay/handlers_admin.go)

### Recovery Option 3: Unban a domain

If the entire `poltr.info` domain is banned:

```bash
# Relay admin runs:
curl -X POST -u "admin:<RELAY_ADMIN_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{"domain": "poltr.info"}' \
  "https://bsky.network/admin/subs/unbanDomain"
```

### Recovery Option 4: Force re-crawl

After un-throttling, if the relay doesn't reconnect automatically:

```bash
# Relay admin runs (bypasses normal crawl limits):
curl -X POST -u "admin:<RELAY_ADMIN_PASSWORD>" \
  -H "Content-Type: application/json" \
  -d '{"hostname": "https://pds2.poltr.info"}' \
  "https://bsky.network/admin/pds/requestCrawl"
```

### Other relay admin endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/admin/pds/list` | GET | List all PDS hosts with status and limits |
| `/admin/pds/changeLimits` | POST | Change account limit for a PDS |
| `/admin/pds/block?host=` | POST | Ban a host (kill connection) |
| `/admin/pds/unblock?host=` | POST | Unban a host |
| `/admin/pds/requestCrawl` | POST | Force re-crawl (bypasses limits) |
| `/admin/subs/killUpstream?host=` | POST | Kill firehose connection (add `&block=true` to also ban) |
| `/admin/subs/banDomain` | POST | Ban an entire domain |
| `/admin/subs/unbanDomain` | POST | Unban a domain |
| `/admin/repo/takeDown?did=` | POST | Take down a specific account |
| `/admin/repo/reverseTakedown?did=` | POST | Reverse an account takedown |

### How to contact Bluesky

1. Join the [PDS Admins Discord](https://discord.gg/e7hpHxRfBP)
2. Explain the situation: PDS hostname, what happened, how many accounts are affected
3. Ask them to check the host status and raise limits / unblock as needed
4. No formal SLA — response times vary

### Alternative: New hostname

If contacting Bluesky doesn't work or takes too long, using a **new hostname** (e.g. `pds2.poltr.info`) gives you a clean relay reputation. This requires:

1. New `did:plc` for the PDS (registered at plc.directory with new service endpoint)
2. Update `PDS_HOSTNAME`, `PDS_SERVICE_DID` in secrets
3. New Ingress rule for the new hostname
4. All existing accounts are lost (users must re-register)
5. Update DNS, TLS certs

## Troubleshooting

### Known Relay Behaviors

| Behavior | Detail |
|----------|--------|
| Subscription delay | 30–120 min after `requestCrawl` for new/unknown PDSes |
| Throttling | Hostname-based; spam detection flags rapid repo writes |
| Account limit | Default 100 per PDS; silently drops events for accounts beyond limit |
| Stub entries | AppView creates broken stubs if `#identity` processed before repo data available |
| No recovery from PDS | Throttled accounts and stub entries cannot be fixed from PDS side |
| Seq gap after reset | If PDS seq restarts at 1, relay skips events (expects higher seq from cursor) |
| Rate limiters in-memory | Reset on relay restart; sliding window, blocking (not dropping) |

### `ERR_STREAM_PREMATURE_CLOSE` in PDS logs

The WebSocket connection is being killed by nginx timeouts. Ensure the PDS has its own ingress with `proxy-read-timeout: "3600"` (see step 3).

### `RepoNotFound` on relay for all accounts

Multiple possible causes:
1. **PDS DID not set**: Check `curl https://pds2.poltr.info/xrpc/com.atproto.server.describeServer` returns the correct `did:plc`.
2. **DID not registered at plc.directory**: Check `curl https://plc.directory/<pds-server-did>` resolves.
3. **Relay never crawled the PDS**: Run `requestCrawl` (step 4).
4. **WebSocket timeouts**: Check PDS logs for stream errors (step 3).

If still `RepoNotFound` after a few hours:
1. Generate activity on the PDS (posts, profile updates)
2. Re-send `requestCrawl`
3. Restart PDS to re-trigger startup crawler notification: `kubectl rollout restart deployment/pds -n poltr`

### `RepoInactive: throttled` on relay

This can mean two different things (indistinguishable from outside):

1. **`host-throttled`** — PDS exceeded the 100-account limit. See [Recovering a Throttled PDS](#recovering-a-throttled-pds).
2. **`throttled`** — Temporary rate limiting from rapid repo writes. May clear on its own, but can also be permanent if the relay's spam detection flagged the hostname.

If ALL accounts (even account #1) show `throttled`, the hostname itself is likely flagged. Contact Bluesky team or use a new hostname.

### PDS sequencer cursor behind relay

If the PDS was reset or its data was modified, the sequencer (`repo_seq` table in `sequencer.sqlite`) may be behind the relay's cursor. The relay will skip events it has already seen.

**You cannot simply update `sqlite_sequence`** — the PDS resets this value from actual row data on restart.

To push the sequencer forward, write real records that generate events:

```bash
# For each account, update a record (e.g., bump the profile description)
# This creates real sequencer events that advance the cursor
```

### `did:web` doesn't work for the PDS

The Bluesky PDS image does not serve `/.well-known/did.json`, so `did:web` resolution fails. Always use `did:plc` for the PDS server DID.

## Account Indexing Race Condition

### The problem

When a third-party PDS creates a new account, the PDS emits two kinds of events on its firehose:

1. **Repo commit** — contains the actual data (e.g. the `app.bsky.actor.profile` record)
2. **`#identity` event** — signals that a DID exists and should be indexed

The Bluesky relay (`bsky.network`) forwards both events to the Bluesky AppView. The problem is **event ordering**: if the AppView processes the `#identity` event *before* the repo commit (with the profile record) is available on the relay, it creates a permanent broken "stub entry" for the account (`createdAt: 0001-01-01T00:00:00.000Z`). This stub can never be repaired from the PDS side — subsequent identity events or repo writes do not fix it.

```
PDS creates account
  ├── emits repo commit (profile record)
  └── emits #identity event
         │
         ▼
Relay receives both, but may forward #identity first
         │
         ▼
AppView processes #identity → tries to fetch repo from relay
  → repo commit not yet indexed on relay
  → creates permanent broken stub entry ✗
```

### The fix (registration flow)

The POLTR registration flow in `services/appview/src/auth/login.py` works around this with a carefully ordered sequence:

```
1. createAccount on PDS         — creates repo + emits initial #identity
2. wait_for_plc_resolution()    — ensure DID is resolvable on plc.directory
3. write profile record         — app.bsky.actor.profile/self via putRecord
4. relay_request_crawl()        — ask relay to crawl our PDS
5. wait_for_relay_repo_indexed()— poll relay's getLatestCommit until repo is confirmed
6. pds_admin_toggle_handle()    — emit a NEW #identity event via handle change
```

The critical insight is step 5→6: by waiting until the relay confirms it has the repo commit (`com.atproto.sync.getLatestCommit` returns 200), we ensure that when the AppView processes the *second* `#identity` event (from the handle toggle in step 6), the profile record is already available on the relay. The initial `#identity` event from step 1 may still create a stub, but the second identity event from step 6 repairs it because the repo data is now available.

### Key functions

| Function | File | Purpose |
|----------|------|---------|
| `wait_for_plc_resolution()` | `src/lib/atproto_api.py` | Polls `plc.directory/{did}` until 200 (up to 10s) |
| `wait_for_relay_repo_indexed()` | `src/lib/atproto_api.py` | Polls `bsky.network/xrpc/com.atproto.sync.getLatestCommit?did={did}` until 200 (up to 30s) |
| `pds_admin_toggle_handle()` | `src/lib/atproto_api.py` | Changes handle to `{base}-tmp.{domain}` then back, emitting two `#identity` events. Non-fatal. |
| `relay_request_crawl()` | `src/lib/atproto_api.py` | POSTs to `bsky.network/xrpc/com.atproto.sync.requestCrawl` |

### Accounts with existing stub entries

Accounts that already have a stub entry on the Bluesky AppView **cannot be fixed** from the PDS side. The following have been tried and do not work:

- Handle toggle (only works if the account has NO AppView entry at all)
- Writing/updating profile records
- Creating posts
- Account takedown/untakedown
- requestCrawl

These accounts would require intervention on the Bluesky AppView side (e.g. deleting the stub entry from their database).

## AppView Integration

The AppView registration flow (`services/appview/src/auth/login.py`) handles relay integration automatically. The key helper functions live in `services/appview/src/lib/atproto_api.py`:

```python
# Ask relay to crawl our PDS
await relay_request_crawl()

# Wait for relay to confirm it has the repo commit
await wait_for_relay_repo_indexed(user_session.did)

# Only then emit identity event
await pds_admin_toggle_handle(user_session.did, handle)
```

The AppView needs `PDS_HOSTNAME` and `PDS_ADMIN_PASSWORD` set in its environment for this to work.

## Environment Variables Reference

| Variable | Where | Purpose |
|----------|-------|---------|
| `PDS_SERVICE_DID` | pds-secrets | The `did:plc` of the PDS server |
| `PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX` | pds-secrets | secp256k1 private key for signing PLC operations |
| `PDS_CRAWLERS` | pds-secrets | Relay URL(s) to notify on PDS startup (e.g., `https://bsky.network`) |
| `PDS_HOSTNAME` | pds-secrets, appview-secrets | Public hostname of the PDS |
| `PDS_ADMIN_PASSWORD` | pds-secrets, appview env | Admin password for PDS management API (appview uses it for handle toggle) |
| `PDS_INTERNAL_URL` | pds-secrets, appview env | Internal K8s URL for PDS (e.g., `http://pds.poltr.svc.cluster.local`) |
| `BSKY_RELAY_URL` | appview env | Relay URL for requestCrawl and getLatestCommit (default: `https://bsky.network`) |

## Useful Commands

### Check relay status for a DID

```bash
# Detailed status
curl "https://bsky.network/xrpc/com.atproto.sync.getRepoStatus?did=<did>"

# Latest commit (confirms relay has repo data)
curl "https://bsky.network/xrpc/com.atproto.sync.getLatestCommit?did=<did>"

# Check profile on Bluesky
curl "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=<did>"
```

### PDS diagnostics

```bash
# PDS server DID
curl https://pds2.poltr.info/xrpc/com.atproto.server.describeServer | jq .did

# PLC document
curl https://plc.directory/did:plc:iwuulu67r3mcu4gv7ocn6yry

# List accounts on PDS
kubectl port-forward -n poltr svc/pds 2583:80
goat pds account list --pds-host http://localhost:2583
```

### Post-reset verification

```bash
# Port-forward to PDS
kubectl port-forward -n poltr svc/pds 2583:80

# Run full verification (creates test account, checks relay, cleans up)
PDS_ADMIN_PASSWORD=<pw> python infra/scripts/pds_reset.py --verify
```

## Scripts

| Script | Purpose |
|--------|---------|
| `infra/scripts/pds_reset.py` | Generate new PDS identity (`--verify` for post-reset check) |
| `infra/scripts/test_registration.py` | Full federation chain diagnostic |
| `infra/scripts/create_gov_handle.py` | Create governance account on PDS |

## Setup Checklist (Quick Reference)

For a fresh PDS or PDS reset:

- [ ] Generate secp256k1 rotation key (`PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX`)
- [ ] Register `did:plc` at plc.directory using the rotation key
- [ ] Set `PDS_SERVICE_DID` in pds-secrets to the registered `did:plc`
- [ ] Set `PDS_CRAWLERS` to `https://bsky.network`
- [ ] Deploy PDS with separate ingress (WebSocket timeouts: 3600s)
- [ ] Verify `describeServer` returns correct DID
- [ ] Verify `plc.directory/<did>` resolves to PDS endpoint
- [ ] Run `requestCrawl` against `bsky.network`
- [ ] Verify relay connects (check PDS logs for WebSocket upgrade / 101)
- [ ] Write `app.bsky.actor.profile/self` for each user account
- [ ] Verify profiles appear on bsky.app
- [ ] Monitor account count (plan for limit increase before 100)

## Custom Lexicons and Bluesky

POLTR uses its own AT Protocol namespace (`app.ch.poltr.*`):

- `app.ch.poltr.ballot.entry` - ballot/referendum entries
- `app.ch.poltr.ballot.like` - likes on ballots
- `app.ch.poltr.ballot.embed` - ballot embeds
- `app.ch.poltr.actor.pseudonym` - user pseudonyms

These records live in user repos on the PDS and are indexed by the POLTR AppView via the PDS firehose. Bluesky's AppView only indexes `app.bsky.*` records, so POLTR-specific records are invisible to Bluesky. This is by design — POLTR data stays in the POLTR ecosystem.

For making POLTR content visible on Bluesky, see the integration options below.

## Bluesky Integration Options

### Option 1: Cross-post with `embed.external` (Recommended)

Write a standard `app.bsky.feed.post` with an `app.bsky.embed.external` link card pointing back to POLTR.

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Volksinitiative: Autobahnausbau - Stimme jetzt ab!",
  "embed": {
    "$type": "app.bsky.embed.external",
    "external": {
      "uri": "https://poltr.ch/ballots/123",
      "title": "Autobahnausbau",
      "description": "Bundesbeschluss uber den Ausbau..."
    }
  },
  "createdAt": "2026-01-01T00:00:00Z"
}
```

### Option 2: Custom Feed Generator

Build a Bluesky feed generator that curates POLTR ballot posts into a subscribable "Swiss Referenda" feed.

### Option 3: Custom Embed Types (Future)

AT Protocol supports open unions for embeds. Once Bluesky ships custom embed fallback rendering, a native `app.ch.poltr.ballot.embed` could show rich ballot data on Bluesky.

## References

- [AT Protocol Federation](https://atproto.com/guides/overview)
- [PLC Directory](https://plc.directory)
- [did:plc Specification](https://web.plc.directory/spec/v0.1/did-plc)
- [Bluesky Rate Limits](https://docs.bsky.app/docs/advanced-guides/rate-limits)
- [Custom Schemas | Bluesky](https://docs.bsky.app/docs/advanced-guides/custom-schemas)
- [goat CLI](https://github.com/bluesky-social/goat)
- [Relay Source Code (indigo)](https://github.com/bluesky-social/indigo) — `cmd/relay/` for admin API, rate limits, account handling
- [PDS Admins Discord](https://discord.gg/e7hpHxRfBP)
- [pds-relay-probleme.md](./pds-relay-probleme.md) — Throttling, seq gaps, restore risks (German)
