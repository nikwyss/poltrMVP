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

## Ballot Management

Ballots are managed in **Payload CMS** (`services/cms`), not as ATProto records. The CMS is the single source of truth for ballot content.

### Flow

1. Admin creates/edits ballot in CMS (`/admin/collections/ballots`)
2. Admin sets status to "published" → `afterChange` hook creates a PDS governance account
3. AppView reads ballots from CMS API, enriches with argument/comment counts from DB
4. Users write arguments/comments → stored in the ballot's governance account on PDS

### Key files

| File | Role |
|------|------|
| `services/cms/src/collections/Ballots.ts` | Ballot collection + publish hook |
| `services/cms/src/lib/atproto-publish.ts` | Governance account creation (PDS + DB) |
| `services/appview/src/routes/participation/ballots.py` | Ballot endpoints (proxy CMS + enrich counts) |

## Governance Model: Per-Ballot Accounts

Each ballot has its own PDS governance account. The account holds all arguments, review invitations/responses, and Bluesky cross-posts for that ballot.

- **Handle schema:** `ballot-{id}.id.poltr.ch` (id = CMS ballot ID)
- **Credentials:** Encrypted in `auth.governance_accounts` table (using `APPVIEW_PDS_CREDS_MASTER_KEY_B64`). Indexer has column-level SELECT on `did`, `handle`, `ballot_rkey` only
- **Created by:** CMS publish hook (TypeScript) or AppView `create_ballot_account()` (Python)

### How records are routed

All governance functions (`create_governance_record`, `put_governance_record`) require an explicit `did` parameter. The caller resolves the governance DID via:
- `get_did_for_ballot(ballot_id)` — for argument creation (ballot_id = CMS ID)
- `app_arguments.did` column — for review submission
- `governance_accounts` table — for crossposting

### Bluesky Integration

- **Argument crossposting:** Arguments are cross-posted as standalone Bluesky posts under their governance account (`services/appview/src/participation/crosspost.py`)
- **External comment import:** The Bluesky poller (`services/indexer/src/bsky_poller.js`) polls cross-posted argument threads for replies and imports them as external comments (`origin = 'extern'` in `app_comments`). Controlled by `BSKY_POLL_ENABLED` env var
- **No ballot crossposting:** Ballots are CMS content and are not posted to Bluesky

## Architecture

```
CMS (Ballot content)
       │
       ▼
Frontend/eID Proto
       │
       ▼
    AppView ──► Ozone (moderation/labels)
       │
       ▼
   PostgreSQL ◄── Indexer ◄── PDS (firehose)
       │                       │
       ▼                       ▼
    Verifier              Per-ballot governance
    (Swiss eID)           accounts (one per Vorlage)
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

### Peer Review Import

Script: `infra/scripts/import_peerreviews.py`

Imports historical peer-review data from Demokratiefabrik xlsx dumps into a ballot-specific governance account as `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` records. Credentials are loaded from the `auth.governance_accounts` table.

**Prerequisites:**
- Port-forward PDS: `kubectl port-forward -n poltr svc/pds 2583:80`
- Port-forward PostgreSQL: `kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432`
- xlsx files in `dump/`: `content_peerreview.xlsx`, `content_peerreview_progression.xlsx`
- Python deps: `openpyxl`, `requests`, `psycopg2`, `pynacl`

**Usage:**
```bash
PDS_HOST=http://localhost:2583 \
DB_URL=postgresql://allforone:<pw>@localhost:5432/appview \
BALLOT_RKEY=663 \
MASTER_KEY_B64=<APPVIEW_PDS_CREDS_MASTER_KEY_B64> \
MAX_RESPONSES=1 \
python3 infra/scripts/import_peerreviews.py
```

| Env var | Description | Default |
|---------|-------------|---------|
| `PDS_HOST` | PDS endpoint | `http://localhost:2583` |
| `DB_URL` | PostgreSQL connection URL | — |
| `BALLOT_RKEY` | Ballot rkey (credentials loaded from `auth.governance_accounts`) | — |
| `MASTER_KEY_B64` | `APPVIEW_PDS_CREDS_MASTER_KEY_B64` for decryption | — |
| `MAX_RESPONSES` | Limit responses imported (0 = all) | `0` |
| `DRY_RUN` | `true` to inspect without writing | `false` |

Uses `createRecord` with composed rkeys (`{content_id}-{did_suffix}`), so re-runs are idempotent.

# DB Setup Script
Keep ./scripts/postgres/db-setup.sql file up to date. (it should entail an all setup script for an empty postgres DB.)

# Much more to read is in the ./doc folder.

# Changelog
There is the CHANGELOG.md on the root level

# don't commit.
don't ask to comitt results. (i will review your changes manually and commit myself.)
