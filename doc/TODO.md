# TODO

## Next

- [ ] Missing: per-email rate limit on code requests

- [ ] Comment-Tree: immer nur auswahl der comments zeigen, und dann mit "Zeige mehr" links expandierbar machen. 
- [ ] @tanstack/vue-virtual beim feed view?
- [x] Posting-Limite: Anzahl Argument Proposals + Anzahl Kommentare pro Tag und pro Monat/Abstimmug
- [ ] Posting_limit:  Das Frontend-Display (Restkontingent im Composer, Deaktivieren bei Cap, 429-Handling/i18n) war laut doc/SECURITY_AUTH.md als „pending" markiert — die Durchsetzung im Backend steht, die UI-Anzeige evtl. noch nicht vollständig.
  
- [ ] email änderungs mechanismus im profil 
- [ ] Neue Analyse: Gegenüberstellungen umd Ambivalenz auzuzeigen. => Ja, aber. => "Es ist ihre Entscheidung, ob sie diesen Nachteil in Kauf nehmen würden" 
- [ ] Wohin kommen neue argumente. Bleiben die vorerst unzugeordnet? Oder einfach dem hauptthema angehängt.??


**Peerreviews**
- [ ] Layout für offnee Peerreview Notifcation: schön nervig muss es sein.. 
- [ ] Peerreview Kritierien

**AI**
- [x] AI Übersetzungen im App view
- [ ] AI Redundanz checks (peerreview und composer)
- [ ] Formulierungstipps.


- Moderation

## Phase 7 — verbleibende Cluster-Schritte (nach Redeploy, deploy-abhängig)

Der Code-Cleanup ist erledigt (appview-API ohne Gov-Write); diese Schritte greifen
erst mit dem **neuen appview-Image** und sind teils irreversibel — der Reihe nach:

1. **Push → CI** baut das neue appview-Image (ohne Gov-Write-Pfad), deployt appview + writer.
2. **Verify** (deployte Seite): neues Argument/Response → User-Repo + Pipeline wie im
   E2E-Test; appview-API öffnet keine Governance-Session mehr.
3. **Tote Producer-Flags** aus `appview-secrets` entfernen (`APPVIEW_*_USER_REPO_ENABLED`)
   — Code liest sie nicht mehr. **Erst NACH** dem neuen Image (sonst revertiert das alte
   Image bei fehlendem Flag auf Legacy).
4. **appview → `appview@`-Rolle**: `APPVIEW_POSTGRES_URL` in `appview-secrets` auf
   `appview@` (Passwort = `-v appview_pw` aus `add-pod-roles.sql`), apply, `rollout
   restart deploy/appview`. (Rolle existiert seit Step A.)
5. **Grant-Restriktion**: `infra/scripts/postgres/phase7-restrict-appview-governance.sql`
   ausführen (greift erst nach Schritt 4 — Superuser umgeht Grants).
6. **GOV-Key aus dem appview-Pod-Env nehmen** (defense-in-depth): `APPVIEW_GOV_CREDS_MASTER_KEY_B64`
   in `cms-secrets` ergänzen; `cms.yaml` + `writer.yaml` so umstellen, dass sie den GOV-Key
   **nicht** mehr per `secretKeyRef` aus `appview-secrets` erben (writer-secrets hat ihn
   schon); dann GOV-Key aus `appview-secrets` entfernen. Danach hält die internet-zugewandte
   appview den Governance-Master-Key nicht mehr im Env.

## CI / Build-Pipeline beschleunigen (build-and-push-services.yml)

Problem heute: jeder `services/**`-Push baut **alle fünf** Services, jeweils mit
`docker build --no-cache` (CMS = voller Payload/Next-Build von Null) und seriell
(`max-parallel: 1`).

1. **Nur geänderte Services bauen (dynamische Matrix).** Vorgeschalteter
   `changes`-Job mit `dorny/paths-filter`, der pro Service ein Boolean liefert;
   die Build-Matrix wird daraus generiert. Ändere appview → baut nur appview.
2. **`--no-cache` raus + GHA-Layer-Cache rein.** Mit `docker/build-push-action`
   + `cache-from/to: type=gha`. Dann: `package.json` unverändert → `pnpm i` wird
   übersprungen, nur der Next-Build läuft. (Die „unknown blob"-Race, wegen der
   `max-parallel:1` steht, betrifft nur den ghcr-*Push* zwischen Services — der
   GHA-Cache ist davon unabhängig.)
3. **`.dockerignore` für CMS** (`node_modules`, `.next`, `.git`, `.env*`) →
   kleinerer Context, stabilerer Cache.

Zusammen: ein appview-Only-Push baut künftig **nur appview, mit warmem Cache**
statt alle fünf `--no-cache`. Offen: bleibt `max-parallel:1` (sicher, langsamer)
oder gegen die Blob-Race anders absichern (z.B. separate `cache-to`-Keys je
Service)?

## Writer-Loops nebenläufigkeitssicher machen (Crosspost + Translation)

Heute durch `writer.yaml` `replicas: 1` (Recreate) **verdeckt**, aber latent: der
Crosspost- und der Translation-Loop **claimen ihre Arbeit nicht atomar**.
- Crosspost ([crosspost.py:39-94](services/appview/src/atproto/crosspost.py#L39)):
  `SELECT … WHERE bsky_post_uri IS NULL` → Bluesky-POST → erst **danach** `UPDATE`.
  Zwei Writer (z.B. localhost + Cluster auf derselben DB/PDS) → **doppelte
  öffentliche Bluesky-Posts**.
- Translation: gleiches SELECT-ohne-Claim-Muster → doppelte LLM-Calls ($) + Races.
- Acceptance ist bereits safe (`FOR UPDATE SKIP LOCKED`, acceptance.py).

**Korrekter Fix (NICHT naiv):** Row-Lock **nicht** über den Netzwerk-Call halten.
Stattdessen **Claim-by-Marker**: atomar beanspruchen
`UPDATE app_arguments SET bsky_post_uri='<pending-sentinel>' WHERE uri IN
(SELECT uri … WHERE bsky_post_uri IS NULL FOR UPDATE SKIP LOCKED LIMIT n)
RETURNING …` → posten → echte URI setzen (bei Fehler Marker zurücksetzen).
Braucht einen Pending-Zustand (Sentinel-Wert oder Claim-Spalte/-Zeitstempel).
Analog für Translation (`translation_status='claimed'`). Erst dann sind mehrere
Writer unkritisch. Solange Singleton: nur Aufräum-/Robustheits-Gewinn.
Kontext: Diskussion 2026-06-16 (localhost+deployed gegen geteilte DB/PDS).

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


## Auth- von Content-Zugriff trennen (Architektur-Change, 2026-06-16)

Kontext: ozone/cms wurden aus der geteilten `allforone`-Superuser-Rolle herausgelöst
(eigene, eng gescopte DB-Rollen; siehe CHANGELOG 2026-06-16). Offen bleibt die
breiteste verbleibende Fläche: **jeder appview-Request-Handler — auch die reinen
Deliberations-Endpoints — kann heute `auth_creds` lesen.** Zwei Stufen:

- [ ] **Vorstufe (klein, separat): appview vom Superuser lösen.** appview läuft als
  `allforone` (Superuser), nutzt aber keine Superuser-Features (verifiziert). Eigene
  `appview`-Rolle mit tabellen-genauen Grants → danach nutzt **kein Pod** mehr
  `allforone` (wird reiner Break-Glass/DBA-Account). Analog zu cms/ozone.

- [ ] **2a — Zwei Connection-Pools in einem Prozess (pragmatisch):** ein privilegierter
  `appview_auth`-Pool (Creds/Sessions schreiben — nur das `auth/`-Modul) und ein eng
  gescopter `appview_app`-Pool (Deliberation/Content: **kein** Zugriff auf
  `auth_creds`/Credential-Spalten, nur Sessions-*Lesen* zur Validierung + `app_profiles`
  + Content-Tabellen). Der Großteil des Codes kommt dann gar nicht mehr an den
  Credential-Store. Mittlerer Aufwand, hoher Defense-in-depth-Gewinn.

  > **Wichtige Subtilität — `governance_accounts` gehört zum Content-Pool, nicht zum Auth-Pool.**
  > Die Tabelle liegt zwar im `auth`-Schema, ist aber funktional eine *Content-Pfad*-Credential
  > (PDS-Passwörter der Per-Ballot-Governance-Konten), kein User-Identitäts-Datum wie `auth_creds`.
  > Der **gesamte** Deliberations-Schreibpfad braucht sie (nicht nur Peerreviews): Argument-
  > Erstellung (`arguments.py`), Peerreview-Einladung (`peer_review_assign.py`) + -Antwort
  > (`reviews.py`), Übersetzungen (`translator.py`), Crossposting (`crosspost.py`) lesen
  > `pw_ciphertext/pw_nonce` via `_get_governance_password()` → PDS-Session; dazu DID-Routing
  > (`get_did_for_ballot`/`_uri`/`is_governance_did`), INSERT (`create_ballot_account`) und
  > Enrichment-JOINs (`ballots.py`).
  > → Aufteilung explizit machen:
  > - `appview_auth` → `auth_creds`, `auth_sessions`, Pending-/Email-Tabellen, `mountain_templates`.
  > - `appview_app` → `governance_accounts` (R/W, inkl. Credential-Spalten) + Content-Tabellen;
  >   **kein** Zugriff auf `auth_creds`.
  > Konsequenz: der Content-Pool ist **nicht** komplett credential-frei — er hält weiterhin die
  > Governance-Passwörter. Wer maximale Trennung will, müsste das PDS-Schreiben hinter einen
  > eigenen, schmalen „governance-writer"-Service ziehen (→ Richtung 2b).

- [ ] **2b — Auth als eigener Microservice (groß):** nur dieser Dienst hält
  `auth_creds`/`auth_sessions`; alle anderen validieren Sessions über eine interne
  Token-Introspection-API. Maximale Isolation, deutlich mehr Umbau.

Verwandt: die Email↔DID-Linkage (Klartext-Email in `auth_creds`) ist ein Daten-/Krypto-
Change, kein Grant-Change → Punkt 1 im „Security-Review des Auth-Umbaus" oben
(Email-as-HMAC). [[project_auth_privacy_workstream]] · [[project_architecture_layers]].


## ATProto-native Deliberation — Härtung der Akzeptanz-Pipeline vor Prod (2026-06-16)

Die Phase-3-Akzeptanz-Pipeline (`services/appview/src/atproto/acceptance.py`) ist Dev-tauglich,
aber vor dem Einsatz über Dev hinaus zu härten:
- [ ] **Long-Transaction:** der Drain hält eine DB-Transaktion über den PDS-Write (`FOR UPDATE SKIP LOCKED`
  + createRecord in derselben Tx) → bei höherem Volumen problematisch. Claim/Process entkoppeln
  (z.B. Status `processing` + Lock früh freigeben, oder kurze Claim-Tx + separate Done-Tx).
- [ ] **Head-of-line-Blocking / kein Dead-Letter:** ein dauerhaft fehlschlagender Row bleibt `pending`
  und blockiert die Queue. Attempt-Counter + Backoff + Dead-Letter (`status='failed'` nach N Versuchen).
- [ ] **Writer-Quota:** der Writer vertraut aktuell der synchronen appview-Reservierung und prüft Quota
  selbst nicht. Für den Bypass-/Föderationspfad muss das Gate die Quota autoritativ gegen
  `app_content_creations` durchsetzen (L11).
- [ ] **Master-Key-Split fertigstellen:** Env-Namen + Code-Pfade sind getrennt (`APPVIEW_USER_CREDS_MASTER_KEY_B64`
  für `auth_creds`, `APPVIEW_GOV_CREDS_MASTER_KEY_B64` für `governance_accounts`; Python `pds_creds.py`
  USER/GOV-Funktionen, CMS `govMasterKeyB64()`, Legacy-Fallback). **Offen:** auf Dev/Prod tatsächlich
  **unterschiedliche** Werte setzen — dazu `governance_accounts.pw_*` mit dem neuen Gov-Key **re-encrypten**
  (kurzes Migrations-Skript: alt entschlüsseln → neu verschlüsseln) und den Legacy-Fallback entfernen. Erst dann
  öffnet ein appview-Leak nicht mehr die Gov-Creds.
Plan: `typed-kindling-flask`. [[project_architecture_layers]].

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
