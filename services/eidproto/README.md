# EID-PROTO: Swiss E-ID to ATProto Bridge

A standalone Next.js service that verifies ATProto accounts with Swiss E-ID (SWIYU) and writes a signed verification record to the user's PDS.

**URL**: `eidproto.poltr.info`

## How It Works

1. Client sends POST to `/api/verify/initiate` with PDS auth tokens
2. Service validates the token against the PDS
3. Service initiates SWIYU eID verification
4. User scans QR code with SWIYU wallet
5. Service polls for verification result
6. On success: hashes AHV number, signs it, writes record to user's PDS
7. User is redirected to success/error URL

## API

### POST `/api/verify/initiate`

Initiate eID verification.

**Headers:**
```
Authorization: Bearer <pds_access_token>
Content-Type: application/json
```

**Body:**
```json
{
  "refresh_token": "<pds_refresh_token>",
  "pds_url": "pds.example.com",
  "success_url": "https://app.example.com/verified",
  "error_url": "https://app.example.com/error"
}
```

**Response:**
```json
{
  "state_token": "<jwt>",
  "verification_id": "<uuid>",
  "verification_url": "<swiyu_url>",
  "verification_deeplink": "<swiyu://...>",
  "expires_at": "<iso_datetime>"
}
```

### GET `/api/verify/status?state_token=<jwt>`

Poll verification status.

**Response:**
```json
{
  "status": "PENDING" | "SUCCESS" | "FAILED" | "ERROR",
  "redirect_url": "<url>",
  "message": "<string>",
  "eid_hash": "<hash>"  // only on SUCCESS
}
```

### UI Flow: `/verify`

Redirect users to `/verify` with query parameters for a complete UI flow:

```
/verify?access_token=<...>&refresh_token=<...>&pds_url=<...>&success_url=<...>&error_url=<...>
```

The page displays a QR code, handles polling, and redirects on completion.

## Record Type

On successful verification, writes to the user's PDS:

```json
{
  "$type": "info.poltr.eidproto.verification",
  "eidIssuer": "<trusted_issuer_did>",
  "eidHash": "<sha256_hash>",
  "verifiedBy": "did:web:eidproto.poltr.info",
  "verifiedAt": "<iso_datetime>",
  "signature": "<base64_ed25519_signature>"
}
```

- **Collection**: `info.poltr.eidproto.verification`
- **rkey**: `self`
- **Signature**: Signs `eidHash|eidIssuer|verifiedAt` with Ed25519

## Environment Variables

Copy `.env.example` to `.env.local`:

```bash
# SWIYU API
EIDPROTO_EID_VERIFIER_API=https://verifier.swiyu-int.admin.ch/api/v1/verification-requests
EIDPROTO_EID_TRUSTED_ISSUER_DID=did:tdw:...

# Secrets
EIDPROTO_EID_HASH_SECRET=<secret-for-ahv-hashing>
EIDPROTO_SIGNING_KEY_SEED=<base64-32-byte-ed25519-seed>
EIDPROTO_JWT_SECRET=<secret-for-state-tokens>

# Service identity
EIDPROTO_SERVER_DID=did:web:eidproto.poltr.info
```

Can also use `APPVIEW_*` prefix for shared secrets with the appview service.

## Development

```bash
npm install
npm run dev
```

## Build & Deploy

```bash
npm run build
npm start
```

## Architecture

- **Stateless**: No database required. State is carried in signed JWTs.
- **Standalone**: No dependencies on other services in this repo.
- **Simple**: Next.js App Router with TypeScript and Tailwind.

## Files

```
src/
├── app/
│   ├── api/verify/
│   │   ├── initiate/route.ts  # Start verification
│   │   └── status/route.ts    # Poll & complete
│   ├── verify/page.tsx        # UI with QR code
│   └── page.tsx               # Landing page
└── lib/
    ├── env.ts                 # Environment config
    ├── crypto.ts              # Ed25519 signing, AHV hashing
    ├── jwt.ts                 # State token management
    ├── pds.ts                 # PDS API client
    └── swiyu.ts               # SWIYU API client
```
