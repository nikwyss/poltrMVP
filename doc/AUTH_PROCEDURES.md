# Authentication Procedures

POLTR uses passwordless magic-link authentication. Users never choose or type a password. Instead, the AppView generates a one-time link sent by email. Clicking that link proves email ownership and completes the auth flow.

There are two distinct procedures -- **registration** and **login** -- that share the same magic-link pattern but differ in what happens after the token is verified.

## Why magic links?

POLTR accounts live on a Bluesky PDS (Personal Data Server). The PDS requires a password for its API, but exposing that password to the user would make login more complicated. The barriers to the platform should be as low as possible. This why we chose this passwordless solution.

1. Keep the user experience simple (email-only, no password to remember).
2. Generate a strong random app password behind the scenes and store it encrypted.
3. Prove email ownership as part of both registration and login.

## Database tables

All auth-related tables are prefixed with `auth_` and live in the `appview` database.

| Table | Purpose | Lifetime |
|-------|---------|----------|
| `auth_pending_logins` | Stores one-time login tokens | Row deleted after verification |
| `auth_pending_registrations` | Stores one-time registration tokens | Row deleted after verification |
| `auth_sessions` | Active user sessions (cookie-based) | Expires after 7 days |
| `auth_creds` | Encrypted PDS app passwords per user | Permanent (one row per user) |

Both pending tables follow the same pattern: insert a row with a token + expiry, then delete it once verified. No `used` flag -- the row simply disappears, so a token can never be replayed.

## Registration flow

```
User                    Frontend              AppView                  PDS
 │                         │                      │                      │
 │  enter email            │                      │                      │
 │────────────────────────>│                      │                      │
 │                         │  POST ch.poltr.auth  │                      │
 │                         │  .register           │                      │
 │                         │─────────────────────>│                      │
 │                         │                      │  check email not     │
 │                         │                      │  in auth_creds       │
 │                         │                      │  insert into         │
 │                         │                      │  auth_pending_       │
 │                         │                      │  registrations       │
 │                         │                      │  send email          │
 │                         │                      │                      │
 │  click link in email    │                      │                      │
 │────────────────────────>│                      │                      │
 │                         │  POST ch.poltr.auth  │                      │
 │                         │  .verifyRegistration │                      │
 │                         │─────────────────────>│                      │
 │                         │                      │  look up token       │
 │                         │                      │  delete pending row  │
 │                         │                      │                      │
 │                         │                      │  generate handle     │
 │                         │                      │  generate password   │
 │                         │                      │  (64 random chars)   │
 │                         │                      │                      │
 │                         │                      │  admin create ──────>│
 │                         │                      │  account             │
 │                         │                      │<───── did, tokens ───│
 │                         │                      │                      │
 │                         │                      │  encrypt password    │
 │                         │                      │  (XSalsa20-Poly1305) │
 │                         │                      │  store in auth_creds │
 │                         │                      │                      │
 │                         │                      │  create session      │
 │                         │                      │  (auth_sessions)     │
 │                         │<── set-cookie ───────│                      │
 │<── logged in ───────────│                      │                      │
```

**Steps in detail:**

1. `POST /xrpc/ch.poltr.auth.register` -- AppView checks the email is not already in `auth_creds`, generates a token (expires in 30 min), inserts it into `auth_pending_registrations`, and sends a confirmation email.
2. `POST /xrpc/ch.poltr.auth.verifyRegistration` -- AppView looks up the token, checks expiry, deletes the pending row, then:
   - Generates a random handle (`userXXXXXX.poltr.info`) and a 64-char random password.
   - Calls the PDS admin API to create the account.
   - Encrypts the password with the master key and stores it in `auth_creds`.
   - Creates a session (see below).

## Login flow

```
User                    Frontend              AppView                  PDS
 │                         │                      │                      │
 │  enter email            │                      │                      │
 │────────────────────────>│                      │                      │
 │                         │  POST ch.poltr.auth  │                      │
 │                         │  .sendMagicLink      │                      │
 │                         │─────────────────────>│                      │
 │                         │                      │  insert into         │
 │                         │                      │  auth_pending_logins │
 │                         │                      │  send email          │
 │                         │                      │                      │
 │  click link in email    │                      │                      │
 │────────────────────────>│                      │                      │
 │                         │  POST ch.poltr.auth  │                      │
 │                         │  .verifyLogin        │                      │
 │                         │─────────────────────>│                      │
 │                         │                      │  look up token       │
 │                         │                      │  delete pending row  │
 │                         │                      │                      │
 │                         │                      │  look up auth_creds  │
 │                         │                      │  decrypt password    │
 │                         │                      │  PDS login ─────────>│
 │                         │                      │<───── tokens ────────│
 │                         │                      │                      │
 │                         │                      │  create session      │
 │                         │                      │  (auth_sessions)     │
 │                         │<── set-cookie ───────│                      │
 │<── logged in ───────────│                      │                      │
```

**Steps in detail:**

1. `POST /xrpc/ch.poltr.auth.sendMagicLink` -- AppView generates a token (expires in 15 min), inserts it into `auth_pending_logins`, and sends the magic link email. Rate-limited to 5/minute.
2. `POST /xrpc/ch.poltr.auth.verifyLogin` -- AppView looks up the token, checks expiry, deletes the pending row, then:
   - Looks up the user's encrypted password in `auth_creds`.
   - Decrypts it and authenticates against the PDS.
   - Creates a session (see below).

## Sessions

Both flows end with the same `create_session_cookie` function:

1. Generate a random session token (48 bytes, URL-safe).
2. Store it in `auth_sessions` with the user's DID, PDS access/refresh tokens, and a 7-day expiry.
3. Set an `httpOnly`, `sameSite=lax` cookie on the response (HTTPS-only in production).

On every authenticated request, the middleware (`verify_session_token`) checks the cookie (or `Authorization: Bearer` header), validates the session against `auth_sessions`, and updates `last_accessed_at`. Expired sessions are deleted on access.

The Frontend proxies all AppView calls through Next.js API routes (`/api/xrpc/...`), forwarding the session cookie as a Bearer token. This keeps the AppView URL server-side only.

## Credential storage

User passwords are never stored in plaintext. The flow is:

1. A 32-byte master key is stored as a Kubernetes secret (`APPVIEW_PDS_CREDS_MASTER_KEY_B64`).
2. On registration, the generated password is encrypted with XSalsa20-Poly1305 (via `nacl.secret.SecretBox`).
3. The ciphertext and 24-byte nonce are stored in `auth_creds`.
4. On login, the ciphertext is decrypted with the same master key to authenticate against the PDS.

The `auth_creds` table also stores the user's DID, handle, email, and PDS URL -- everything needed to re-authenticate.

## API endpoints

| Endpoint | Method | Rate limit | Purpose |
|----------|--------|------------|---------|
| `ch.poltr.auth.register` | POST | 10/min | Start registration (send confirmation email) |
| `ch.poltr.auth.verifyRegistration` | POST | 10/min | Complete registration (create PDS account) |
| `ch.poltr.auth.sendMagicLink` | POST | 5/min | Start login (send magic link email) |
| `ch.poltr.auth.verifyLogin` | POST | 10/min | Complete login (authenticate against PDS) |
| `ch.poltr.auth.createAppPassword` | POST | 5/min | Create app password for Bluesky clients |
| `ch.poltr.auth.initiateEidVerification` | POST | 5/min | Start Swiss eID verification flow |

## Token expiry

| Token type | Expiry |
|------------|--------|
| Registration confirmation | 30 minutes |
| Login magic link | 15 minutes |
| Session cookie | 7 days |
