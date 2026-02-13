# Domain Architecture

## Design Principle: Separate Handles from Infrastructure

User handles live on the trusted, public-facing **.ch** domain.
Infrastructure (PDS, AppView, etc.) runs on a separate, replaceable domain.

This separation provides:
- **Trust & recognition:** Users see `@name.id.smartvote.ch` — a known Swiss brand on a .ch domain
- **Sovereignty:** .ch is operated by SWITCH (Swiss foundation), not a US corporation
- **Migration-proof:** The PDS infrastructure domain can change without breaking any handles, @mentions, or profile links
- **Cost control:** No dependency on expensive gTLDs for user-facing identity

## Environments

| | Production | Test |
|---|---|---|
| **Frontend** | `smartvote.ch` | `poltr.ch` |
| **Handle domain** | `id.smartvote.ch` | `id.poltr.ch` |
| **User handles** | `@user.id.smartvote.ch` | `@user.id.poltr.ch` |
| **Infrastructure** | `*.smartvote.social` | `*.poltr.info` |
| **PDS** | `pds.smartvote.social` | `pds.poltr.info` |
| **AppView** | `app.smartvote.social` | `app.poltr.info` |
| **Ozone** | `mod.smartvote.social` | `ozone.poltr.info` |
| **Indexer** | `indexer.smartvote.social` | `indexer.poltr.info` |
| **eID Proto** | `eidproto.smartvote.social` | `eidproto.poltr.info` |
| **Verifier** | `verifier.smartvote.social` | `verifier.poltr.info` |
| **CMS** | `cms.smartvote.social` | `cms.poltr.info` |

## Handle Architecture (Subdomain Handles)

User handles use a dedicated subdomain on the .ch domain:

```
@hans.id.smartvote.ch              @hans.id.poltr.ch
  │     │     └── trusted domain     │     │     └── test domain
  │     └── handle subdomain         │     └── handle subdomain
  └── username                       └── username
```

Handle verification flow (same for both environments):

```
1. Resolver requests:  https://hans.id.smartvote.ch/.well-known/atproto-did
2. DNS resolves:       hans.id.smartvote.ch → CNAME → pds.smartvote.social
3. PDS responds with:  did:plc:abc123...
4. Handle verified ✅
```

The three identity layers are fully decoupled:

```
Handle (DNS):     @hans.id.smartvote.ch        ← stable, on your domain
DID (permanent):  did:plc:abc123               ← never changes
PDS (hosting):    pds.smartvote.social          ← replaceable infrastructure
```

## DNS Configuration

### Production: smartvote.ch (handle domain)

Managed in **AWS Route 53**. Only one record needed:

```dns
*.id.smartvote.ch.    CNAME    pds.smartvote.social.
```

No changes to the existing smartvote.ch website, www, mail, or any other records.

### Production: smartvote.social (infrastructure domain)

| Record | Type | Target |
|--------|------|--------|
| `pds.smartvote.social` | A | `<cluster-ip>` |
| `app.smartvote.social` | A | `<cluster-ip>` |
| `mod.smartvote.social` | A | `<cluster-ip>` |
| `indexer.smartvote.social` | A | `<cluster-ip>` |
| `eidproto.smartvote.social` | A | `<cluster-ip>` |
| `verifier.smartvote.social` | A | `<cluster-ip>` |
| `cms.smartvote.social` | A | `<cluster-ip>` |

### Test: poltr.ch (handle domain)

Managed in **Infomaniak DNS**. Only one record needed:

```dns
*.id.poltr.ch.    CNAME    pds.poltr.info.
```

### Test: poltr.info (infrastructure domain)

Already configured. Existing `*.poltr.info` subdomains continue as-is.

## PDS Configuration

### Production

```yaml
PDS_HOSTNAME: "pds.smartvote.social"
PDS_SERVICE_HANDLE_DOMAINS: ".id.smartvote.ch"
```

### Test

```yaml
PDS_HOSTNAME: "pds.poltr.info"
PDS_SERVICE_HANDLE_DOMAINS: ".id.poltr.ch"
```

## DIDs

### Production

| DID | Service |
|-----|---------|
| `did:web:app.smartvote.social` | AppView server identity |
| `did:web:pds.smartvote.social` | PDS server identity |
| `did:web:mod.smartvote.social` | Ozone moderation identity |
| `did:web:verifier.smartvote.social` | eID verifier identity |
| `did:web:eidproto.smartvote.social` | eID Proto identity |

### Test

| DID | Service |
|-----|---------|
| `did:web:app.poltr.info` | AppView server identity |
| `did:web:pds.poltr.info` | PDS server identity |
| `did:web:mod.poltr.info` | Ozone moderation identity |
| `did:web:labeler.poltr.info` | Labeler identity |
| `did:web:verifier.poltr.info` | eID verifier identity |
| `did:web:eidproto.poltr.info` | eID Proto identity |

## TLS Certificates

### Production

| Certificate | Domains | Challenge |
|-------------|---------|-----------|
| `smartvote-social-wildcard-tls` | `*.smartvote.social` | DNS-01 |
| `smartvote-ch-tls` | `smartvote.ch`, `www.smartvote.ch` | HTTP-01 |
| `smartvote-handle-tls` | `*.id.smartvote.ch` | DNS-01 |

### Test

| Certificate | Domains | Challenge |
|-------------|---------|-----------|
| `poltr-wildcard-tls` | `*.poltr.info` | DNS-01 |
| `poltr-ch-tls` | `poltr.ch`, `www.poltr.ch` | HTTP-01 |
| `poltr-handle-tls` | `*.id.poltr.ch` | DNS-01 |

## Domain Administration

| Domain | Registrar | DNS Management |
|--------|-----------|----------------|
| `smartvote.ch` | cyon AG (Basel) | AWS Route 53 |
| `smartvote.social` (or other) | TBD | TBD |
| `poltr.ch` | Infomaniak (GE) | Infomaniak DNS |
| `poltr.info` | Infomaniak (GE) | Infomaniak DNS |

## Email

| Address | Usage |
|---------|-------|
| `admin@poltr.info` | Let's Encrypt / cert-manager contact |
| `noreply@poltr.info` | Transactional emails (SMTP) |

## PDS Infrastructure Migration

If the infrastructure domain needs to change (e.g. from `smartvote.social` to another provider), only two things change:

1. **DNS at smartvote.ch:** Update the single CNAME record
   ```dns
   *.id.smartvote.ch.    CNAME    pds.new-provider.ch.
   ```
2. **DID documents:** Update PDS endpoint in DID records

Everything user-facing stays intact:

| | After migration |
|---|---|
| Handles (`@hans.id.smartvote.ch`) | unchanged |
| Old @mentions in posts | still resolve |
| Profile links | still work |
| Follows / likes / posts | intact (bound to DID) |
