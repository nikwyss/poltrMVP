# TODO

## Next

- [ ] Missing: per-email rate limit on code requests

- [ ] Comment-Tree: immer nur auswahl der comments zeigen, und dann mit "Zeige mehr" links expandierbar machen. 
- [ ] @tanstack/vue-virtual beim feed view?
- [x] Posting-Limite: Anzahl Argument Proposals + Anzahl Kommentare pro Tag und pro Monat/Abstimmug
- [ ] Posting_limit:  Das Frontend-Display (Restkontingent im Composer, Deaktivieren bei Cap, 429-Handling/i18n) war laut doc/SECURITY_AUTH.md als „pending" markiert — die Durchsetzung im Backend steht, die UI-Anzeige evtl. noch nicht vollständig.
  
- [ ] email änderungs mechanismus im profil 


**Peerreviews**
- [ ] Layout für offnee Peerreview Notifcation: schön nervig muss es sein.. 
- [ ] Peerreview Kritierien

**AI**
- [x] AI Übersetzungen im App view
- [ ] AI Redundanz checks (peerreview und composer)
- [ ] Formulierungstipps.


- Moderation

## Security-Review des Auth-Umbaus (2026-06-11)

1. **Email-as-HMAC (billiger First-Order-Fix, eigener Plan):** `auth_creds.email` →
   gepfefferter `HMAC(pepper, email)` statt Klartext, Login-Lookup per `HMAC(eingabe)`.
   Plaintext nur transient in den Pending-Tabellen (Versand). Keine Funktion geht verl>
   Hängt davon ab, wie bestehende VAA Konten verknüpft werden.
   [ ] besser: email nur gehashed speichern?

2. **DID-Genesis von Verify-Zeit entkoppeln (Nutzer will später weiterverfolgen, aktue>
   nicht prioritär):** atproto-DID-Genesis ist öffentlich sekundengenau zeitgestempelt;
   deferred creation beim Verify koppelt Verify-Zeit ≈ Genesis-Zeit → Timing-Korrelati>
   gegen die Firehose (greift im Registrierungs-Moment). Lever: **Pool vor-erzeugter D>
   zuteilen. Begleitend Auth-Logs scrubben (Token-in-URL + IP-Chain + Zeitstempel =
   Korrelations-Korpus; die „client ip chain" bringt IPs in den Auth-Pfad).

3. **Sybil-Resistenz der öffentlichen Aggregat-Zahlen und Peerreviews :** Rate-Limits drosseln Mailversand, nicht die Account-Zahl → Wegwer>
   Mailer = günstiger Sybil. Hängt allein an der eID-Frage: Werden die angezeigten
   Prozentzahlen **pro eID-verifizierter Identität** (Swiyu-Verifier) statt pro Account
   gewichtet? Wenn nicht eID-gegated, ist der Vektor offen.

Siehe Plan-Datei mit Detail-Mitigations. Verwandt: [[project_architecture_layers]].




## VISION
- [ ] Translations: translations only in the appviev. a) Originalsprache im PDS speichern. b). Auch in "einfache Sprache" übersetzbar? (Inclusion)


## CHECK LATER

- Finalize lexicon setup: Poltr-specific version + Bluesky fallback (embedded entries)

## ONGOING


## Done
- Auswertungsplots. (erste version.)
- Argument-Aggregation (topic groupings etc.) => noisy-or
- Taxonomy snapshot.
- Layout Der Argument View (Taxonomy)
- Email-Magic-Link: Text und Layout (Vorbild Tamedia: Verifzierungscode zum Beispiel) 
- Randomisierung von argumenten und kommentaren auf gleicher stufe: user-konstante randomisierung. 
- Scroll-positioning . springt immer noch zur top position, wenn man auf feed zurückkehrt.
- Anzahl Kommentare bei Argumenten einblenden. 
- Ballot creation endpoint: wire up `create_ballot_account()` in AppView (currently only DB + governance_pds.py ready)
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
