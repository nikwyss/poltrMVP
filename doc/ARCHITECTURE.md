# POLTR Architecture

## System Overview

POLTR is an ATProto-based civic-tech platform for Swiss referenda running as a monorepo with multiple services deployed on Kubernetes (Infomaniak Public Cloud).

**Namespace:** `poltr`
**Main manifest:** `infra/kube/poltr.yaml`
**Cronjobs:** `infra/kube/cronjobs.yaml`

## Services

### Custom Services (Monorepo)

#### 1. Frontend (`services/front`)
- **Tech Stack:** Next.js 16, React 19, TypeScript
- **Purpose:** User-facing web application with server-side rendering
- **Auth:** AT Protocol OAuth with PKCE; session token in httpOnly cookie (server-side proxy)
- **API Proxy:** All AppView calls go through Next.js API routes (`/api/xrpc/...`), cookie forwarded as Bearer token
- **CMS Integration:** Fetches pages server-side from CMS (Payload CMS)
- **Deployment:** Node.js standalone (`node server.js`)
- **Image:** `ghcr.io/nikwyss/poltr-front:latest`
- **Port:** 3000
- **Secrets:** `front-secrets`
- **Endpoint:** https://poltr.ch, https://www.poltr.ch

#### 2. AppView (`services/appview`)
- **Tech Stack:** Python 3.11, FastAPI, asyncpg
- **Purpose:** Application logic and read APIs
- **Database:** PostgreSQL (shared with indexer)
- **APIs:** Custom lexicons for proposals, arguments, likes
- **Image:** `ghcr.io/nikwyss/poltr-appview:latest`
- **Port:** 3000
- **Secrets:** `appview-secrets` + refs to `pds-secrets` (PDS_ADMIN_PASSWORD, PDS_HOSTNAME, PDS_INTERNAL_URL, PDS_GOVERNANCE_ACCOUNT_DID)
- **Endpoint:** https://app.poltr.info

#### 3. Indexer (`services/indexer`)
- **Tech Stack:** Node.js
- **Purpose:** Firehose listener and data synchronization
- **Functions:**
  - Subscribes to PDS firehose
  - Indexes records into PostgreSQL
  - Backfill endpoint (`/backfill`) triggered by cronjob
- **Image:** `ghcr.io/nikwyss/poltr-indexer:latest`
- **Port:** 3000
- **Secrets:** `indexer-secrets`
- **Endpoint:** https://indexer.poltr.info

#### 4. eID Proto (`services/eidproto`)
- **Tech Stack:** Next.js
- **Purpose:** Swiss eID prototype / integration service: => adds verification record to pds.
- **Image:** `ghcr.io/nikwyss/poltr-eidproto:latest`
- **Port:** 3000
- **Secrets:** `eidproto-secrets`
- **Endpoint:** https://eidproto.poltr.info

### Third-Party Images

#### 5. Bluesky PDS
- **Image:** `ghcr.io/bluesky-social/pds:latest`
- **Purpose:** Personal Data Server (user identity & data)
- **Storage:** PVC `pds-data` (1Gi) mounted at `/data`
- **Port:** 2583
- **Secrets:** `pds-secrets`
- **Endpoint:** https://pds.poltr.info
- **Config:**
  - Service handle domains: `.poltr.info`
  - Wildcard ingress: `*.poltr.info` routes to PDS for handle resolution

#### 6. Ozone
- **Image:** `ghcr.io/bluesky-social/ozone:latest`
- **Purpose:** Moderation and labeling service
- **Port:** 3000
- **Secrets:** `ozone-secrets`
- **Dependencies:** ozone-redis
- **Endpoint:** https://ozone.poltr.info

#### 7. Ozone Redis
- **Image:** `redis:7-alpine`
- **Purpose:** In-memory cache for Ozone (ephemeral, no persistence)
- **Port:** 6379
- **Config:** `--save "" --appendonly no`

#### 8. Verifier
- **Image:** `ghcr.io/swiyu-admin-ch/swiyu-verifier:latest`
- **Purpose:** Swiss eID (swiyu) credential verification
- **Port:** 8080
- **Secrets:** `verifier-secrets` + refs to `allforone-postgres-secret`
- **Database:** PostgreSQL `verifier` database (via JDBC)
- **Config:** `verifier-service-metadata` ConfigMap with OpenID client metadata
- **Endpoint:** https://verifier.poltr.info

#### 9. CMS
- **Image:** `ghcr.io/nikwyss/poltr-cms:latest`
- **Purpose:** Payload CMS for content management (pages, blocks, media)
- **Port:** 3000
- **Secrets:** `cms-secrets`
- **Storage:** PVC `cms-media` (2Gi) mounted at `/app/media`
- **Admin UI:** https://cms.poltr.info/admin
- **API:** https://cms.poltr.info/api/pages, /api/blocks, /api/globals/settings
- **Endpoint:** https://cms.poltr.info

#### 10. PostgreSQL
- **Image:** `postgres:15-alpine`
- **Purpose:** Shared database for appview, indexer, and verifier
- **Deployment name:** `allforone-postgres`
- **Port:** 5432
- **Secrets:** `allforone-postgres-secret`
- **Storage:** PVC `allforone-postgres-data` (5Gi)

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                        INGRESS (nginx)                       │
│   poltr.ch / www.poltr.ch  │  *.poltr.info (subdomains)     │
└──────┬──────────────────────────────┬────────────────────────┘
       │                              │
       ▼                              ▼
┌─────────────┐    ┌────────┐  ┌────────────┐  ┌──────────────┐
│  Frontend   │─ ─▶│  CMS   │  │  eID Proto │  │    Ozone     │
│  (Next.js)  │    │(Payload│  │  (Next.js) │  │ (Moderation) │
│  poltr.ch   │    │  CMS)  │  │eidproto.   │  │ozone.poltr.  │
└──────┬──────┘    │cms.    │  │poltr.info  │  │    info       │
       │           │poltr.  │  └─────┬──────┘  └──────┬───────┘
       │           │info    │        │                │
       │           └────────┘        │          ┌─────▼──────┐
       ▼                             │          │Ozone Redis │
┌─────────────┐                      │          └────────────┘
│   AppView   │                      │
│  (FastAPI)  │                      │
│ app.poltr.  │                      │
│    info     │                      │
└──────┬──────┘                      │
       │                             │
       ▼                             ▼
┌─────────────┐              ┌──────────────┐
│ PostgreSQL  │              │   Verifier   │
│ (postgres:  │              │   (swiyu)    │
│  15-alpine) │◄──┐          │verifier.     │
└─────────────┘   │          │poltr.info    │
       ▲          │          └──────────────┘
       │          │                 │
┌──────┴──────┐   │                 │
│   Indexer   │───┘                 │
│ (Firehose)  │                     │
│ indexer.    │                     │
│ poltr.info  │                     │
└──────▲──────┘                     │
       │                            │
┌──────┴──────┐                     │
│ Bluesky PDS │                     │
│ pds.poltr.  │◄────────────────────┘
│    info     │
│*.poltr.info │
└─────────────┘
```

## Data Flow

1. **User Authentication:** Frontend --> PDS (AT Protocol OAuth with PKCE + DPoP)
2. **User Actions:** Frontend --> Next.js API routes --> AppView --> PostgreSQL
3. **Data Sync:** PDS Firehose --> Indexer --> PostgreSQL
4. **Content Pages:** Frontend --> CMS API (server-side fetch)
5. **Moderation:** AppView --> Ozone (labels and moderation actions)
6. **eID Verification:** eID Proto --> Verifier --> swiyu trust infrastructure
7. **Read Operations:** Frontend --> AppView --> PostgreSQL
8. **Backfill:** CronJob --> Indexer `/backfill` endpoint (hourly)

## Kubernetes Resources

### Persistent Volume Claims

| PVC | Size | Used by | Mount path |
|-----|------|---------|------------|
| `pds-data` | 1Gi | PDS | `/data` |
| `cms-media` | 2Gi | CMS | `/app/media` |
| `allforone-postgres-data` | 5Gi | PostgreSQL | `/var/lib/postgresql/data` |

### Secrets

| Secret | Used by |
|--------|---------|
| `pds-secrets` | PDS, AppView (cross-ref) |
| `allforone-postgres-secret` | PostgreSQL, Verifier (cross-ref) |
| `indexer-secrets` | Indexer |
| `appview-secrets` | AppView |
| `verifier-secrets` | Verifier |
| `ozone-secrets` | Ozone |
| `front-secrets` | Frontend |
| `eidproto-secrets` | eID Proto |
| `cms-secrets` | CMS |
| `ghcr-registry` | Image pull secret (AppView, Frontend, eID Proto, CMS) |

### ConfigMaps

| ConfigMap | Used by | Purpose |
|-----------|---------|---------|
| `verifier-service-metadata` | Verifier | OpenID client metadata JSON |

### CronJobs

| Name | Schedule | Purpose |
|------|----------|---------|
| `indexer-backfill-nightly` | Every hour (`0 * * * *`) | Triggers indexer backfill via `curl POST http://indexer.poltr.svc.cluster.local/backfill` |

### Ingress

Single `poltr-ingress` with nginx ingress class and cert-manager (Let's Encrypt DNS-01).

**TLS Certificates:**
- `poltr-wildcard-tls` -- `*.poltr.info` (wildcard)
- `poltr-ch-tls` -- `poltr.ch`, `www.poltr.ch`

**Routing Rules:**

| Host | Service | Port |
|------|---------|------|
| `poltr.ch` | frontend | 80 |
| `www.poltr.ch` | frontend | 80 |
| `pds.poltr.info` | pds | 80 |
| `indexer.poltr.info` | indexer | 80 |
| `app.poltr.info` | appview | 80 |
| `verifier.poltr.info` | verifier-service | 80 |
| `eidproto.poltr.info` | eidproto | 80 |
| `ozone.poltr.info` | ozone | 80 |
| `cms.poltr.info` | cms | 80 |
| `*.poltr.info` (wildcard) | pds | 80 |

The wildcard rule is a catch-all so that `<handle>.poltr.info` resolves to the PDS for AT Protocol handle verification.

### Internal Service DNS

Services communicate within the cluster using internal DNS names:

| Service | Internal URL |
|---------|-------------|
| PDS | `http://pds.poltr.svc.cluster.local` |
| PostgreSQL | `allforone-postgres.poltr.svc.cluster.local:5432` |
| Indexer | `http://indexer.poltr.svc.cluster.local` |
| AppView | `http://appview.poltr.svc.cluster.local` |
| Verifier | `http://verifier-service.poltr.svc.cluster.local` |
| Ozone | `http://ozone.poltr.svc.cluster.local` |
| Ozone Redis | `ozone-redis.poltr.svc.cluster.local:6379` |
| Frontend | `http://frontend.poltr.svc.cluster.local` |
| eID Proto | `http://eidproto.poltr.svc.cluster.local` |
| CMS | `http://cms.poltr.svc.cluster.local` |

Within the same namespace, the short form also works (e.g. `http://cms`).

## AT Protocol Integration

### Custom Lexicons
- Proposals (`app.ch.poltr.proposal`)
- Arguments (`app.ch.poltr.argument`)
- Likes and interactions

### Identity & Auth
- DID-based user identity
- AT Protocol OAuth with PKCE + DPoP-bound tokens
- Pseudonymous participation
- Handle resolution via `*.poltr.info` wildcard DNS

## Development

### Local Setup
Each service has its own README with setup instructions:
- `services/front/README.md`
- `services/appview/README.md`
- `services/indexer/README.md`

### Port Forwarding
```bash
# PDS access
kubectl port-forward -n poltr deployment/pds 2583:2583

# PostgreSQL access
kubectl port-forward -n poltr deployment/allforone-postgres 5432:5432

# CMS access
kubectl port-forward -n poltr deployment/cms 3001:3000
```

### Common kubectl Commands
```bash
kubectl get pods -n poltr
kubectl get all -n poltr
kubectl logs -n poltr <pod-name>
kubectl describe pod -n poltr <pod-name>
kubectl rollout restart deployment/<name> -n poltr
```

## Security Considerations

- PKCE flow for OAuth (public client)
- DPoP-bound access tokens
- Session tokens in httpOnly cookies (not accessible to client JS)
- AppView URL is server-only (not exposed to browser)
- TLS/HTTPS for all production endpoints (cert-manager + Let's Encrypt)
- Kubernetes RBAC for deployments
- Non-root container user for frontend (nextjs:1001)
- Swiss eID verification via swiyu trust infrastructure
