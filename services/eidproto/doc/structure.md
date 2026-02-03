# eidproto Service Structure

A **Next.js 16** application for Swiss eID verification integrated with ATProto. Stateless design (no database).

## Directory Structure

```
services/eidproto/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── .well-known/did.json/     # DID document endpoint
│   │   ├── api/verify/               # Verification API routes
│   │   │   ├── create-session/       # Create session code (external apps)
│   │   │   ├── exchange-code/        # Exchange code for session data
│   │   │   ├── initiate/             # Start verification (token-based)
│   │   │   ├── initiate-session/     # Start verification (OAuth)
│   │   │   ├── record/               # Check verification status
│   │   │   └── status/               # Poll & complete verification
│   │   ├── callback/page.tsx         # OAuth callback handler
│   │   ├── verify/page.tsx           # QR code verification UI
│   │   ├── page.tsx                  # Home (login + status)
│   │   └── layout.tsx                # Root layout with AuthProvider
│   └── lib/
│       ├── AuthContext.tsx           # Session-only auth context
│       ├── oauthClient.ts            # ATProto OAuth wrapper
│       ├── crypto.ts                 # Ed25519 signing, AHV hashing
│       ├── jwt.ts                    # State token management
│       ├── pds.ts                    # PDS API client
│       └── swiyu.ts                  # SWIYU eID API client
├── public/client-metadata.json       # OAuth client metadata
├── Dockerfile                        # Multi-stage build
└── .env.example                      # Environment template
```

## Key Files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Main home page with login form and verification status display |
| `src/app/verify/page.tsx` | QR code display page for external app flow |
| `src/app/callback/page.tsx` | OAuth callback handler |
| `src/lib/crypto.ts` | Ed25519 signing/verification and AHV number hashing |
| `src/lib/pds.ts` | Interacts with user's PDS; writes verification records |
| `src/lib/swiyu.ts` | SWIYU eID verification API client |
| `src/lib/jwt.ts` | Creates/verifies signed JWT state tokens |
| `src/lib/AuthContext.tsx` | React context for session management |

## Key Libraries

| Library | Purpose |
|---------|---------|
| `@atproto/oauth-client-browser` | ATProto OAuth |
| `@noble/ed25519` | Ed25519 signing |
| `jose` | JWT handling |
| `tweetnacl` | Crypto utilities |

## API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/` | GET | Home page | OAuth |
| `/callback` | GET | OAuth callback | - |
| `/verify` | GET | External app verification UI | - |
| `/.well-known/did.json` | GET | DID document | - |
| `/api/verify/create-session` | POST | Create session code | - |
| `/api/verify/exchange-code` | POST | Exchange code for session | - |
| `/api/verify/initiate` | POST | Start verification (token-based) | Bearer |
| `/api/verify/initiate-session` | POST | Start verification (OAuth) | OAuth |
| `/api/verify/status` | GET | Poll verification status | - |
| `/api/verify/record` | GET | Check user verification | - |

## Two Flow Types

### 1. Direct OAuth Flow
User logs in on eidproto.poltr.info:
1. User enters ATProto handle
2. OAuth redirect to PDS
3. Callback stores session in memory
4. User initiates SWIYU verification
5. Record written to PDS after success

### 2. External App Flow
External app integrates verification:
1. App POSTs tokens to `/api/verify/create-session`
2. Receives short-lived code (5 min expiry)
3. Redirects user to `/verify?code=...`
4. Tokens exchanged server-side only
5. Verification proceeds, record written

## Record Type

Written to user's PDS at collection `info.poltr.eidproto.verification` with rkey `self`:

```json
{
  "$type": "info.poltr.eidproto.verification",
  "eidIssuer": "<trusted_issuer_did>",
  "eidHash": "<sha256_ahv_hash>",
  "verifiedBy": "did:web:eidproto.poltr.info",
  "verifiedAt": "<iso_datetime>",
  "signature": "<base64_ed25519_signature>"
}
```

## Architecture Decisions

### Stateless Design
- No database required
- State carried in signed JWTs (15-minute expiry for verification tokens, 5-minute for session codes)
- Environment variables only for configuration

### Cryptographic Verification
- Records signed with Ed25519: `sign(eidHash|eidIssuer|verifiedAt)`
- Signature stored in record for integrity validation
- Public key exposed via `/.well-known/did.json` (multibase format)

### Session-Only Auth
- React Context stores user + OAuthSession in memory only
- Session cleared on page refresh (secure by design)
- No localStorage usage (prevents XSS token theft)

### AHV Hashing
- Swiss AHV (social insurance) numbers hashed with secret salt
- Same algorithm as Python appview: `sha256(ahv + secret).hexdigest()`
- Enables deduplication without storing sensitive identifiers

## Environment Variables

```
EIDPROTO_EID_VERIFIER_API          # SWIYU verification endpoint
EIDPROTO_EID_TRUSTED_ISSUER_DID    # Trusted eID issuer DID
EIDPROTO_EID_HASH_SECRET           # SHA256 salt for AHV hashing
EIDPROTO_SIGNING_KEY_SEED          # Ed25519 seed (base64, 32 bytes)
EIDPROTO_JWT_SECRET                # JWT signing secret
EIDPROTO_SERVER_DID                # Service DID (did:web:eidproto.poltr.info)
```

Can use `APPVIEW_*` prefix to share secrets with appview service.

## Deployment

- Docker multi-stage build with Alpine base
- Runs on port 3000 in Kubernetes namespace `poltr`
- Standalone Next.js output for optimized container size
