# TODO

## Next

[ ] email änderungs mechanismus im profil. Notwendig? Sicher? (email wird ja nicht gespeichert) 
[ ] Comment-Tree: immer nur auswahl der comments zeigen, und dann mit "Zeige mehr" links expandierbar machen. 
[ ] @tanstack/vue-virtual beim feed view?
[ ] Posting_limit:  Das Frontend-Display (Restkontingent im Composer, Deaktivieren bei Cap, 429-Handling/i18n) war laut doc/SECURITY_AUTH.md als „pending" markiert — die Durchsetzung im Backend steht, die UI-Anzeige evtl. noch nicht vollständig.
  
[ ] Wohin kommen neue argumente. Bleiben die vorerst unzugeordnet? Oder einfach dem hauptthema angehängt.??

**Peerreviews**
[ ] Peerreview Kritierien / LLM-Support / Dito bei Argument Submit
[ ] AI Redundanz checks (peerreview und composer) — Composer-Duplikat-Check erledigt (Embedding-basiert, same-stance, Top-1; siehe doc/DUPLICATE_CHECK.md). Offen: Reviewer-Kontext im Peer-Review; optional Reranker/LLM als Stage-2.
[ ] Formulierungstipps.


[ ] Retention für `app_acceptance_queue`: erledigte Zeilen werden nie gelöscht (Processor setzt nur `status`, kein Cleanup/Cron) → Tabelle wächst unbegrenzt (~1 Request-Zeile pro aktivem User/Tag + Argumente/Responses). Cronjob ergänzen:
    ```sql
    DELETE FROM app_acceptance_queue
    WHERE status IN ('done','rejected') AND updated_at < now() - interval '30 days';
    ```

**AI**
[ ] Moderation
[ ] Firehose-Security: Appview Check: nur records von meinen appview werden commonized.
[ ] Auto-Import von Vorlagen: llm. basierend auf BK und Swissvotes.

**ATProto**
[ ] Finalize lexicon setup: Poltr-specific version + Bluesky fallback (embedded entries)


## [ ] CI / Build-Pipeline beschleunigen (build-and-push-services.yml)

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

## [ ] Calculator: öffentliche Exposition härten

Calculator hängt heute komplett + unauthentifiziert am Ingress (`calculator.poltr.info`, `path: /`).
Vor dem Ausrollen der neuen `/api/embeddings/*`-Endpoints (LLM-/Embedding-Kosten) absichern:
Ingress-`path` auf `/api/topdown` verengen (Admin-Taxonomie-Panel ruft browser-seitig,
muss public bleiben; Embeddings-Pfade nur clusterintern). Details + größerer Folge-Punkt
(topdown selbst unauthentifiziert) in [doc/CALCULATOR_EXPOSURE.md](CALCULATOR_EXPOSURE.md).
Verwandt: [LM_PEER_REVIEW.md](LM_PEER_REVIEW.md).

## [ ] Writer-Loops nebenläufigkeitssicher machen (Crosspost + Translation)

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


[ ] **DID-Genesis von Verify-Zeit entkoppeln (Nutzer will später weiterverfolgen, aktue>
   nicht prioritär):** atproto-DID-Genesis ist öffentlich sekundengenau zeitgestempelt;
   deferred creation beim Verify koppelt Verify-Zeit ≈ Genesis-Zeit → Timing-Korrelati>
   gegen die Firehose (greift im Registrierungs-Moment). Lever: **Pool vor-erzeugter D>
   zuteilen. Begleitend Auth-Logs scrubben (Token-in-URL + IP-Chain + Zeitstempel =
   Korrelations-Korpus; die „client ip chain" bringt IPs in den Auth-Pfad).

[ ] **Sybil-Resistenz der öffentlichen Aggregat-Zahlen und Peerreviews :** Rate-Limits drosseln Mailversand, nicht die Account-Zahl → Wegwer>
   Mailer = günstiger Sybil. Hängt allein an der eID-Frage: Werden die angezeigten
   Prozentzahlen **pro eID-verifizierter Identität** (Swiyu-Verifier) statt pro Account
   gewichtet? Wenn nicht eID-gegated, ist der Vektor offen.

Siehe Plan-Datei mit Detail-Mitigations. Verwandt: [[project_architecture_layers]].





  > [ ] **Wichtige Subtilität — `community_accounts` gehört zum Content-Pool, nicht zum Auth-Pool.**
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



## [ ] ATProto-native Deliberation — Härtung der Akzeptanz-Pipeline vor Prod (2026-06-16)

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

## [ ] Wo es heute wirklich offen ist: Comments & Likes (Direkt-PDS-Quota-Bypass)
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






## Done
[x] Check: per-email rate limit on code requests

[x] AI Übersetzungen im App view

[x] Neue Analyse: Gegenüberstellungen umd Ambivalenz auzuzeigen. => Ja, aber. => "Es ist ihre Entscheidung, ob sie diesen Nachteil in Kauf nehmen würden" 
[x] Layout für offnee Peerreview Notifcation: schön nervig muss es sein.. 


[x] Email-as-HMAC hash
[x] Echte Email geht NICHT mehr an den PDS 
[x] Auth-Logs (Email) gescrubbt — `mask_email()` → 

[x] Posting-Limite: Anzahl Argument Proposals + Anzahl Kommentare pro Tag und pro Monat/Abstimmug
[x] Auswertungsplots. (erste version.)
[x] Argument-Aggregation (topic groupings etc.) => noisy-or
[x] Taxonomy snapshot.
[x] Layout Der Argument View (Taxonomy)
[x] Email-Magic-Link: Text und Layout (Vorbild Tamedia: Verifzierungscode zum Beispiel) 
[x] Randomisierung von argumenten und kommentaren auf gleicher stufe: user-konstante randomisierung. 
[x] Scroll-positioning . springt immer noch zur top position, wenn man auf feed zurückkehrt.
[x] Anzahl Kommentare bei Argumenten einblenden. 
[x] Ballot creation endpoint: wire up `create_ballot_account()` in AppView (currently only DB + community_pds.py ready)
[x] Per-ballot community accounts: each ballot gets its own PDS account (`ballot-{rkey}.id.poltr.ch`), credentials in
 [x] `community_accounts` table, removed 
[x] `PDS_COMMUNITY_ACCOUNT_DID`/`PDS_COMMUNITY_PASSWORD` env vars
[x] Consolidate cross-posting from indexer to appview (revoke indexer auth.auth_creds access)
[x] Design and implement user profile pages on bluesky
[x] Create pseudonym system: Swiss mountain names table (Bergnamen)
[x] Server-side auth: httpOnly cookies, XRPC proxy, no token in localStorage
[x] RichText XSS hardening (heading tag whitelist, link href validation)
[x] Repo restructure: `infra/` (kube, cert, deployer, scripts), cleaned root
[x] Frontend restructured: auth pages under `/auth/`, API routes under `/api/`
- Dockerfile cleanup: build args from CI, no hardcoded env defaults
[x] CMS integration (Payload CMS, embedded in frontend via catch-all route)
[x] Ozone moderation setup
[x] Bluesky interoperability: login with app-password (with birthDate workaround)
[x] eID verification (eidproto + swiyu verifier)
[x] Magic link authentication
[x] Backfill cronjob (hourly)
[x] GitHub Actions CI/CD workflow
[x] Load balancer removal (hostPort setup for dev/test)
[x] Interoperability: Content on Bluesky
[x] Interoperability: Bluesky content in the app
[x] die Email↔DID-Linkage (Klartext-Email in `auth_creds`) ist ein Daten-/Krypto- Change, kein Grant-Change → Punkt 1 im „Security-Review des Auth-Umbaus" oben(Email-as-HMAC). [[project_auth_privacy_workstream]] · [[project_architecture_layers]].
