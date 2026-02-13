# POLTR

ATProto-based civic-tech platform for Swiss referenda. Monorepo with custom services and third-party Bluesky services running on Kubernetes (Infomaniak Public Cloud).

## Services

| Service | Path | Tech | Endpoint |
|---------|------|------|----------|
| Frontend | `services/front` | Next.js + React 19 | poltr.ch |
| AppView | `services/appview` | Python 3.11 + FastAPI | app.poltr.info |
| Indexer | `services/indexer` | Node.js | indexer.poltr.info |
| eID Proto | `services/eidproto` | Next.js | eidproto.poltr.info |
| PDS | (bluesky image) | Bluesky PDS | pds.poltr.info |
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


# DB Setup Script
Keep ./scripts/postgres/db-setup.sql file up to date. (it should entail an all setup script for an empty postgres DB.)

# Much more to read is in the ./doc folder.

# Changelog
There is the CHANGELOG.md on the root level

# don't commit.
don't ask to comitt results. (i will review your changes manually and commit myself.)
