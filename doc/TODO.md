# TODO

## Next

- [ ] Ballot creation endpoint: wire up `create_ballot_account()` in AppView (currently only DB + governance_pds.py ready)
- [ ] Missing: per-email rate limit on code requests
- [ ] Email-Magic-Link: Text und Layout (Vorbild Tamedia: Verifzierungscode zum Beispiel) 
- [ ] Comment-Tree: immer nur auswahl der comments zeigen, und dann mit "Zeige mehr" links expandierbar machen. 
- [ ] @tanstack/vue-virtual beim feed view?
- [ ] Posting-Limite: Anzahl Argument Proposals + Anzahl Kommentare pro Tag und pro Monat/Abstimmug
- [ ] email änderungs mechanismus im profil 

**Peerreviews**
- [ ] Layout für offnee Peerreview Notifcation: schön nervig muss es sein.. 
- [ ] Peerreview Kritierien

**AI**
- [ ] AI Übersetzungen im App view
- [ ] AI Redundanz checks (peerreview und composer)
- [ ] Formulierungstipps.

## VISION
- [ ] Translations: translations only in the appviev. a) Originalsprache im PDS speichern. b). Auch in "einfache Sprache" übersetzbar? (Inclusion)


## CHECK LATER

- Finalize lexicon setup: Poltr-specific version + Bluesky fallback (embedded entries)

## ONGOING


## Done

- Randomisierung von argumenten und kommentaren auf gleicher stufe: user-konstante randomisierung. 
- Scroll-positioning . springt immer noch zur top position, wenn man auf feed zurückkehrt.
- Anzahl Kommentare bei Argumenten einblenden. 
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
