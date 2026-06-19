# TODO

## Next

- [ ] Missing: per-email rate limit on code requests
- [ ] email änderungs mechanismus im profil 
- [ ] Comment-Tree: immer nur auswahl der comments zeigen, und dann mit "Zeige mehr" links expandierbar machen. 
- [ ] @tanstack/vue-virtual beim feed view?
- [ ] Posting_limit:  Das Frontend-Display (Restkontingent im Composer, Deaktivieren bei Cap, 429-Handling/i18n) war laut doc/SECURITY_AUTH.md als „pending" markiert — die Durchsetzung im Backend steht, die UI-Anzeige evtl. noch nicht vollständig.
  
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

## Phase 7 — ERLEDIGT (2026-06-17)

Code-Cleanup + Cluster-Rollout durch:
- [x] appview-Code ohne Community-Write (arguments/reviews/peer_review_assign), Tests grün (48)
- [x] LEXICONS.md aktualisiert (ATProto-native Modell + peerreview-Lexika)
- [x] Neues Image deployt; tote Producer-Flags aus `appview-secrets` raus
- [x] **appview → `appview@`** (kein Pod nutzt mehr `allforone`)
- [x] **DB-Grant verengt**: `community_accounts` für appview nur noch spaltenweises
      SELECT (kein pw, kein Write) — live verifiziert, End-Zustand in `db-setup.sql`

Nicht gemacht (bewusst → Key-Split-Workstream, s.u.): COMMUNITY-Key aus dem appview-Pod-Env nehmen.

## Master-Key-Split fertigstellen (echte Krypto-Trennung) — verschoben aus Phase 7

Heute haben USER-/COMMUNITY-/Legacy-Master-Key auf Dev **denselben Wert**; die Env-Namen sind
schon getrennt (`pds_creds.py`), aber der Wert nicht. Solange identisch, bringt das
Entfernen des COMMUNITY-Keys aus dem appview-Env **nichts** (der gleiche Wert bleibt als
USER-Key). Durch den Phase-7-DB-Grant ist der Key für Community-Creds ohnehin funktionslos
(appview kann das Chiffrat nicht lesen) — also kein akutes Risiko, aber unsauber.

Echte Trennung:
1. Neuen, **distinkten** Community-Key erzeugen.
2. **Re-Encryption**-Migration: alle `community_accounts.pw_*` mit dem alten Key
   entschlüsseln, mit dem neuen Community-Key neu verschlüsseln.
3. Neuen Community-Key NUR in `writer-secrets` + `cms-secrets`; `cms.yaml`/`writer.yaml` so,
   dass sie ihn **nicht** mehr aus `appview-secrets` erben.
4. `APPVIEW_COMMUNITY_CREDS_MASTER_KEY_B64` (+ Legacy) aus `appview-secrets` entfernen — appview
   behält nur `APPVIEW_USER_CREDS_MASTER_KEY_B64` (auth_creds).

Gehört zum [[project_auth_privacy_workstream]] (Email-as-HMAC, DID-Pool, eID-Gating).

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
   [x] **IMPLEMENTIERT** — Spalte `auth_creds.email` → `email_hmac`
       (`HMAC-SHA256(pepper, lower(trim(email)))`, hex). Pepper
       `APPVIEW_EMAIL_HMAC_PEPPER_B64` nur im appview-Prozess. Login/Lookup/Dedup
       gehen über `email_digest()`. Pending-Tabellen + PDS behalten Klartext
       (Versand bzw. createAccount). Module: `services/appview/src/auth/email_hmac.py`;
       Migration `services/appview/migrations/009_email_to_hmac.sql`;
       Backfill `infra/scripts/backfill_email_hmac.py` (idempotent, '@'-Diskriminator).
   - **Offen — VAA-Konten:** Wenn bestehende VAA-Konten je per Email gematcht werden,
     müssen deren Emails beim Import mit DEMSELBEN Pepper HMAC't werden (kein Code).
   - **Restkosten:** PDS hält weiterhin eine Klartext-Kopie (createAccount); Hashen von
     `auth_creds` entfernt den Langzeit-Speicher, nicht jede Kopie im System.
     Pepper NICHT rotierbar ohne Klartext (Rotation = Nutzer müssen Email neu verifizieren).
     Auth-Logs drucken noch Klartext-Email (separat, Punkt 2 unten / Log-Scrubbing).

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

  > **Wichtige Subtilität — `community_accounts` gehört zum Content-Pool, nicht zum Auth-Pool.**
  > Die Tabelle liegt zwar im `auth`-Schema, ist aber funktional eine *Content-Pfad*-Credential
  > (PDS-Passwörter der Per-Ballot-Community-Konten), kein User-Identitäts-Datum wie `auth_creds`.
  > Der **gesamte** Deliberations-Schreibpfad braucht sie (nicht nur Peerreviews): Argument-
  > Erstellung (`arguments.py`), Peerreview-Einladung (`peer_review_assign.py`) + -Antwort
  > (`reviews.py`), Übersetzungen (`translator.py`), Crossposting (`crosspost.py`) lesen
  > `pw_ciphertext/pw_nonce` via `_get_community_password()` → PDS-Session; dazu DID-Routing
  > (`get_did_for_ballot`/`_uri`/`is_community_did`), INSERT (`create_ballot_account`) und
  > Enrichment-JOINs (`ballots.py`).
  > → Aufteilung explizit machen:
  > - `appview_auth` → `auth_creds`, `auth_sessions`, Pending-/Email-Tabellen, `mountain_templates`.
  > - `appview_app` → `community_accounts` (R/W, inkl. Credential-Spalten) + Content-Tabellen;
  >   **kein** Zugriff auf `auth_creds`.
  > Konsequenz: der Content-Pool ist **nicht** komplett credential-frei — er hält weiterhin die
  > Community-Passwörter. Wer maximale Trennung will, müsste das PDS-Schreiben hinter einen
  > eigenen, schmalen „community-writer"-Service ziehen (→ Richtung 2b).



Verwandt: die Email↔DID-Linkage (Klartext-Email in `auth_creds`) ist ein Daten-/Krypto-
Change, kein Grant-Change → Punkt 1 im „Security-Review des Auth-Umbaus" oben
(Email-as-HMAC). [[project_auth_privacy_workstream]] · [[project_architecture_layers]].


## ATProto-native Deliberation — Härtung der Akzeptanz-Pipeline vor Prod (2026-06-16)

Die Akzeptanz-Pipeline ([services/community-writer/src/atproto/acceptance.py](services/community-writer/src/atproto/acceptance.py))
ist Dev-tauglich, aber vor dem Einsatz über Dev hinaus zu härten:
- [ ] **Long-Transaction:** der Drain hält eine DB-Transaktion über den PDS-Write (`FOR UPDATE SKIP LOCKED`
  + createRecord in derselben Tx) → bei höherem Volumen problematisch. Claim/Process entkoppeln
  (z.B. Status `processing` + Lock früh freigeben, oder kurze Claim-Tx + separate Done-Tx).
- [ ] **Head-of-line-Blocking / kein Dead-Letter:** ein dauerhaft fehlschlagender Row bleibt `pending`
  und blockiert die Queue. Attempt-Counter + Backoff + Dead-Letter (`status='failed'` nach N Versuchen).
- [x] **Writer-Quota / -Authorization (erledigt 2026-06-17):** der Writer prüft jetzt autoritativ
  gegen den DB-Stand statt der appview-Reservierung zu vertrauen. `_accept_argument` setzt die
  Per-(user, ballot)-Caps gegen `app_content_creations` durch (legit-Pfad via `uri`-Ledger-Zeile
  übersprungen, Direkt-PDS-Write gezählt + eingetragen, Advisory-Lock wie `quota.py`).
  `_accept_response` spiegelt die `submit_review`-Checks (Einladung `invited=true`, `checked_in_at`,
  `state != closed`, Vote-Validität). Schliesst den Direkt-PDS-Bypass für Argumente/Responses.
Plan: `typed-kindling-flask`. [[project_architecture_layers]].

## Wo es heute wirklich offen ist: Comments & Likes (Direkt-PDS-Quota-Bypass)

Comments und Likes leben per Design im User-Repo und werden **direkt projiziert**, nur
gegated durch die (permissive) Eligibility-View — [record_handler.js:171](services/indexer/src/record_handler.js#L171)
und [:211](services/indexer/src/record_handler.js#L211):

```js
if (!isCommunityDid(did) && !(await isEligibleDid(did))) { ... return; }
```

Hier gibt es **keinen Quota-Check.** Ein User kann via direktem PDS-Write beliebig viele
Comments/Likes erzeugen und die AppView-Quota ([quota.py](services/appview/src/routes/deliberation/quota.py))
umgehen. Das ist das echte, aktuell offene Loch in dieser Klasse von Bedenken.

> Unterschied zum Writer-Quota-Punkt oben: Argumente/Responses werden über den
> Community-Account autoritativ (Choke-Point = Writer) und sind aus User-Repos heute
> verworfen; Comments/Likes haben **keinen** Promotion-Schritt — die Indexer-Projektion
> IST der einzige Choke-Point. Das Gate (inkl. Quota) muss daher hier sitzen, oder
> Comments/Likes müssten ebenfalls über eine Queue/Writer geroutet werden (eigener
> Design-Entscheid; Quota im Projektor ist replay-heikel, da das 24h-Fenster
> wall-clock-abhängig ist).

## VISION
- [ ] Translations: translations only in the appviev. a) Originalsprache im PDS speichern. b). Auch in "einfache Sprache" übersetzbar? (Inclusion)


## CHECK LATER

- Finalize lexicon setup: Poltr-specific version + Bluesky fallback (embedded entries)

## ONGOING


## Done
- Posting-Limite: Anzahl Argument Proposals + Anzahl Kommentare pro Tag und pro Monat/Abstimmug
- Auswertungsplots. (erste version.)
- Argument-Aggregation (topic groupings etc.) => noisy-or
- Taxonomy snapshot.
- Layout Der Argument View (Taxonomy)
- Email-Magic-Link: Text und Layout (Vorbild Tamedia: Verifzierungscode zum Beispiel) 
- Randomisierung von argumenten und kommentaren auf gleicher stufe: user-konstante randomisierung. 
- Scroll-positioning . springt immer noch zur top position, wenn man auf feed zurückkehrt.
- Anzahl Kommentare bei Argumenten einblenden. 
- Ballot creation endpoint: wire up `create_ballot_account()` in AppView (currently only DB + community_pds.py ready)
- Per-ballot community accounts: each ballot gets its own PDS account (`ballot-{rkey}.id.poltr.ch`), credentials in `community_accounts` table, removed `PDS_COMMUNITY_ACCOUNT_DID`/`PDS_COMMUNITY_PASSWORD` env vars
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
