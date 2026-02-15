# POLTR

ATProto-based civic-tech platform for Swiss referenda. Monorepo with custom services and third-party Bluesky services running on Kubernetes (Infomaniak Public Cloud).

## Services

| Service | Path | Tech | Endpoint |
|---------|------|------|----------|
| Frontend | `services/front` | Next.js + React 19 | poltr.ch |
| AppView | `services/appview` | Python 3.11 + FastAPI | app.poltr.info |
| Indexer | `services/indexer` | Node.js | indexer.poltr.info |
| eID Proto | `services/eidproto` | Next.js | eidproto.poltr.info |
| PDS | (bluesky image) | Bluesky PDS | pds2.poltr.info |
| Ozone | (bluesky image) | Moderation/Labeling | ozon.poltr.info |
| Verifier | (swiyu image) | Swiss eID verification | verifier.poltr.info |
| PostgreSQL | - | Shared database | internal |

## Kubernetes

- **Namespace:** `poltr`
- **Main manifest:** `infra/kube/poltr.yaml`
- **Cronjobs:** `infra/kube/cronjobs.yaml`
- **Secrets template:** `infra/kube/secrets.yaml.dist`

Common commands:
```bash
kubectl get pods -n poltr
kubectl get all -n poltr
kubectl logs -n poltr <pod-name>
kubectl describe pod -n poltr <pod-name>
```

## Tools

- **goat** - AT Protocol CLI (`go install github.com/bluesky-social/goat@latest`)
  - `goat get at://...` - fetch records
  - `goat firehose` - watch network firehose
  - `goat pds` - PDS admin commands

### PDS Administration with goat

The PDS admin API is only accessible via the internal K8s URL (`pds.poltr.svc.cluster.local`).
For local dev, port-forward first:
```bash
kubectl port-forward -n poltr svc/pds 2583:80
```

Then use goat with `--pds-host` and `--admin-password` (from `PDS_ADMIN_PASSWORD` in appview `.env`):

```bash
# List all accounts
goat pds account list --pds-host http://localhost:2583

# Get detailed info for an account (includes email, handle, invites)
goat pds admin account info --pds-host http://localhost:2583 --admin-password <PDS_ADMIN_PASSWORD> <did>

# List accounts via admin (supports filtering, e.g. takendown)
goat pds admin account list --pds-host http://localhost:2583 --admin-password <PDS_ADMIN_PASSWORD>

# Delete an account
goat pds admin account delete --pds-host http://localhost:2583 --admin-password <PDS_ADMIN_PASSWORD> <did>

# Create an account (auto-generates invite code)
goat pds admin account create --pds-host http://localhost:2583 --admin-password <PDS_ADMIN_PASSWORD> ...

# Create invite codes
goat pds admin create-invites --pds-host http://localhost:2583 --admin-password <PDS_ADMIN_PASSWORD>
```

For production, replace `--pds-host` with the internal URL or use an active port-forward.

### PDS Authentication Model

The PDS has **two distinct auth layers** — using the wrong one will return `InvalidToken`:

| Auth type | Format | Works for |
|-----------|--------|-----------|
| Admin Basic auth | `Authorization: Basic base64("admin:<PDS_ADMIN_PASSWORD>")` | `com.atproto.admin.*` endpoints only (account management, invite codes, handle updates) |
| User Bearer JWT | `Authorization: Bearer <accessJwt>` | `com.atproto.repo.*` endpoints (create/delete/put records, applyWrites) |

**Admin auth does NOT work for repo operations.** To modify a user's repo (delete records, write records), you must obtain a user session JWT.

### Obtaining a User Session via Admin

When you don't have the user's password, use this two-step approach:

```bash
# 1. Set a temporary password via admin API
AUTH=$(echo -n "admin:<PDS_ADMIN_PASSWORD>" | base64)
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Basic ${AUTH}" \
  "http://localhost:2583/xrpc/com.atproto.admin.updateAccountPassword" \
  -d '{"did":"<DID>","password":"TempPass12345678"}'

# 2. Create a session with the temporary password
curl -s -X POST \
  -H "Content-Type: application/json" \
  "http://localhost:2583/xrpc/com.atproto.server.createSession" \
  -d '{"identifier":"<DID>","password":"TempPass12345678"}'
# Returns JSON with accessJwt — use as Bearer token for repo operations
```

**Remember to reset the password afterwards** if the account is actively used.

### Record Management via XRPC

```bash
# List records (public, no auth needed)
curl -s "https://pds2.poltr.info/xrpc/com.atproto.repo.listRecords?repo=<DID>&collection=<NSID>&limit=100"
# Paginate with &cursor=<cursor> from previous response

# Delete a record (requires user Bearer JWT)
curl -s -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <accessJwt>" \
  "http://localhost:2583/xrpc/com.atproto.repo.deleteRecord" \
  -d '{"repo":"<DID>","collection":"<NSID>","rkey":"<RKEY>"}'
```

### Record Management with goat

```bash
# List all collections for an account
goat record list --collections <handle>

# List all records (default limit 25, no pagination flag)
goat record list <handle>

# List records in a specific collection
goat record list --collection <NSID> <handle>

# Resolve a handle to its DID document
goat resolve <handle>
```

**Note:** `goat record delete` requires being authenticated as the account owner (via `goat account login`). For bulk admin operations, use the XRPC approach above.

## Architecture

```
Frontend/eID Proto
       │
       ▼
    AppView ──► Ozone (moderation/labels)
       │
       ▼
   PostgreSQL ◄── Indexer ◄── PDS (firehose)
       │
       ▼
    Verifier (Swiss eID)
```


## Ozone:

Manuals:
https://github.com/bluesky-social/ozone/blob/main/docs/userguide.md
https://github.com/bluesky-social/ozone/blob/main/docs/moderation_states.png
https://github.com/bluesky-social/ozone/blob/main/docs/api.md


## PDS — Critical: Do Not Break Relay Federation

The Bluesky relay (`bsky.network`) permanently throttles accounts if it sees an `#identity` event before the repo is ready. This is **unrecoverable** — requires a full PDS reset with new server DID.

**NEVER do these without following the reset procedure in `doc/FEDERATION.md`:**
- Delete or wipe `pds-data` PVC
- Rotate PDS server DID or rotation key
- Restore PDS from backup

**Safe operations (no risk):**
- Restart PDS pod (`kubectl rollout restart`)
- Create accounts via the AppView registration flow (`login.py` handles the race condition)
- Write records (profiles, posts, likes)
- `requestCrawl`

**If a PDS reset is needed:** use `infra/scripts/pds_reset.py` — see `doc/RELAY_BLUESKY.md`.

# DB Setup Script
Keep ./scripts/postgres/db-setup.sql file up to date. (it should entail an all setup script for an empty postgres DB.)

# Much more to read is in the ./doc folder.

# Changelog
There is the CHANGELOG.md on the root level

# don't commit.
don't ask to comitt results. (i will review your changes manually and commit myself.)
