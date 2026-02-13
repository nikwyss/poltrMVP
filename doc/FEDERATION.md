# Federation with Bluesky

How to set up a POLTR PDS so it federates with the Bluesky network. This document covers the full procedure for fresh PDS setups and PDS resets.

## Overview

For POLTR user profiles to be visible on bsky.app, the PDS must federate with the Bluesky relay (`bsky.network`). The relay subscribes to the PDS firehose (`com.atproto.sync.subscribeRepos` WebSocket) and forwards events to the Bluesky AppView, which indexes `app.bsky.*` records.

```
PDS (pds.poltr.info)
  │
  │  WebSocket firehose
  ▼
Relay (bsky.network)
  │
  ▼
Bluesky AppView (bsky.app)
```

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
- `alsoKnownAs`: `["at://pds.poltr.info"]`
- `services`: `{ "atproto_pds": { "type": "AtprotoPersonalDataServer", "endpoint": "https://pds.poltr.info" } }`
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
    "alsoKnownAs": ["at://pds.poltr.info"],
    "services": {
        "atproto_pds": {
            "type": "AtprotoPersonalDataServer",
            "endpoint": "https://pds.poltr.info"
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
PDS_HOSTNAME: "pds.poltr.info"
```

After updating secrets, restart the PDS:

```bash
kubectl rollout restart deployment/pds -n poltr
```

Verify the PDS reports the correct DID:

```bash
curl https://pds.poltr.info/xrpc/com.atproto.server.describeServer | jq .did
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
    - host: pds.poltr.info
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

Make sure `pds.poltr.info` is **not** also listed in the main `poltr-ingress` (which has default timeouts). Only one ingress should handle the PDS host.

Use `spec.ingressClassName: nginx` (not the deprecated `kubernetes.io/ingress.class` annotation).

### 4. Request relay crawl

Tell the Bluesky relay to discover and subscribe to the PDS:

```bash
curl -X POST https://bsky.network/xrpc/com.atproto.sync.requestCrawl \
  -H 'Content-Type: application/json' \
  -d '{"hostname": "pds.poltr.info"}'
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

## Troubleshooting

### `ERR_STREAM_PREMATURE_CLOSE` in PDS logs

The WebSocket connection is being killed by nginx timeouts. Ensure the PDS has its own ingress with `proxy-read-timeout: "3600"` (see step 3).

### `RepoNotFound` on relay for all accounts

Multiple possible causes:
1. **PDS DID not set**: Check `curl https://pds.poltr.info/xrpc/com.atproto.server.describeServer` returns the correct `did:plc`.
2. **DID not registered at plc.directory**: Check `curl https://plc.directory/<pds-server-did>` resolves.
3. **Relay never crawled the PDS**: Run `requestCrawl` (step 4).
4. **WebSocket timeouts**: Check PDS logs for stream errors (step 3).

### `RepoInactive: throttled` on relay

The relay has spam detection. If many repo writes happen in quick succession (e.g., batch profile updates), accounts may be throttled. This typically clears on its own after some time. Avoid rapid batch writes to multiple accounts.

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

## AppView Integration

The AppView calls `relay_request_crawl()` after new user registration to ensure the relay picks up the new repo. This is in `services/appview/src/lib/atproto_api.py`:

```python
async def relay_request_crawl(hostname: str | None = None):
    """Ask the Bluesky relay to crawl our PDS so new repos/records get indexed."""
    relay_url = os.getenv("BSKY_RELAY_URL", "https://bsky.network")
    pds_hostname = hostname or os.getenv("PDS_HOSTNAME")
    ...
    resp = await client.post(
        f"{relay_url}/xrpc/com.atproto.sync.requestCrawl",
        json={"hostname": pds_hostname},
    )
```

The AppView needs `PDS_HOSTNAME` set in its environment for this to work.

## Environment Variables Reference

| Variable | Where | Purpose |
|----------|-------|---------|
| `PDS_SERVICE_DID` | pds-secrets | The `did:plc` of the PDS server |
| `PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX` | pds-secrets | secp256k1 private key for signing PLC operations |
| `PDS_CRAWLERS` | pds-secrets | Relay URL(s) to notify on PDS startup (e.g., `https://bsky.network`) |
| `PDS_HOSTNAME` | pds-secrets, appview-secrets | Public hostname of the PDS |
| `PDS_ADMIN_PASSWORD` | pds-secrets | Admin password for PDS management API |
| `BSKY_RELAY_URL` | appview env | Relay URL for requestCrawl (default: `https://bsky.network`) |

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
- [Custom Schemas | Bluesky](https://docs.bsky.app/docs/advanced-guides/custom-schemas)
- [goat CLI](https://github.com/bluesky-social/goat)
