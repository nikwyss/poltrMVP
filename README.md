# POLTR

ATProto-based civic-tech platform for Swiss referenda. Monorepo with custom services and third-party Bluesky services running on Kubernetes (Infomaniak Public Cloud).


![POLTR technical architecture poster](https://raw.githubusercontent.com/wiki/nikwyss/poltrMVP/images/poltr-poster_tech.svg)


## Repository Structure

```
poltr/
├── .github/workflows/     # CI/CD (build, push, deploy)
├── doc/                   # Documentation
│   ├── ARCHITECTURE.md    # Full system architecture
│   ├── TODO.md            # Task tracking
│   └── archive/           # Older docs
├── infra/                 # Infrastructure
│   ├── kube/              # K8s manifests (one file per service, cronjobs, secrets)
│   ├── cert/              # cert-manager, letsencrypt, wildcard
│   ├── deployer/          # GHA deployer RBAC
│   └── scripts/           # One-off scripts (data import, postgres setup)
├── services/              # Application code
│   ├── frontend/          # Frontend (Next.js, React 19)
│   ├── appview/           # API service — read/write bridge (Python, FastAPI)
│   ├── indexer/           # Firehose listener, builds read index (Node.js)
│   ├── community-writer/  # Gatekeeper — vets submissions, writes accepted ones (Python)
│   ├── calculator/        # Top-down taxonomy compute (Python, FastAPI)
│   ├── cms/               # Ballot content — source of truth (Payload CMS)
│   └── eidproto/          # Swiss eID prototype (Next.js)
├── CHANGELOG.md
└── CLAUDE.md
```

## Services

| Service | Tech | Endpoint |
|---------|------|----------|
| Frontend | Next.js + React 19 | poltr.ch |
| AppView | Python 3.11 + FastAPI | app.poltr.info |
| Indexer | Node.js | indexer.poltr.info |
| Community Writer | Python | internal |
| Calculator | Python 3.11 + FastAPI | calculator.poltr.info |
| CMS | Payload CMS | cms.poltr.info |
| PDS | Bluesky PDS | pds2.poltr.info |
| Ozone | Bluesky Ozone | ozon.poltr.info |
| PostgreSQL | Shared database | internal |
| eID Proto _(optional)_ | Next.js | eidproto.poltr.info |
| Verifier _(optional)_ | swiyu | verifier.poltr.info |

## Documentation

- **[Wiki](https://github.com/nikwyss/poltrMVP/wiki/)** — Full system overview
- **[Changelog](CHANGELOG.md)** — Daily development log

Each service also has its own README in `services/*/README.md`.


## External Resources

- **AT Protocol:** https://atproto.com
- **Bluesky PDS:** https://github.com/bluesky-social/pds
- **Ozone:** https://github.com/bluesky-social/ozone
