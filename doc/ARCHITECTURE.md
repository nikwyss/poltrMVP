# POLTR Architecture

## System Overview

POLTR is an ATProto-based civic-tech platform for Swiss referenda running as a monorepo with multiple services deployed on Kubernetes.

## Components

### Custom Services (Monorepo)

#### 1. Frontend (`services/front`)
- **Tech Stack:** React 19, TypeScript, Vite
- **Purpose:** User-facing web application
- **Auth:** AT Protocol OAuth with PKCE
- **Deployment:** Docker + Nginx
- **Endpoints:** https://poltr.ch

#### 2. AppView (`services/appview`)
- **Tech Stack:** Python 3.11, FastAPI, asyncpg
- **Purpose:** Application logic and read APIs
- **Database:** PostgreSQL (shared with indexer)
- **APIs:** Custom lexicons for proposals, arguments, likes
- **Port:** 3000

#### 3. Indexer (`services/indexer`)
- **Purpose:** Firehose listener and data synchronization
- **Functions:**
  - Subscribes to PDS firehose
  - Indexes records into PostgreSQL
  - (Planned) Subscribe to global Bluesky Jetstream
- **Database:** PostgreSQL (shared with appview)

### Third-Party Images

#### 4. Bluesky PDS
- **Image:** Official Bluesky PDS
- **Purpose:** Personal Data Server (user identity & data)
- **Storage:** SQLite (embedded)
- **Endpoint:** https://poltr.info
- **Config:**
  - Service handle domains: `.poltr.info`
  - Invite required: false (open registration)

#### 5. PostgreSQL
- **Purpose:** Shared database for appview and indexer
- **Deployment:** `allforone-postgres`
- **Port:** 5432

## Architecture Diagram

```
┌─────────────────┐
│   Users/Web     │
└────────┬────────┘
         │
    ┌────▼─────┐
    │ Frontend │  (React + OAuth)
    │ poltr.ch │
    └────┬─────┘
         │
    ┌────▼─────────┐
    │   AppView    │◄──┐
    │   (API)      │   │
    └────┬─────────┘   │
         │             │
    ┌────▼─────────┐   │
    │  PostgreSQL  │◄──┤
    └──────────────┘   │
                       │
    ┌──────────────┐   │
    │   Indexer    │───┘
    │  (Firehose)  │
    └────▲─────────┘
         │
    ┌────┴─────────┐
    │ Bluesky PDS  │
    │ poltr.info   │
    │  (SQLite)    │
    └──────────────┘
```

## Data Flow

1. **User Authentication:** Frontend → PDS (OAuth)
2. **User Actions:** Frontend → AppView → PostgreSQL
3. **Data Sync:** PDS Firehose → Indexer → PostgreSQL
4. **Read Operations:** Frontend → AppView → PostgreSQL
5. **(Planned) Global Firehose:** Bluesky Jetstream → Indexer → PostgreSQL

## AT Protocol Integration

### Custom Lexicons
- Proposals (`app.ch.poltr.proposal`)
- Arguments (`app.ch.poltr.argument`)
- Likes and interactions

### Identity & Auth
- DID-based user identity
- Email-only / magic-link authentication
- Pseudonymous participation
- App password support for third-party clients

## Infrastructure

### Deployment
- **Platform:** Kubernetes (Infomaniak Public Cloud)
- **Namespace:** `poltr`
- **Ingress:** NGINX with Let's Encrypt TLS
- **CI/CD:** GitHub Actions (`.github/workflows/build-and-push-services.yml`)

### Storage
- **PDS Data:** PersistentVolume (SQLite databases and blobs)
- **App Data:** PostgreSQL database
- **Tokens:** IndexedDB (browser-side)

### Domains
- `poltr.ch` → Frontend
- `poltr.info` → PDS

## Development

### Local Setup
Each service has its own README with setup instructions:
- `services/front/README.md`
- `services/appview/README.md`
- `services/indexer/README.md`

### Port Forwarding (Development)
```bash
# PDS access
kubectl port-forward -n poltr deployment/pds 2583:2583

# PostgreSQL access
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432
```

## Security Considerations

- PKCE flow for OAuth (public client)
- DPoP-bound access tokens
- No server-side secrets in frontend
- TLS/HTTPS for all production endpoints
- Kubernetes RBAC for deployments

## Future Enhancements

1. **Global Visibility:** Subscribe to Bluesky Jetstream for cross-network interactions
2. **Moderation:** Labels, takedown flows, governance rules
3. **Backfill:** Nightly task for missed firehose events
4. **Service Separation:** Split indexer and appview for independent scaling
