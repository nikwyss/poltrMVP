# POLTR

ATProto-based civic-tech platform for Swiss referenda. Monorepo with custom services and third-party Bluesky services running on Kubernetes (Infomaniak Public Cloud).

## Repository Structure

```
poltr/
├── .github/workflows/     # CI/CD (build, push, deploy)
├── doc/                   # Documentation
│   ├── ARCHITECTURE.md    # Full system architecture
│   ├── TODO.md            # Task tracking
│   └── archive/           # Older docs
├── infra/                 # Infrastructure
│   ├── kube/              # K8s manifests (poltr.yaml, cronjobs, secrets)
│   ├── cert/              # cert-manager, letsencrypt, wildcard
│   ├── deployer/          # GHA deployer RBAC
│   └── scripts/           # One-off scripts (data import, postgres setup)
├── services/              # Application code
│   ├── front/             # Frontend (Next.js, React 19)
│   ├── appview/           # API service (Python, FastAPI)
│   ├── indexer/           # Firehose listener (Node.js)
│   ├── eidproto/          # Swiss eID prototype (Next.js)
│   └── cms/               # Payload CMS
├── CHANGELOG.md
└── CLAUDE.md
```

## Services

| Service | Tech | Endpoint |
|---------|------|----------|
| Frontend | Next.js + React 19 | poltr.ch |
| AppView | Python 3.11 + FastAPI | app.poltr.info |
| Indexer | Node.js | indexer.poltr.info |
| eID Proto | Next.js | eidproto.poltr.info |
| CMS | Payload CMS | cms.poltr.info |
| PDS | Bluesky PDS | pds.poltr.info |
| Ozone | Bluesky Ozone | ozone.poltr.info |
| Verifier | swiyu | verifier.poltr.info |

## Documentation

- **[Architecture](doc/ARCHITECTURE.md)** -- Full system overview, services, K8s resources, data flow
- **[TODO](doc/TODO.md)** -- Current tasks and completed work
- **[Load Balancing](doc/LOAD_BALANCING.md)** -- Ingress setup, hostPort vs LoadBalancer, cost breakdown
- **[Changelog](CHANGELOG.md)** -- Daily development log

Each service also has its own README in `services/*/README.md`.

## Quick Start

```bash
# Frontend
cd services/front && npm install && npm start
# → http://127.0.0.1:5173

# AppView
cd services/appview && pip install -r requirements.txt && uvicorn src.main:app --port 3000

# Port-forward cluster services
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432
kubectl port-forward -n poltr deployment/pds 2583:2583
```

## External Resources

- **AT Protocol:** https://atproto.com
- **Bluesky PDS:** https://github.com/bluesky-social/pds
- **Ozone:** https://github.com/bluesky-social/ozone
