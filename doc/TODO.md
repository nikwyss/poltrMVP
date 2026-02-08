# TODO

## Next

- [ ] Finalize lexicon setup: Poltr-specific version + Bluesky fallback
- [ ] Create pseudonym system: Swiss mountain names table (Bergnamen)
- [ ] Implement argument posting functionality
- [ ] Design and implement user profile pages
- [ ] Interoperability: Content on Bluesky
- [ ] Interoperability: Bluesky content in the app
- [ ] Arguments / Peer review
- [ ] Testing

## Done

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
