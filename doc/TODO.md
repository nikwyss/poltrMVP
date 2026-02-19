# TODO

## Next

- [ ] Implement argument posting functionality
- [ ] Arguments / Peer review
- [ ] Testing

## VISION
- [ ] Translations: translations only in the appviev


## CHECK LATER

- [ ] **Indexer auth.auth_creds access (2026-02-19):** The indexer's cross-like feature needs to read encrypted PDS credentials from `auth.auth_creds`. We granted `GRANT USAGE ON SCHEMA auth TO indexer; GRANT SELECT ON auth.auth_creds TO indexer;` (also in `db-setup.sql`). Consider moving cross-like logic to the appview instead (which already has full auth access), then revoke indexer's auth access.

## ONGOING
- [ ] Interoperability: Content on Bluesky
- [ ] Interoperability: Bluesky content in the app
- [ ] Finalize lexicon setup: Poltr-specific version + Bluesky fallback (embedded entries)

## Done

- Design and implement user profile pages on bluesky
- Create pseudonym system: Swiss mountain names table (Bergnamen)
- Server-side auth: httpOnly cookies, XRPC proxy, no token in localStorage
- RichText XSS hardening (heading tag whitelist, link href validation)
- Repo restructure: `infra/` (kube, cert, deployer, scripts), cleaned root
- Frontend restructured: auth pages under `/auth/`, API routes under `/api/`
- Dockerfile cleanup: build args from CI, no hardcoded env defaults
- CMS integration (Payload CMS, embedded in frontend via catch-all route)
- Ozone moderation setup
- Bluesky interoperability: login with app-password (with birthDate workaround)
- eID verification (eidproto + swiyu verifier)
- Magic link authentication
- Backfill cronjob (hourly)
- GitHub Actions CI/CD workflow
- Load balancer removal (hostPort setup for dev/test)
