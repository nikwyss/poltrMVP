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