# TODO

## Next

- [ ] Ballot creation endpoint: wire up `create_ballot_account()` in AppView (currently only DB + governance_pds.py ready)
- [ ] Missing: per-email rate limit on code requests

## VISION
- [ ] Translations: translations only in the appviev. a) Originalsprache im PDS speichern. b). Auch in "einfache Sprache" übersetzbar? (Inclusion)


## CHECK LATER

- Finalize lexicon setup: Poltr-specific version + Bluesky fallback (embedded entries)

## ONGOING


## Done

- Per-ballot governance accounts: each ballot gets its own PDS account (`ballot-{rkey}.id.poltr.ch`), credentials in `governance_accounts` table, removed `PDS_GOVERNANCE_ACCOUNT_DID`/`PDS_GOVERNANCE_PASSWORD` env vars
- Consolidate cross-posting from indexer to appview (revoke indexer auth.auth_creds access)
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
- Interoperability: Content on Bluesky
- Interoperability: Bluesky content in the app
