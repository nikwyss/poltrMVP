# EID-PROTO: Swiss E-ID to ATProto Bridge

A standalone Next.js service that verifies ATProto accounts with Swiss E-ID (SWIYU) and writes a signed verification record to the user's PDS.

**URL**: `eidproto.poltr.info`

## How It Works

### Direct OAuth Flow (eidproto.poltr.info)
1. User visits eidproto and logs in via ATProto OAuth (enter handle, redirect to PDS)
2. Home page shows verification status (with cryptographic signature validation)
3. If not verified: User can initiate SWIYU eID verification
4. User scans QR code with SWIYU wallet
5. On success: Server signs record, client writes to PDS via OAuth session
6. Home page shows verified status with record details

### External App Flow (secure code-based)
1. External app POSTs tokens to `/api/verify/create-session` (tokens never in URLs)
2. Receives short-lived code, redirects user to `/verify?code=...`
3. eidproto exchanges code, initiates SWIYU verification
4. On success: writes signed record to PDS, redirects to success URL

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

### POST `/api/verify/create-session` (Recommended for external apps)

Create a secure verification session. Tokens are POSTed, never appear in URLs.


**Body:**
```json
{
  "access_token": "<pds_access_token>",
  "refresh_token": "<pds_refresh_token>",
  "pds_url": "bsky.social",
  "success_url": "https://app.example.com/verified",
  "error_url": "https://app.example.com/error"
}
```

**Response:**
```json
{
  "code": "<jwt>",
  "expires_in": 300,
  "redirect_url": "/verify?code=<jwt>"
}
```

Then redirect user to the `redirect_url`.

### GET `/api/verify/record?did=<did>`

Check verification status for a DID. Validates signature cryptographically.

**Response:**
```json
{
  "verified": true,
  "record": {
    "verifiedAt": "<iso_datetime>",
    "eidHash": "<hash>",
    "eidIssuer": "<did>",
    "verifiedBy": "<did>"
  }
}
```

Or if invalid/missing:
```json
{
  "verified": false,
  "reason": "Missing signature" | "Invalid signature" | "Could not resolve verifier public key"
}
```

### GET `/.well-known/did.json`

DID document for `did:web:eidproto.poltr.info`. Auto-generated from signing key.

### UI Flow: `/verify?code=<code>`

Redirect users to `/verify` with a session code (from `/api/verify/create-session`).

The page exchanges the code, displays a QR code, handles polling, and redirects on completion.

## Integration Guide for External Apps

### Overview

External apps can integrate Swiss E-ID verification without handling SWIYU directly. The flow uses secure code-based redirects - tokens are never exposed in URLs.

### Flow Diagram

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ External App│     │  eidproto   │     │    SWIYU    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │ 1. POST /api/verify/create-session    │
       │   (tokens in body)│                   │
       │──────────────────>│                   │
       │                   │                   │
       │ 2. Returns { code, redirect_url }     │
       │<──────────────────│                   │
       │                   │                   │
       │ 3. Redirect user to /verify?code=...  │
       │──────────────────>│                   │
       │                   │                   │
       │                   │ 4. Initiate       │
       │                   │──────────────────>│
       │                   │                   │
       │                   │ 5. User scans QR  │
       │                   │<─ ─ ─ ─ ─ ─ ─ ─ ─│
       │                   │                   │
       │                   │ 6. Poll status    │
       │                   │──────────────────>│
       │                   │                   │
       │                   │ 7. Write to PDS   │
       │                   │                   │
       │ 8. Redirect to success_url            │
       │<──────────────────│                   │
       │                   │                   │
```

### Step-by-Step Implementation

#### 1. Create Session (Server-Side)

Your backend POSTs the user's PDS tokens to create a secure session code:

```typescript
// Your backend endpoint
async function initiateVerification(req, res) {
  const { accessJwt, refreshJwt } = req.user.pdsSession;

  const response = await fetch('https://eidproto.poltr.info/api/verify/create-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessJwt,
      refresh_token: refreshJwt,
      pds_url: 'bsky.social',  // or user's PDS
      success_url: 'https://yourapp.com/verification-complete',
      error_url: 'https://yourapp.com/verification-failed',
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const { code, redirect_url } = await response.json();

  // Return the redirect URL to your frontend
  res.json({ redirect_url: `https://eidproto.poltr.info${redirect_url}` });
}
```

#### 2. Redirect User (Client-Side)

Your frontend redirects the user to eidproto:

```typescript
// Your frontend
async function startVerification() {
  const response = await fetch('/api/start-verification', { method: 'POST' });
  const { redirect_url } = await response.json();

  // Redirect to eidproto
  window.location.href = redirect_url;
}
```

#### 3. Handle Callback

After verification, users are redirected to your `success_url` or `error_url`:

```typescript
// pages/verification-complete.tsx
function VerificationComplete() {
  // Verification succeeded!
  // The record is now written to the user's PDS

  // Optionally verify by checking the record
  useEffect(() => {
    fetch(`https://eidproto.poltr.info/api/verify/record?did=${userDid}`)
      .then(res => res.json())
      .then(data => {
        if (data.verified) {
          // Show success UI
        }
      });
  }, []);

  return <div>Verification complete!</div>;
}
```

### Checking Verification Status

You can check if any user is verified without authentication:

```typescript
const response = await fetch(
  `https://eidproto.poltr.info/api/verify/record?did=${userDid}`
);
const data = await response.json();

if (data.verified) {
  console.log('User is verified!');
  console.log('Verified at:', data.record.verifiedAt);
  console.log('E-ID hash:', data.record.eidHash);
} else {
  console.log('Not verified:', data.reason);
}
```

### Security Considerations

1. **Server-side token handling**: Always create sessions from your backend, never expose PDS tokens to your frontend beyond what's necessary.

2. **Code expiration**: Session codes expire in 5 minutes. Users must complete verification promptly.

3. **Signature validation**: The `/api/verify/record` endpoint cryptographically validates signatures. Only records signed by `did:web:eidproto.poltr.info` are considered valid.

4. **One record per user**: Each user can have only one verification record (rkey: `self`). Re-verification overwrites the previous record.

### Example: React Hook

```typescript
import { useState, useCallback } from 'react';

export function useEidVerification(userDid: string) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'verified' | 'unverified'>('idle');
  const [record, setRecord] = useState(null);

  const checkStatus = useCallback(async () => {
    setStatus('loading');
    const res = await fetch(
      `https://eidproto.poltr.info/api/verify/record?did=${userDid}`
    );
    const data = await res.json();

    if (data.verified) {
      setStatus('verified');
      setRecord(data.record);
    } else {
      setStatus('unverified');
    }
  }, [userDid]);

  const startVerification = useCallback(async () => {
    // Call your backend to create session
    const res = await fetch('/api/eid/start', { method: 'POST' });
    const { redirect_url } = await res.json();
    window.location.href = redirect_url;
  }, []);

  return { status, record, checkStatus, startVerification };
}
```

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
│   ├── .well-known/did.json/route.ts  # DID document
│   ├── api/verify/
│   │   ├── create-session/route.ts    # Create secure session code
│   │   ├── exchange-code/route.ts     # Exchange code for session
│   │   ├── initiate/route.ts          # Start verification (with tokens)
│   │   ├── initiate-session/route.ts  # Start verification (OAuth)
│   │   ├── record/route.ts            # Check verification status
│   │   └── status/route.ts            # Poll & complete
│   ├── callback/page.tsx              # OAuth callback
│   ├── verify/page.tsx                # Verification UI with QR code
│   └── page.tsx                       # Home page (login + status)
├── lib/
│   ├── AuthContext.tsx        # Session-only auth context
│   ├── oauthClient.ts         # ATProto OAuth client
│   ├── env.ts                 # Environment config
│   ├── crypto.ts              # Ed25519 signing/verification, AHV hashing
│   ├── jwt.ts                 # State token management
│   ├── pds.ts                 # PDS API client
│   └── swiyu.ts               # SWIYU API client
└── public/
    └── client-metadata.json   # OAuth client metadata (production)
```

## Changelog

### 2025-01-29

**OAuth Login Flow**
- Added ATProto OAuth authentication (login with handle, no passwords stored)
- Session-only storage (clears on refresh, no localStorage)
- Home page shows verification status after login

**Signature Verification**
- `/api/verify/record` now cryptographically validates signatures
- Resolves `verifiedBy` DID to get public key (supports did:web and did:plc)
- Shows "Invalid Record" UI with delete option for unsigned/invalid records

**Secure Code-Based Redirect Flow**
- New `POST /api/verify/create-session` - tokens POSTed, never in URLs
- `/verify` page now uses `?code=...` instead of raw token params
- Code is a signed JWT, expires in 5 minutes

**DID Document**
- `/.well-known/did.json` endpoint serves DID document
- Auto-generated from `EIDPROTO_SIGNING_KEY_SEED`
- Required for signature verification of records
