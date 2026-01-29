# Security Considerations for EID-PROTO

## Current Security Model

### Authentication Flows

1. **OAuth Flow** (direct eidproto users)
   - Uses `@atproto/oauth-client-browser` for ATProto OAuth
   - Session stored in React state only (not localStorage)
   - DPoP-bound tokens managed by OAuth client

2. **Code-Based Flow** (external apps)
   - Tokens POSTed to create session, never in URLs
   - Session encoded in signed JWT (5 min expiry)
   - Code exchanged for session data server-side

### Record Integrity

- Records signed with Ed25519 (`eidHash|eidIssuer|verifiedAt`)
- Signature verified by resolving `verifiedBy` DID to public key
- Supports did:web and did:plc resolution

## Known Limitations

### 1. OAuth Token Access (Low-Medium Risk)

The OAuth client's `getTokenSet()` is protected. We access it via TypeScript cast:

```typescript
const tokenSet = await (session as any).getTokenSet('auto');
```

**Risk**: Could break with library updates.
**Mitigation**: Pin `@atproto/oauth-client-browser` version, test on upgrades.

### 2. Client-Side PDS Writes (Low Risk)

In OAuth flow, server creates signed record, client writes to PDS.

**Risk**: Client could not write, or write different data.
**Mitigation**: Signature prevents tampering. Non-write is user's choice.

### 3. Session Code Replay (Low Risk)

Session codes (JWTs) can be exchanged multiple times within 5-minute window.

**Risk**: Replay within window if code intercepted.
**Mitigation**: Short expiry, HTTPS only, codes should only exist server-to-server.

**Future improvement**: Add one-time-use tracking with Redis/in-memory store.

### 4. No Rate Limiting (Medium Risk)

APIs have no rate limiting.

**Risk**: DoS, brute force, abuse.
**Mitigation**: Add rate limiting at reverse proxy (nginx) or application level.

### 5. CORS Not Configured (Low Risk)

No explicit CORS headers on API routes.

**Risk**: Any website can call APIs.
**Mitigation**: APIs are designed to be public. Sensitive operations require valid tokens.

**Future improvement**: Add CORS allowlist for known integrators.

## Deployment Checklist

- [ ] Use HTTPS only (redirect HTTP)
- [ ] Set strong, unique values for:
  - `EIDPROTO_JWT_SECRET`
  - `EIDPROTO_EID_HASH_SECRET`
  - `EIDPROTO_SIGNING_KEY_SEED`
- [ ] Configure rate limiting at reverse proxy
- [ ] Monitor for unusual API patterns
- [ ] Keep `@atproto/oauth-client-browser` pinned and test upgrades
- [ ] Ensure `/.well-known/did.json` is accessible (required for signature verification)

## Secret Management

| Secret | Purpose | Rotation Impact |
|--------|---------|-----------------|
| `SIGNING_KEY_SEED` | Signs verification records | Old records still valid (DID doc updated) |
| `JWT_SECRET` | Signs session/state tokens | Active sessions invalidated |
| `EID_HASH_SECRET` | Hashes AHV numbers | All hashes change (breaks deduplication) |

**Never rotate `EID_HASH_SECRET`** unless absolutely necessary - it breaks the ability to detect duplicate verifications.

## Threat Model

### In Scope
- Unauthorized verification record creation
- Token theft/replay
- Record tampering
- Impersonation of verified users

### Out of Scope
- PDS security (user's responsibility)
- SWIYU/Swiss E-ID infrastructure
- Client device security
- Social engineering

## Reporting Security Issues

Contact: [Add security contact]
