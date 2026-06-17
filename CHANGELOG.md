# Changelog

## 2026-06-17

### Legacy-Master-Key entfernt — keine Rückwärtskompatibilität mehr (`services/*`, `infra`)

Der alte Einzel-Master-Key `APPVIEW_PDS_CREDS_MASTER_KEY_B64` und sämtliche Fallback-Pfade darauf sind entfernt. Es gilt nur noch der Key-Split: USER-Key (`auth_creds`) vs. GOV-Key (`governance_accounts`).

- **`pds_creds.py`** (appview + `services/community-writer/src/shared/`, identisch gesynct): `_LEGACY_KEY_ENV` + der `or os.getenv(_LEGACY)`-Fallback in `_load_key` + der deprecated `load_master_key()`-Alias entfernt. `_load_key` verlangt jetzt strikt den jeweiligen scoped Key.
- **`atproto-publish.ts`** (CMS): `govMasterKeyB64()` ohne Legacy-Fallback → nur noch `APPVIEW_GOV_CREDS_MASTER_KEY_B64` (CMS hat ihn via secretKeyRef).
- **Secrets/Templates**: `APPVIEW_PDS_CREDS_MASTER_KEY_B64` aus `secrets.yaml` (+ `.dist`) und allen `.env.dist` raus; Kommentare entlegacyt.
- **`infra/scripts`**: Docstrings + der echte Read in `import_comments.py` auf die scoped Keys umgestellt (gov-Scripts → `APPVIEW_GOV_CREDS_MASTER_KEY_B64`, App-Passwort-Scripts → `APPVIEW_USER_CREDS_MASTER_KEY_B64`).
- Tests grün (appview 38, writer 10). Auf Dev haben USER-/GOV-Key denselben Wert → kein Re-Encryption nötig.

### Writer in eigenen Service + eigenes Image getrennt (`services/community-writer`, `services/appview`, `infra`)

Der Writer-Quellcode wird aus `services/appview` herausgelöst — die appview wird von mehreren Usern für weitere Module genutzt, der Writer ist deliberations-spezifisch. Vorher teilten sich beide Image + Source-Tree (appview-Image, `command:`-Override).

- **Neu `services/community-writer/`** (eigenes Image `ghcr.io/nikwyss/poltr-community-writer`, eigenes Dockerfile, reiner Worker ohne HTTP): `main.py` (Entrypoint `python -m src.main`) + `atproto/{crosspost,acceptance,governance}.py` + `translation/translator.py` + `arguments/peer_review_assign.py`.
- **`services/community-writer/src/shared/`** — aus appview **manuell gesyncte** Kopien (vorerst kein Shared-Package): `pds_creds.py` (Krypto, format-kritisch), `db.py`, `errors.py`, `languages.py`. Imports der vier biegen auf `src.shared.*`; alles andere behält seine Pfade.
- **appview entschlackt**: `writer_main.py`, `atproto/crosspost.py`, `atproto/acceptance.py`, `translation/translator.py` entfernt (von der appview-API nirgends importiert). `governance.py`/`peer_review_assign.py` bleiben (appview nutzt `get_did_for_ballot` bzw. den Aktivitäts-Hook). `atproto_api.py` (630 LOC) bleibt ganz bei appview — der Writer braucht null davon.
- **CI/Deploy**: `writer` als normaler Service in die Build-Matrix (eigenes Image, kein Sonderfall); Deploy `set image deployment/community-writer = poltr-community-writer:sha`. `community-writer.yaml`: Image → `poltr-community-writer`, `command:`-Override raus (CMD im Dockerfile).
- Tests verschoben: `test_acceptance.py` → `services/community-writer/tests`. appview 38 grün, writer 10 grün.
- **Hinweis manueller Sync:** Änderungen an `pds_creds/db/errors/languages` in appview müssen nach `services/community-writer/src/shared/` mitgezogen werden (v.a. `pds_creds` — Chiffrat-Format).

### Anti-Spam: Eligibility-Gate für Comments/Likes + PDS-Rate-Limits (`services/indexer`, `infra`)

Schliesst die Lücke, dass self-signed Comments/Likes direkt in User-Repos geschrieben werden können (an der appview-API + ihren Per-User-Quotas vorbei) und der Projektor sie **ungefiltert** indexierte — anders als Argumente/Reviews, die bereits durchs Eligibility-Gate laufen.

- **Indexer** ([record_handler.js](services/indexer/src/record_handler.js)): neue `isEligibleDid()` (liest nur die schmale `auth.v_eligible_participants`-View, kein Credential-Zugriff). `COLLECTION_COMMENT`- und `COLLECTION_RATING`-Creates/Updates werden jetzt gegated (`isGovernanceDid || isEligibleDid`), bevor sie in `app_comments`/`app_likes` projiziert werden. Deletes bleiben ungated (Retraktion muss immer gehen). Greift auch im Backfill-Pfad ([backfill_handler.js](services/indexer/src/backfill_handler.js) nutzt denselben `handleEvent`). Heute = registrierter Account; das künftige Ban-/eID-Overlay dockt an der View an und deckt Comments/Likes dann automatisch mit.
- **PDS-Rate-Limits** ([secrets.yaml.dist](infra/kube/secrets.yaml.dist)): `PDS_RATE_LIMITS_ENABLED="true"` + `PDS_RATE_LIMIT_BYPASS_KEY` (Header `x-ratelimit-bypass` für interne Bulk-Writer; Wiring in writer/import noch offen). Punkte-basiert pro Account (CREATE=3/UPDATE=2/DELETE=1, ~5000/h & 35000/Tag) + Per-IP-Cap. Single PDS-Replica → In-Memory-Limiter genügt (kein Redis).
- **Fix unsicherer Template-Default**: `PDS_INVITE_REQUIRED` im Template `"false"` → `"true"` (Produktion war bereits `"true"`); verhindert direkte PDS-Signups am appview-Email-Gate vorbei.
- **Like-Inflation / Vote-Stuffing geschlossen** ([db.js](services/indexer/src/db.js)): Likes haben keine appview-Quota und „1 pro Subject" wird nur über den deterministischen rkey der appview-API erzwungen — Direkt-PDS-Writes mit variierenden rkeys konnten den `like_count` (row-basiert, keine `(did,subject)`-UNIQUE) eines beliebigen Arguments/Kommentars aus **einem** Account hochtreiben (`like_count DESC` = Sortierung → Sichtbarkeit). Fix: `refreshLikeCount` zählt jetzt `COUNT(DISTINCT did)` statt `count(*)` (gilt für `app_arguments` + `app_comments`); `upsertLikeDb` überspringt zusätzlich am Projektionspunkt Duplikate (aktive Zeile für `(did, subject_uri)` unter anderem `uri` existiert bereits). Viewer-/`preference`-Subqueries nutzen bereits `LIMIT 1` → robust gegen Alt-Duplikate.

### ATProto-native Deliberation — Phase 7: Governance-Schreibpfad aus der appview-API entfernt (`services/appview`, `infra`, `doc`)

Nach erfolgreichem End-to-End-Test auf dem Dev-Cluster (User-Repo → Stage → Writer-Community-Record → Projektion + Crosspost; Pfad 3: 1 Request → 12 Invitations) wird der Legacy-Pfad aus der internet-zugewandten appview-API **endgültig entfernt**. User-authored Writes gehen jetzt **unbedingt** ins eigene User-Repo.

- **appview-API schreibt keine Governance-Records mehr:**
  - [arguments.py](services/appview/src/routes/deliberation/arguments.py): Flag `_args_user_repo_enabled` + Legacy-`create_governance_record`-Branch entfernt → immer `pds_create_record` ins User-Repo. `import httpx`/`create_governance_record` raus (`get_did_for_ballot` bleibt für den 404-Vorabcheck).
  - [reviews.py](services/appview/src/routes/deliberation/reviews.py): analog — `_responses_user_repo_enabled` + `put_governance_record`-Branch raus.
  - [peer_review_assign.py](services/appview/src/arguments/peer_review_assign.py): `_requests_user_repo_enabled` raus; `_review_hook` schreibt immer den `peerreview.request` (Assignment läuft im Writer).
- **Bleibt (Writer-Prozess, gleiches Image):** `governance.py`, `pds_creds.py` GOV-Funktionen, deren Nutzung in `acceptance.py`/`crosspost.py`/`translator.py` + die Writer-seitige `maybe_assign_reviews_for_user`. appview-API liest aus `governance_accounts` nur noch `did`/`ballot_rkey` (Ballot-Enrichment + `get_did_for_ballot`).
- **Kein Kill-Switch mehr:** Rollback ist jetzt `git revert` + Redeploy (nicht Flag→false). Der Pipeline-Pfad ist verifiziert.
- **Tests:** `test_user_repo_flag.py` (testete das entfernte Flag-Dispatch) → ersetzt durch [test_user_repo_write.py](services/appview/tests/test_user_repo_write.py) (appview schreibt **immer** ins User-Repo, `#sourceUser`). Volle Suite grün (48).
- **Docs:** [LEXICONS.md](doc/LEXICONS.md) auf das ATProto-native Modell aktualisiert (User-Repo-Original + Community-Copy mit `originUri/originCid`; Indexer staged statt „nur aus Gov-Repo") + neue Peer-Review-Sektion (`peerreview.request`/`invitation`/`response`).
- **Cluster-Rollout (Dev, erledigt):** appview läuft jetzt als eigene Rolle **`appview@`** — **kein Pod nutzt mehr `allforone`**; die tote Producer-Flag-Config ist aus `appview-secrets` raus.
- **DB-Grant verengt (erledigt, in [db-setup.sql](infra/scripts/postgres/db-setup.sql) gefaltet):** `REVOKE ALL ON auth.governance_accounts FROM appview; GRANT SELECT (did, handle, ballot_rkey, ballot_uri)` — appview kann `pw_ciphertext/pw_nonce` **nicht** lesen und nicht schreiben (DB-erzwungen, live verifiziert). Kein one-off-Skript (Workflow: End-Zustand in `db-setup.sql`).
- **Offen → Key-Split-Workstream:** der Gov-Master-Key bleibt vorerst im appview-Pod-Env (auf Dev haben USER-/GOV-/Legacy-Key denselben Wert → Entfernen wäre kosmetisch; durch den DB-Grant ist der Key für Gov-Creds ohnehin funktionslos, weil das Chiffrat unlesbar ist). Echte Trennung = distinkter Gov-Key + Re-Encryption der `governance_accounts`-Creds. Siehe doc/TODO + [[project_auth_privacy_workstream]].

## 2026-06-16

### ATProto-native Deliberation — Phase 6: Peerreview-Assignment in den Writer (Pull/Request-Modell) (`services/appview`, `services/indexer`, `infra`)

Die Review-Zuteilung (heute in appview, schreibt Invitations mit Gov-Creds) wandert in den Writer — via user-authored `peerreview.request`-Record (L12-Pull-Modell). Hinter Flag, Default aus.

- **appview** ([peer_review_assign.py](services/appview/src/arguments/peer_review_assign.py)): bei `APPVIEW_REVIEW_REQUESTS_USER_REPO_ENABLED=true` schreibt der Aktivitäts-Hook statt zuzuteilen einen `app.ch.poltr.peerreview.request` ins **User-Repo** — **max. 1×/aktiver UTC-Tag** (Tages-Throttle → „Müll in Grenzen"). `fire_and_forget` nimmt jetzt die Session; [middleware.py](services/appview/src/auth/middleware.py) baut die Session vor dem Hook und übergibt sie.
- **Projektor** ([record_handler.js](services/indexer/src/record_handler.js)): non-governance `peerreview.request`-Creates → `app_acceptance_queue` (`kind=request`), nicht projiziert.
- **Writer** ([acceptance.py](services/appview/src/atproto/acceptance.py)): `_accept_request` gated Eligibility und ruft die **wiederverwendete** `maybe_assign_reviews_for_user` (Lotterie/Tageslimit/Slots) → Invitations ins Governance-Repo. Der Writer füllt in einem Lauf die Tages-Slots.
- **Secrets**: Flag in `appview-secrets`; `writer.yaml` erbt `APPVIEW_PEER_REVIEW_DAILY_LIMIT/INVITE_PROBABILITY` aus appview-secrets.
- Zirkular-Import (`peer_review_assign → atproto_api → middleware → peer_review_assign`) durch Lazy-Import von `pds_create_record` vermieden.
- Tests: 2 neue für `_accept_request` (eligible → assign; ineligible → reject).

### ATProto-native Deliberation — Phase 5: Translator in den Writer-Prozess gezogen (`services/appview`, `infra`)

Der Übersetzungs-Worker wandert aus der internet-zugewandten appview-API in den Writer (wie der Crosspost in Phase 1) — er bleibt governance-record-basiert (fetch → inline übersetzen → putRecord), nur der Ausführungsort ändert sich.

- **Neu** `run_translation_forever()` in [translator.py](services/appview/src/translation/translator.py) (Vordergrund-Runner, setzt den Circuit-Breaker zurück); tote `start/stop_translation_loop` + `_task`-Global entfernt.
- **appview-API führt jetzt GAR KEINE** Hintergrund-Governance-Loops mehr ([fastapi.py](services/appview/src/core/fastapi.py): Lifespan startet nichts mehr — Crosspost (Phase 1) **und** Translation (Phase 5) sind weg; `start/stop_participation_loops` entfallen).
- **Writer** ([writer_main.py](services/appview/src/writer_main.py)) fährt jetzt Crosspost **+ Translation** (beide self-gated via `*_ENABLED`) + die Akzeptanz-Pipeline.
- **Secrets**: `APPVIEW_TRANSLATE_*` (inkl. Infomaniak-API-Key) von `appview-secrets` → `writer-secrets` (least privilege: appview-API hat den LLM-Token nicht mehr). `POLTR_LANGUAGES/DEFAULT` bleiben in `appview-secrets` (appview + indexer brauchen sie); `writer.yaml` erbt sie via `secretKeyRef`.
- **Folge für den GOV-Key**: einer der drei appview-Gründe für `APPVIEW_GOV_CREDS_MASTER_KEY_B64` (der Translator) fällt weg — verbleibend nur Legacy-Gov-Writes (Flags aus) + `create_ballot_account`. Entfernung in Phase 7.

### Master-Key-Split vorbereitet: getrennte Env-Namen für User- vs Governance-Creds (`services/appview`, `services/cms`, `infra`)

Vorarbeit für die Krypto-Key-Trennung: User-App-Passwörter (`auth_creds`) und Governance-Creds (`governance_accounts`) lesen jetzt **getrennte** Master-Key-Env-Vars — Code-Pfade und Env-Namen sind gespalten, der **Wert** darf auf Dev (vorerst) gleich sein.

- **Python** ([pds_creds.py](services/appview/src/atproto/pds_creds.py)): `encrypt/decrypt_app_password` lesen `APPVIEW_USER_CREDS_MASTER_KEY_B64`; neue `encrypt/decrypt_gov_password` lesen `APPVIEW_GOV_CREDS_MASTER_KEY_B64`. [governance.py](services/appview/src/atproto/governance.py) nutzt jetzt die GOV-Funktionen. Legacy-Fallback auf `APPVIEW_PDS_CREDS_MASTER_KEY_B64`, damit nichts bricht.
- **CMS** ([atproto-publish.ts](services/cms/src/lib/atproto-publish.ts)): `govMasterKeyB64()` liest den GOV-Key (Fallback auf Legacy).
- **Secrets/Manifeste**: `appview-secrets` hält beide Keys (`APPVIEW_USER_CREDS_MASTER_KEY_B64` + `APPVIEW_GOV_CREDS_MASTER_KEY_B64`); `writer.yaml` + `cms.yaml` erben nur den **GOV**-Key via `secretKeyRef`. appview-API bekommt beide via `envFrom`.
- **Verteilung der Keys:** appview = USER (+ GOV bis Phase 7), writer = GOV, cms = GOV.
- **Offen** (doc/TODO): tatsächlich **unterschiedliche** Werte setzen → `governance_accounts.pw_*` mit dem neuen Gov-Key re-encrypten, dann Legacy-Fallback entfernen.

### ATProto-native Deliberation — Pro-Pod-DB-User + Full-Split des Writers (`infra`)

Die letzten zwei Pods auf der geteilten `allforone`-Superuser-Rolle bekommen eigene, nicht-superuser DB-User. Danach nutzt **kein Pod** mehr `allforone` (= reiner Break-Glass-/DBA-Account). Zugleich ist der Writer jetzt vollständig abgetrennt (eigener Pod + eigene Rolle + eigene Secrets).

- **Neue Rollen** ([db-setup.sql](infra/scripts/postgres/db-setup.sql) + Live-Migration [add-pod-roles.sql](infra/scripts/postgres/add-pod-roles.sql)):
  - **`appview`** — volle DML auf `public` + `auth`, aber **KEIN Superuser** (kein `pg_authid`, kein `COPY PROGRAM`, kein Role-Mgmt, kein RLS-Bypass). Das ist der Hauptgewinn vs. `allforone`.
  - **`writer`** — wie der Indexer auf `public` (S/I/U), **plus** `SELECT` auf `auth.governance_accounts` inkl. `pw_ciphertext/pw_nonce` (Gov-Sessions) + `v_eligible_participants`. **Kein** `auth_creds`/Sessions-Zugriff (braucht keine User-Identität). Der Projektor/Indexer sieht die `pw`-Spalten weiterhin **nicht** — das ist die zentrale Trennung.
- **Full-Split Writer**: [writer.yaml](infra/kube/writer.yaml) zieht jetzt aus **`writer-secrets`** (eigener DB-User `writer` + Gov-Master-Key + Flags), voll entkoppelt von `appview-secrets`. Damit ist die frühere „vorläufig ein Pod"-Idee verworfen — Writer-Crash entkoppelt von der Projektion.
- **Secrets** ([secrets.yaml.dist](infra/kube/secrets.yaml.dist)): neuer `writer-secrets`-Block; `appview-secrets.APPVIEW_POSTGRES_URL` → `appview@appview` (statt `allforone`).
- **Manuell (Dev):** `add-pod-roles.sql` ausführen (Passwörter setzen), echte `secrets.yaml` auf `appview@`/`writer@` umstellen, appview- + writer-Pods neu ausrollen.
- Offen (bewusst, Phase 7): `appview` verliert `governance_accounts` erst, wenn keine Gov-Writes/Translator mehr in appview laufen; Master-Key-Split (User-Key vs Gov-Key) als TODO.

### ATProto-native Deliberation — Phase 4: PR-Responses durch dieselbe Pipeline; Crosspost-Altlast entfernt (`services/appview`, `services/indexer`)

Peer-Review-Responses laufen jetzt durch dieselbe Akzeptanz-Pipeline wie Argumente (`kind=response`) — dieselben fünf Sub-Schritte, hinter Flag, dormant by default.

- **appview** ([reviews.py](services/appview/src/routes/deliberation/reviews.py)): bei `APPVIEW_RESPONSES_USER_REPO_ENABLED=true` schreibt die Response ins **Reviewer-Repo** (`pds_create_record`) statt via `put_governance_record`. Default = Legacy.
- **Projektor** ([record_handler.js](services/indexer/src/record_handler.js)): non-governance `peerreview.response`-Creates → `app_acceptance_queue` (`kind=response`, kein Ballot — Writer löst die Governance-DID aus `record.argument` auf).
- **Writer** ([acceptance.py](services/appview/src/atproto/acceptance.py)): neuer `_accept_response`-Pfad; der Drain dispatcht jetzt nach `kind` (argument/response). Community-Response via `compose_review_rkey` (identisch zum Legacy-rkey → Dedup/Quorum unverändert) + `originUri/originCid`.
- **Echo** ([db.js](services/indexer/src/db.js) `upsertPeerreviewResponseDb`): projiziert `origin_uri/origin_cid`.
- **official/org**: bestätigt **No-op** — appview hat keinen Gov-Write für official/org-Argumente (CMS-authored via `OfficialArguments.ts`); nichts zu entfernen.
- **Cleanup**: tote `start_crosspost_loop`/`stop_crosspost_loop` (+ ungenutzter `_task`) aus `crosspost.py` entfernt — nur `run_crosspost_forever` (Writer) wird noch genutzt. Härtungs-Limits der Pipeline als TODO (`doc/TODO.md`) notiert.

### ATProto-native Deliberation — Phase 3: #sourceUser-Argumente → User-Repo + Akzeptanz-Pipeline (`services/appview`, `services/indexer`, `infra`)

Der eigentliche Umbau: user-authored Argumente werden self-signed ins **eigene User-Repo** geschrieben; die interne Schreib-Seite akzeptiert sie und schreibt den kanonischen **Community-Record** (Copy + Herkunfts-Referenz) ins Governance-Repo. Hinter **zwei Feature-Flags** (Default aus) — der gesamte neue Pfad ist **dormant**, das heutige Verhalten unverändert.

- **Schema** (`db-setup.sql`): neue Tabelle **`app_acceptance_queue`** (Projektor→Writer-Handoff + Reconcile-Queue, `kind` ∈ argument/response/request, `UNIQUE(user_uri)`); Spalten **`origin_uri`/`origin_cid`** auf `app_arguments` + `app_peerreview_responses` (Provenienz auf das User-Original).
- **appview** ([arguments.py](services/appview/src/routes/deliberation/arguments.py)): bei `APPVIEW_ARGS_USER_REPO_ENABLED=true` schreibt der `#sourceUser`-Create ins **User-Repo** (`pds_create_record`) statt ins Governance-Repo; Quota-Reservierung bleibt synchron davor (L11). Default = Legacy-Pfad.
- **Projektor** ([record_handler.js](services/indexer/src/record_handler.js)): bei `ACCEPTANCE_PIPELINE_ENABLED=true` werden non-governance `ballot.argument`-**Creates** in `app_acceptance_queue` gestaged (`stageForAcceptance` + `NOTIFY`) statt ignoriert; Update/Delete des Originals ignoriert (Drift). Governance-DID-Pfad projiziert wie heute.
- **Writer** ([acceptance.py](services/appview/src/atproto/acceptance.py), in `writer_main`): `LISTEN/NOTIFY`-getriebener Drain (`FOR UPDATE SKIP LOCKED`) → Gate (Eligibility-View) → Community-Record (Copy + `source:{originUri,originCid}`) via **deterministischem create-only rkey** (idempotent, crash-recovery via Existenz-Check) → Queue `done`/`rejected`; transiente Fehler bleiben `pending` (Retry).
- **Echo** ([db.js](services/indexer/src/db.js) `upsertArgumentDb`): projiziert `origin_uri`/`origin_cid` aus dem Community-Record (null für Legacy/official/org).
- **Live-Apply (Dev):** idempotentes Skript `infra/scripts/postgres/add-acceptance-pipeline.sql` (Tabelle + `origin_*`-Spalten + Grants) gegen die `appview`-DB anwenden. Flags **erst gemeinsam** einschalten (appview + indexer + writer), sonst verschwinden Argumente (kein Consumer/Producer).
- Bekannte Grenzen (Dev-tauglich, später härten): Drain hält eine DB-Transaktion über den PDS-Write (Long-Tx bei hohem Volumen); ein dauerhaft fehlschlagender Row blockiert die Queue (kein Dead-Letter/Backoff). Quota im Writer noch nicht (vertraut appview-Reservierung; Föderations-Quota = später).

### ATProto-native Deliberation — Phase 2: Eligibility-View für das Gate der internen Schreib-Seite (`infra`)

L3-Datenfundament für das künftige Akzeptanz-Gate (Phase 3): die interne Seite muss „ist dieser DID ein eingeschriebener POLTR-Teilnehmer?" prüfen können — **ohne** `auth_creds`-Zugriff (Email/Creds bleiben unsichtbar, wahrt das Auth-Hardening).

- **Neu** `auth.v_eligible_participants(did, eligible)` in `infra/scripts/postgres/db-setup.sql` — heute `eligible = jeder registrierte Account`; Ban-/eID-Overlay dockt später an, ohne Konsumenten-Änderung. Postgres-View läuft mit Owner-Rechten (allforone) → die abfragende Rolle sieht nur `(did, eligible)`.
- **Grant** `SELECT ON auth.v_eligible_participants TO indexer` (die interne Seite checkt Eligibility darüber; der Indexer behält **keinen** direkten `auth_creds`-Zugriff).
- Reine Schema-Erweiterung (View + Grant), kein Code-Pfad nutzt sie noch — die **Gate-Durchsetzung** wird in Phase 3 verdrahtet (wo der Writer die `app_acceptance_queue` verarbeitet); jetzt schon zu verdrahten wäre Dead Code.
- **Live-Apply (Dev, manuell):** die zwei Statements aus db-setup.sql (CREATE VIEW + GRANT) gegen die `appview`-DB ausführen.

### ATProto-native Deliberation — Phase 1: Crosspost in eigenen Writer-Prozess ausgelagert (`services/appview`, `infra`)

Erster Schritt der Umstellung (Plan `typed-kindling-flask`): Governance-Schreibarbeit wandert aus der internet-zugewandten appview-API in eine interne Schreib-Seite. Phase 1 betrifft nur das Bluesky-Crossposting — isoliert, ohne Änderung an User-Flows.

- **Neu** `services/appview/src/writer_main.py`: Standalone-Worker-Entrypoint (`python -m src.writer_main`), der den Crosspost-Loop im Vordergrund laufen lässt — **reuse** von `src/atproto/crosspost.py` (neue öffentliche `run_crosspost_forever()`); Session/`createRecord`/Idempotenz (`bsky_post_uri`-Guard) sind dort schon vorhanden.
- **appview-API führt das Crossposting nicht mehr aus**: `start/stop_crosspost_loop` aus `src/core/fastapi.py` (Lifespan) entfernt. Übersetzungs-Loop läuft vorerst weiter in der API (wandert in einer späteren Phase).
- **Neu** `infra/kube/writer.yaml`: Deployment mit demselben appview-Image, Command `python -m src.writer_main`, `envFrom: appview-secrets` (DB + Master-Key) + `PDS_INTERNAL_URL`. Kein Service (reiner Hintergrund-Worker).
- Keine DB-/Grant-Änderungen in dieser Phase (Writer nutzt vorerst die bestehende DB-Rolle + Master-Key via appview-secrets; die gescopte `writer`-Rolle + Grant-Umbau kommen in einer späteren Phase).
- **Deploy-Schritt (manuell):** `kubectl apply -f infra/kube/writer.yaml`; sicherstellen, dass `APPVIEW_CROSSPOST_ENABLED="true"` in `appview-secrets` steht (der Writer erbt es). Alternativ als zweiter Container in `indexer.yaml` (L9 „ein Pod").

### Postgres-Härtung: ozone & cms aus der geteilten `allforone`-Superuser-Rolle herausgelöst (`infra`)

Bisher verbanden sich appview, cms und ozone alle mit derselben Bootstrap-Superuser-Rolle `allforone`. Ein kompromittierter Ozone- oder CMS-Pod konnte damit das komplette `auth`-Schema der appview-DB lesen/schreiben (inkl. `auth_creds`, `auth_sessions`, Governance-Credentials). Jetzt haben ozone und cms eigene, eng gescopte Login-Rollen.

- **`ozone`**: eigene Rolle, **kein** Zugriff auf die appview-DB (Owner ihrer eigenen `ozone`-DB).
- **`cms`**: eigene Rolle; auf der appview-DB nur `SELECT, INSERT` auf `auth.governance_accounts` + `public.app_taxonomy_snapshot` (entspricht der tatsächlichen Code-Nutzung in `atproto-publish.ts`), Owner ihrer eigenen `cms`-DB.
- **appview-DB CONNECT** wird von `PUBLIC` entzogen und nur noch explizit an `indexer`/`calculator`/`cms` vergeben → ozone (und jede andere Rolle) kann sich gar nicht erst verbinden.
- **calculator-Cleanup**: ungenutzte `INSERT/UPDATE/DELETE`-Rechte auf `app_taxonomy_node`/`_membership` entzogen (Endpoints sind reines Compute; Persistenz läuft über CMS-Snapshot → Indexer), `SELECT` bleibt. Zusätzlich den zugehörigen toten Code in `services/calculator/src/core/db.py` entfernt: die nie aufgerufenen DB-Writer `split_node`/`add_topic_memberships`, der tote Reader `fetch_overfull_nodes` (der `/grow`-Endpoint rechnet aus `req.tree`) sowie die nur davon genutzten Helfer `_slugify`/`_unique_slug`/`_UMLAUT` (~120 Zeilen).
- **Labeler** bewusst ausgelassen (kein Deployment vorhanden).
- Geändert: `infra/scripts/postgres/db-setup.sql` (End-State), neu `infra/scripts/postgres/harden-service-roles.sql` (Live-Migration für laufenden Cluster, inkl. Ownership-Transfer der ozone-/cms-DBs ohne den `REASSIGN OWNED`-Footgun), `infra/kube/secrets.yaml.dist` (ozone-/cms-Connection-Strings auf neue User) und `infra/kube/cms.yaml` (`APPVIEW_POSTGRES_URL` aus `cms-secrets` statt `appview-secrets`).
- **Manueller Schritt**: echte `secrets.yaml` auf die neuen User/Passwörter umstellen, K8s-Secrets neu anwenden und cms-/ozone-Deployments neu ausrollen.

## 2026-06-15

### Neue Analyse-Sicht „Positionswolken" (Raincloud) je Thema (`services/front`)

Schwesteransicht zum Positionsband: Statt eines einzelnen Balkens (Aggregat) zeigt jede Themen-Zeile die **Verteilung** der einzelnen Argument-Bewertungen entlang derselben Achse Nein ← neutral → Ja — Wolke (KDE-Dichte) + Box (Quartile/Median/Whisker) + ein gejitterter Punkt pro Argument. Farbe folgt dem Median (blau Richtung Ja, terrakotta Richtung Nein) wie im Positionsband.

- Neue Komponente `services/front/src/components/position-cloud.tsx`, eingehängt direkt unter `PositionBand` in der Taxonomie-Analyse-Sektion.
- i18n-Keys `taxonomy.cloudTitle` / `taxonomy.cloudSubtitle` in allen fünf Sprachen (de/en/fr/it/rm).

### Next.js auf gepatchte Versionen angehoben — SSRF via WebSocket-Upgrade (CVE-2026-44578) (`services/front`, `services/eidproto`, `services/cms`)

Behebt die High-Severity-SSRF-Lücke ([GHSA-c4j6-fc7j-m34r](https://github.com/advisories/GHSA-c4j6-fc7j-m34r), CVE-2026-44578), bei der ein unauthentifizierter Angreifer über manipulierte WebSocket-Upgrade-Requests interne Dienste/Cloud-Metadaten erreichen kann (betrifft nur self-hosted Deployments).

- **`services/front`** (npm): `next` 16.1.6 → 16.2.9
- **`services/eidproto`** (pnpm): `next` + `eslint-config-next` 16.1.6 → 16.2.9
- **`services/cms`** (pnpm): `next` + `eslint-config-next` 15.4.11 → 15.5.19 (im 15.5.x-Zweig bleibend wegen Payload-3.74-Peer-Range `^15.4.10`)

Patch-Versionen sind 15.5.16 / 16.2.5; angehoben auf die jeweils aktuellsten Patches der Minor-Linie. Lockfiles aktualisiert.

### Taxonomie auf ATProto-Quelle-der-Wahrheit umgestellt: PDS → Indexer → AppView (`services/cms`, `services/indexer`, `services/calculator`, `services/appview`, `lexicons`, `infra`)

Vorher liefen Argumente und Taxonomie **entgegengesetzt**: Argumente PDS→Indexer→DB (PDS = Wahrheit), Taxonomie direkt vom Calculator in die DB. Jetzt folgt die Taxonomie demselben Muster — der `app.ch.poltr.taxonomy.snapshot`-Record ist die **Quelle der Wahrheit**, die DB ein abgeleitetes, rebuildbares Read-Model.

- **Neues Lexikon `app.ch.poltr.taxonomy.snapshot`** (`lexicons/app/ch/poltr/taxonomy/snapshot.json`, neben `app.ch.poltr.taxonomy.get`): ein Record = ganzer Baum (atomar). Knoten inline (`key`, `name`, `description`, `introduction`, `importance`, `parent`-key), Argumente per **rkey** (gleiches Governance-Repo); Geschwister-Reihenfolge = Array-Order. `version` + `contentHash` + `prev` für eine verkettete History. Nur de-CH; Übersetzungen sind regenerierbare Ableitungen.
- **CMS schreibt beim „Persistieren" direkt in die PDS** (`services/cms/src/lib/atproto-publish.ts` `publishTaxonomySnapshot`, Endpoint `POST /api/ballots/taxonomy-snapshot` in `collections/Ballots.ts`): serialisiert den Editor-Baum, vergibt neuen Knoten einen eingefrorenen `key` (TS-Port von `_slugify`), dedupliziert über Content-Hash (inkl. Reihenfolge) und schreibt append-only mit TID-rkey. `TaxonomyPanel` wartet danach auf die Indexer-Übernahme (Eventual Consistency) und resynct. Kein Calculator-`/save` mehr.
- **Indexer projiziert den Snapshot** (`services/indexer/src/record_handler.js` + `db.js` `projectTaxonomySnapshotDb`): UPSERT je `(ballot_rkey, key)`, synthetische Wurzel, `depth`/`node_order` aus dem Record, Waisen-Knoten gelöscht (CASCADE), Memberships ersetzt und gegen **lebende** Argumente abgeglichen. **Übersetzungen überleben:** die Spalten `langs`/`translations`/`translation_status` werden nicht angefasst; der bestehende Reset-Trigger übersetzt nur geänderte Knoten neu.
- **Calculator = reines Compute** (`services/calculator`): `/save` und die DB-Persist-Funktionen (`persist_topic_tree`/`save_topic_tree_full`/`_insert_topic_tree`) entfernt; `/induce` ist reine Vorschau. `/tree`, `/classify`, `/grow`, `/branch_unplaced` (lesen/rechnen) bleiben.
- **Schema** (`infra/scripts/postgres`): neue Spalte `app_taxonomy_node.node_order` (Serving + `/tree` sortieren nach `depth, node_order, id`); Indexer bekommt `GRANT DELETE` auf die Taxonomie-Tabellen. Migrationen `migrate-taxonomy-node-order.sql` + `migrate-taxonomy-snapshots.sql` (History-Index `app_taxonomy_snapshot`). Neue Env `CALCULATOR_INTERNAL_URL` (`infra/kube/cms.yaml`) für den Backfill-Lesepfad.
- **Backfill:** `backfillTaxonomySnapshot(ballotRkey)` erzeugt aus dem bestehenden DB-Baum einen Initial-Snapshot in der PDS (einmalig je Ballot, bevor der Projektionspfad greift).
- **Größe:** selbst beim Maximum (3000 Argumente, ~500 Knoten) ~210 KB CBOR — ~5× Puffer unter dem 1-MiB-Record-Limit, kein Blob nötig.
- **Deploy-Reihenfolge:** Migrationen anwenden → Backfill je Ballot ausführen → Service-Images ausrollen.

### Taxonomie-Tabellen vereinheitlicht: `app_topic_*` → `app_taxonomy_*` (`services/calculator`, `services/appview`, `services/indexer`, `services/cms`, `infra`)

- **Umbenennung** `app_topic_node` → `app_taxonomy_node`, `app_topic_membership` → `app_taxonomy_membership` (+ das neue `app_taxonomy_snapshot`), inkl. Indexe, Reset-Trigger/Funktion und benannte Check-Constraints. Damit heisst die gesamte Taxonomie-Schicht durchgängig `taxonomy` (DB-Storage = vormals einziger `topic`-Ausreisser, jetzt aligned mit `app.ch.poltr.taxonomy.*`, `taxonomy.py`, `TaxonomyPanel`).
- **Alle SQL-Referenzen** in Calculator (`core/db.py`), AppView (`deliberation/taxonomy.py`, `deliberation/arguments.py`, `translation/translator.py`), Indexer (`db.js`), CMS (`lib/atproto-publish.ts`) und `infra/scripts/reset_ballot_template.py` angepasst.
- **DB-Migration** `infra/scripts/postgres/migrate-rename-taxonomy.sql` (`ALTER … RENAME`, idempotent, No-op auf frischen DBs) für bestehende Deployments; `db-setup.sql` nutzt die neuen Namen direkt. Historische Migrationen (`migrate-topics.sql`, `migrate-topic-translations.sql`) bleiben eingefroren. GRANTs/Trigger überleben das RENAME → kein Re-Grant nötig.
- **Deploy-Reihenfolge:** Migration **vor** dem Rollout der neuen Service-Images ausführen (die alten Images lesen noch `app_topic_*`).

## 2026-06-11

### Einheitlicher Auth-Screen + vereinfachte Magic-Link-Email (`services/appview`, `services/front`, `infra`, `doc`)

- **Ein einziger Begrüssungs-Screen** statt Login/Registrieren-Trennung (`front/src/app/(auth)/page.tsx`): Maskottchen-Tile, Serif-Titel „Willkommen", ein E-Mail-Feld, „Link senden", Copy „Neu hier? Dein Konto wird automatisch erstellt." Die Register-Seite und die beiden alten Verify-Seiten (`auth/register`, `auth/verify-login`, `auth/verify-registration`) sind gelöscht.
- **Neuer Unified-Endpoint `ch.poltr.auth.start`** (`routes/auth/__init__.py`, `auth/magic_link_handler.py`): entscheidet **serverseitig** Login vs. Registrierung und versendet den passenden Text — die HTTP-Antwort ist für beide Fälle identisch (enumeration-safe). Bis zur E-Mail ist der Flow für den Nutzer ununterscheidbar; erst der **stark kontrastierte E-Mail-Text** („Willkommen zurück" vs. „Dein neuer POLTR-Account") verrät, was passiert ist. `sendMagicLink` und `register` bleiben lauffähig, sind aber **deprecated** (Log-Warnung).
- **E-Mail = nur noch Magic-Link** (`core/email_service.py`): kein 6-stelliger Code mehr in der Mail; Link vereinheitlicht auf `/auth/verify?token=…`.
- **Cross-Browser-Code** (`auth/verify/`): Öffnet der Link in einem **anderen** Browser als dem der E-Mail-Eingabe, zeigt dieser Browser (B) den 6-stelligen Code — einzugeben auf dem Startgerät (A). Gleicher Browser → Bestätigungs-Button. Erkennung über ein `httpOnly`-Initiator-Cookie (`poltr_auth_init`, SHA-256 in neuer Spalte `initiator_id`, Migration `007`); Preflight `ch.poltr.auth.checkLink` (non-consuming). `ch.poltr.auth.verifyShortCode` ist jetzt purpose-agnostisch (sucht beide Pending-Tabellen).
- **Warte-Screen pollt** (`ch.poltr.auth.waitStatus`): erkennt Login-in-anderem-Tab → „Angemeldet, Zur App / Tab schliessen", sowie abgelaufenen/verbrauchten Link → „Neuen Link anfordern".
- **Security-Härtungen:** Anti-Phishing-Warnung + Ziel-E-Mail an der Code-Anzeige (gegen Device-Code-Phishing); `Referrer-Policy: no-referrer` auf `/auth/verify`; `start` löscht alte Login-Pending-Rows → ein lebender Code (Brute-Force-Cap nicht durch Neu-Anfordern umgehbar); `return_url` serverseitig via `safe_return_url`. Dokumentiert in `doc/SECURITY_AUTH.md`.
- **Hinweis (separater Workstream):** Deanonymisierung/Sybil (Email↔DID-Linkage im Klartext, DID-Genesis-Timing, eID-Gating) bleiben bewusst ausserhalb dieses Umbaus.

## 2026-06-09

### Taxonomie-Übersetzung: Topic-Knoten via Apertus, direkt-in-DB (`services/appview`, `infra`)

- **`app_topic_node` um Übersetzung erweitert** (`langs` / `translations` jsonb / `translation_status`, plus Partial-Index + Reset-Trigger). Migration `infra/scripts/postgres/migrate-topic-translations.sql`, auch in `db-setup.sql`. Übersetzt werden die **voter-facing** Felder `name` + `introduction`; `description` bleibt intern/deutsch.
- **Zentraler Unterschied zu Argumenten:** Taxonomie lebt nur in der DB (kein PDS/Firehose) → der Worker schreibt die Übersetzung **direkt per `UPDATE`** und rechnet `translation_status` selbst (`_derive_status`). Status flippt sofort auf `complete` → kein Re-Translation-Loop, kein Circuit-Breaker nötig.
- **Gleicher Worker** (`translator.py`): LLM-Call zu `_chat_completion` generalisiert (Argumente + Topics teilen Apertus-Call/Retry/Dual-Parser); neue `_process_topics_batch` / `_process_topic`, gated über `APPVIEW_TRANSLATE_TOPICS_ENABLED` (Default **an** — low-volume). Name-only-Knoten (leere `introduction`) werden korrekt behandelt.
- **Serving** (`taxonomy.py`): neuer `pick_node_translation` (analog `pick_translation`) lokalisiert `name`/`introduction` pro Knoten nach `?lang`. Frontend unverändert (schickt `lang` schon).
- **Reset-Trigger:** ändert sich `name`/`introduction` (Calculator-Rebuild / CMS-Edit), werden `translations` verworfen und Status auf `pending` → Worker übersetzt neu.

### Argument-/Comment-Übersetzung: LLM-Call angeschlossen (Apertus @ Infomaniak), vorerst nur `de,en` (`services/appview`, `services/indexer`, `infra`, `doc`)

- **`_translate_via_llm` ist kein Stub mehr** (`services/appview/src/translation/translator.py`): Der Worker übersetzt Argumente (inline `translations[]`) und Comments (Sidecar-Records) jetzt über **Infomaniak AI Tools** (OpenAI-kompatible Chat-Completions, Schweizer Hosting → Datensouveränität) mit dem Schweizer Open-Modell **Apertus** (`swiss-ai/Apertus-70B-Instruct-2509`, Default). Strukturierte Ausgabe per JSON-Prompt erzwungen (Infomaniak unterstützt kein forced tool-use); ` ```json `-Fences werden gestrippt, transiente Gateway-Fehler (429/5xx) mit 1/2/4 s Backoff wiederholt, permanente (400/401) sofort durchgereicht. Kein stiller Provider-Fallback. Pipeline (DB → Worker → PDS → Indexer → DB) unverändert, Schreibweg bleibt `putRecord` auf den Governance-Account.
- **Neue Env-Vars** (`APPVIEW_TRANSLATE_BASE_URL`, `_PRODUCT_ID`, `_API_KEY`; `APPVIEW_TRANSLATE_MODEL`-Default jetzt Apertus statt `claude-haiku-4-5`). Worker teilt sich Infomaniak-Produkt + Token mit den Calculator-Embeddings. Verdrahtet in `appview-secrets` (`secrets.yaml` + `.dist`) und `services/appview/.env.dist`; `APPVIEW_TRANSLATE_ENABLED=true`.
- **Sprachen vorerst auf `de,en` reduziert** (Original Deutsch → Englisch): `POLTR_LANGUAGES=de,en` konsistent in `appview-secrets` **und** `indexer-secrets` (`secrets.yaml` + beide `.env.dist`). Andere Zielsprachen (fr/it/rm) damit deaktiviert. **Hinweis:** Die Frontend-UI-Sprachen (`NEXT_PUBLIC_POLTR_LANGUAGES`) sind davon getrennt und ggf. separat anzupassen.
- **Doku:** `doc/RECORD_TRANSLATIONS.md` (Phase-2-Stub-Hinweise → angeschlossen, Env-Tabelle) und `doc/infomaniak.md` (Status „in Verwendung") aktualisiert.

## 2026-06-07

### Argument-Views: eigener „Argumentarium"-Header; Ballot-Hero auf die Info-Seite (`services/front`)

- **Neuer `ArgumentariumHeader`** (`components/argumentarium-header.tsx`) auf **booklet** + **taxonomy**: Titel „Argumentarium zur Vorlage «{name}»" + erklärender Einführungstext (thematisch sortiert, offizielle Broschüren-Argumente von Anfang an, Community kann eigene anführen, alles bewert- und diskutierbar). Neue i18n-Keys `argumentarium.title`/`argumentarium.intro` in allen 5 Locales.
- **Der bisherige Ballot-Hero** (Datum · Typ, Serif-Titel, Argument-/Kommentar-Zähler, ausklappbare Beschreibung) ist von den Argument-Seiten verschwunden und steht jetzt auf der **Info-Seite** (`ballot/[id]/info`, lädt den Ballot via `getBallot` und rendert `BallotHeader`). Booklet: die inline Hero-Card + `ExpandableText` entfernt; Taxonomy: `BallotHeader` → `ArgumentariumHeader`.

### Ballot-CMS-Layout + Membership-Schema: Status-Header, confidence 1–5, is_primary entfernt (`services/cms`, `services/calculator`, `infra`)

- **CMS Ballots-Editor umgeräumt** (`Ballots.ts`, neu `components/BallotStatusControl.tsx`): Der übergreifende **Status** sitzt jetzt als Select **links neben den Save/Publish-Buttons** (`admin.components.edit.beforeDocumentControls`; das Feld selbst ist `admin.hidden` und wird über `useField` gebunden) statt in der Sidebar. **Governance DID + Handle** sind aus der Sidebar ins erste Tab „Allgemein" gewandert (read-only).
- **`originLanguage` ist kein Dropdown mehr** (neu `components/OriginLanguageNote.tsx`): CMS-Inhalte werden immer auf Deutsch erfasst → das Feld ist auf `'de'` hardcodiert (`admin.hidden`, bleibt als Datenfeld für die „Original auf X"-Badges in Frontend/AppView) und erscheint nur noch als read-only **Seitenbemerkung** in der Sidebar.
- **`app_topic_membership.confidence` ist jetzt eine 1–5-Skala** (smallint CHECK, wie die Node-`importance`) statt eines ungenutzten `real`. Der Klassifikator (`_CLASSIFY_ARGS_TOOL` / `classify_arguments`) gibt pro Zuordnung eine Konfidenz 1–5 zurück; sie fliesst über `/induce` und `/classify` in die Persistenz. (Hinweis: selbst-gemeldete LLM-Konfidenz ist grob/optimistisch — v.a. nützlich, um seltene unsichere Zuordnungen zu erkennen.)
- **`is_primary` entfernt** (war vestigial, immer `true`): Spalte + Partial-Unique-Index raus, ersetzt durch `UNIQUE (ballot_rkey, argument_uri)` (= genau EIN Knoten pro Argument). Aufgeräumt in `db.py`, `prototype.py`, `router.py` und `TaxonomyPanel.tsx`. `stance` bleibt 1:1 `app_arguments.type` (PRO/CONTRA, keine semantische Analyse).
- **Schema:** `db-setup.sql` (final) + idempotenter Upgrade-Pfad in `migrate-topics.sql` (löscht etwaige `is_primary=false`-Zeilen, dropt Spalte/Index, `confidence real→smallint`, neues Unique). Re-Run von `migrate-topics.sql` gegen prod genügt.

### Legacy bottom-up Taxonomie + Open Coding vollständig entfernt (`services/calculator`, `services/appview`, `services/indexer`, `services/cms`, `infra`, `doc`)

Der produktive Pfad ist die top-down Themen-Hierarchie (`app_topic_*`). Die alte, emergente Achsen-Welt (Open Coding → versionierte `app_taxonomy_*`-Läufe) wird nicht mehr gebraucht und ist komplett raus.

- **Calculator:** `src/opencoding/` (Cron-Worker), `src/tags/` (Axial Coding, Prebundle, Embeddings), `src/llm/infomaniak_chat.py` und `src/prompts.py` gelöscht. `main.py` registriert nur noch den `topdown`-Router; `get_open_coder()` + die `open_code`/`axial_group`/`split_axis`-Methoden (base/anthropic_client) und alle Embedding-/Open-Coding-Env (`config.py`) entfernt. `db.py`: `fetch_open_codes_for_ballot`, `ballot_coding_coverage`, `persist_taxonomy`, `fetch_codeable_ballot_rkeys` weg. `prototype.py`: Open-Code-Pfad (`induce_tree`, code-`classify`, `serialize_node`, `load_inputs`, `persisted_to_internal`, `overlay_*`, `_print_tree`, `classify_incremental`, `overfull_candidates`, `run`) entfernt; verbliebene Prompts von „Codes" auf „Argumente" umformuliert. `/api/topdown/status` liefert kein `coverage` mehr.
- **Schema:** `app_argument_open_codes`, `app_taxonomy_run/axis/bundle/membership`, `app_arguments_axis` aus `db-setup.sql` entfernt, calculator-GRANTs auf `app_topic_*` reduziert; Migrationen `migrate-open-codes.sql` / `migrate-taxonomy.sql` gelöscht. Neues **`drop-legacy-taxonomy.sql`** (DROP TABLE … CASCADE) für bestehende DBs.
- **Indexer:** `cascadeDeleteArgumentDerived` löscht nur noch `app_topic_membership` (keine `app_argument_open_codes` / `app_taxonomy_membership` / `app_arguments_axis`).
- **CMS:** Open-Coding-Coverage-Anzeige + `/status`-Coverage-Fetch aus `TaxonomyPanel.tsx` entfernt.
- **Infra/Doku:** Opencoding-Cronjob-Sektion (`cronjobs.yaml`), Embedding-/Open-Coding-Secrets (`secrets.yaml.dist`, `.env.dist`), Calculator-README neu geschrieben; `doc/argument_clustering.md` + `doc/topdown_taxonomy_todo.md` gelöscht. `migrate-ballot-status.sql`-Grant bleibt (Calculator liest weiterhin die amtliche Vorlagen-Beschreibung als Themen-Kontext).

## 2026-06-06

### Top-down Taxonomie: voter-facing `introduction` je Thema + Card-Redesign (`infra`, `services/calculator`, `services/appview`, `services/cms`, `services/front`)

- **Neue Spalte `app_topic_node.introduction`** (`text`, nullable) — getrennt von `description` (die nur interner LLM-Klassifikations-Kontext ist): eine an die **Stimmbürgerschaft** gerichtete Einleitung, warum das Thema bei der Abstimmung zählt und für wen. Migration `migrate-topics.sql` (`ADD COLUMN IF NOT EXISTS`) + `db-setup.sql`.
- **LLM entwirft sie mit.** `propose_topics` / `_PROPOSE_TOOL` (`src/topdown/prototype.py`) generieren pro Thema zusätzlich eine `introduction` (neuer `_INTRODUCTION_NOTE` an allen propose-Prompts: Wurzeln, Subs, neue Äste); round-trippt durch `_distribute_args`, `serialize_node_args` und `db._insert_topic_tree`/`fetch_topic_tree`.
- **CMS editierbar.** `TaxonomyPanel.tsx` bekommt je Knoten (ausser Wurzel) ein Introduction-Textarea; `ENode`/`Subtopic`/`withUids`/`toServer` sowie `applySplit`/`applyNewBranches` tragen das Feld mit.
- **Frontend zeigt sie statt `description`.** `taxonomy.get` liefert `introduction` (auch über `_flatten_child`/`_slim`); die ThemeCard (`…/arguments/taxonomy/page.tsx`) rendert die voter-facing `introduction` statt der internen `description`. Zusätzlich entschlackt: kein „Für dich"-Insight-Panel & kein Auf-/Zuklappen mehr auf der Main-View (immer offen), Cards schlichter/kompakter, max. 3 Argumente je Seite, Themen nach `importance` sortiert (Gleichstand → user-stabiler Zufall).

### Top-down Taxonomie: „andere"/nicht-zugeordnet sauber trennen (`services/calculator`, `services/appview`, `services/cms`)

- **Wurzel-Durchfaller werden nicht mehr im Baum platziert.** `classify_incremental` (`src/topdown/prototype.py`) bekommt einen `is_root`-Pfad: Codes, die in KEIN Oberthema passen (`andere` direkt an der Wurzel), erhalten keine `app_topic_membership` mehr und bleiben „nicht zugeordnet". `andere` auf tieferen Ebenen bleibt unverändert legitim am Themenknoten hängen (übergreifend zum Thema — bewusst NICHT angefasst).
- **Frontend blendet den Alt-„andere"-Topf aus.** `taxonomy.get` (`services/appview/.../deliberation/taxonomy.py`) liefert direkt am Wurzelknoten (`parent_id IS NULL`) hängende Argumente nicht mehr aus (defensiver Filter, deckt auch Altbestände ab) — Argumente erscheinen nur noch unter echten Ästen.
- **CMS-Panel bekommt einen „Nicht zugeordnet"-Bereich.** `TaxonomyPanel.tsx` zeigt Argumente mit mindestens einem nicht zugeordneten Code; Default nur **„ganz fehlt"** (kein Code im Baum), **„teilweise vertreten"** hinter einem Toggle (Badge nennt, in welchem Ast das Argument schon hängt). Admin-Aktionen je Eintrag: **einem bestehenden Ast zuordnen** (lokaler State-Merge, persistiert mit „Persistieren") oder **neuen Hauptast aus den ganz fehlenden bilden**. Neue Calculator-Endpoints `GET /api/topdown/unplaced` (Detail-Query `db.fetch_unplaced_codes_detailed`) und `POST /api/topdown/branch_unplaced` (neue Hauptäste via `_SYS_NEW_BRANCHES`). Keine Schema-Änderung.

## 2026-06-03

### New service: Calculator — statistics & LLM functions (`services/calculator`, `infra/kube`, `.github`)

- **New Python 3.11 + FastAPI service** at `services/calculator`, mirroring the appview's layout/Dockerfile/start.sh conventions. Endpoint `calculator.poltr.info` (intern `calculator.poltr.svc.cluster.local`), container port 3000. Stateless and ATProto-free: it computes/classifies on request payloads and returns the result; persistence and PDS/DB wiring stay with the callers (AppView/Indexer)
- **First endpoint `POST /api/tags/induce`** — emergent, versioned taxonomy induction for arguments. Starts from an empty taxonomy, classifies each argument into an existing tag **or** proposes a new one, optionally reorganizes (split full tags, retire orphaned ones) and returns the full auditable snapshot (tags + assignments + taxonomy version + change log + per-argument steps). Every assignment carries the `taxonomy_version` it was made under → traceable, which matters for a democratic-trust platform. `GET /healthz` for liveness/readiness
- **LLM.** `src/llm/factory.py::get_llm()` returns `AnthropicLLM` (forced tool-use, model from `CALCULATOR_LLM_MODEL`, default `claude-haiku-4-5`); `ANTHROPIC_API_KEY` is required — without it the LLM endpoints return `503 LLM not configured` (no silent fallback). `AnthropicLLM` implements `classify_or_propose` / `split_tag` / `propose_merge` (+ `open_code` / `axial_group` for Variante B) and fails safe (logs + Sonstiges-fallback) on API errors
- **Infra.** New `infra/kube/calculator.yaml` (Deployment + Service, liveness/readiness on `/healthz`, `envFrom: calculator-secrets`); ingress rule `calculator.poltr.info` → `calculator:80` added to `infra/kube/ingress.yaml`; `calculator-secrets` block added to `infra/kube/secrets.yaml.dist`. CI: `calculator` added to the build matrix and the deploy step in `.github/workflows/build-and-push-services.yml` (image `ghcr.io/nikwyss/poltr-calculator`)
- **ATProto source.** `/api/tags/induce` lädt die Argumente standardmäßig aus einem ATProto-Repo (`com.atproto.repo.listRecords`, kein Auth) — neuer `src/atproto/client.py`. Default-`source`: das POLTR-Governance-Repo, erste 10 Records (`CALCULATOR_PDS_HOST` / `CALCULATOR_DEFAULT_ARGUMENT_DID` / `CALCULATOR_DEFAULT_ARGUMENT_LIMIT`). `arguments` im Body übersteuert (inline-Modus, für Tests)
- **Variante B: `POST /api/tags/induce-batch`** — reihenfolge-unabhängige Taxonomie im Grounded-Theory-Stil. Phase 1 Open Coding (jedes Argument unabhängig + parallel in mehrere Codes, `_OPEN_CODING_CONCURRENCY=5` via `asyncio.to_thread`), Phase 2 Axial Coding (alle Codes gemeinsam zu wenigen Themen, Zuordnung über stabile Code-IDs statt fragilem Label-String-Matching), Phase 3 Mehrfach-Zuordnung. Neue LLM-Methoden `open_code` / `axial_group` in `AnthropicLLM`; neue `TagSystem.batch_induce()` (akzeptiert vorberechnete Open-Codes für die Parallelisierung)
- **Snapshot-Historie.** Simpler prozess-lokaler In-Memory-Store (`src/tags/store.py`, max. 100 Einträge, thread-safe): jeder `/induce`- und `/induce-batch`-Lauf wird mit `id`, `created_at`, `num_arguments`, `kind`, `output` abgelegt; die Lauf-Antwort trägt `snapshot_id` + `created_at`. Zwei View-Endpoints: `GET /api/tags/snapshots` (Übersicht ohne output, neueste zuerst) und `GET /api/tags/snapshots/{id}` (voller Snapshot, 404 wenn unbekannt)
- **Zweistufiges Axial Coding für Mengen-Skalierung (Variante B).** `TagSystem.batch_induce` schaltet ab `two_stage_threshold` Codes (Default 40) automatisch auf einen zweistufigen Pfad um (`mode` im Output dokumentiert): **Stage 0** Häufigkeitsfilter (seltene Codes < `min_frequency` → sichtbarer `Rand`-Tag, mit Guard gegen Über-Filterung), **Stage 1** Vorbündelung naher Dubletten (`src/tags/prebundle.py`, lexikalisches Token-Jaccard-Backend → ~`target_bundles` Bündel + Repräsentant; latent, aber gekapselt und in Stage 2 inhaltlich geprüft), **Stage 2** Achsenbildung des LLM nur noch auf den Repräsentanten (~7:1 statt 120:1 Verdichtung). Nebenprodukt: die Hierarchie Achse → Bündel → Code → Argument (`hierarchy` im Output). Neue `BatchOptions`: `two_stage_threshold`, `min_frequency`, `target_bundles`. **Stage-1-Embedding-Backend gebaut** (`src/tags/embedding.py`): Infomaniak AI Tools, OpenAI-kompatibel (`POST /2/ai/{product_id}/openai/v1/embeddings`), Modell Qwen3-Embedding-8B; `prebundle_embedding` clustert per Average-Link über Cosinus (Schwelle `CALCULATOR_PREBUNDLE_EMBED_FLOOR`, Default 0.72) mit **hartem Cap** auf `target_bundles`: bis zu 3 iterative Runden lockern den Floor, die letzte erzwingt den Cap; `prebundle.rounds`/`final_floor`/`capped` machen transparent, ob er sauber (nur Dubletten) oder erzwungen erreicht wurde. Modell-ID `Qwen/Qwen3-Embedding-8B` (live via `GET /1/ai/models` verifiziert, 4096 dim; Floor 0.72 gemessen: Dublette 0.89 / Gegenpole 0.63 / unverwandt 0.58). Backend-Wahl `CALCULATOR_PREBUNDLE_BACKEND=auto|embedding|lexical` (auto = Embedding wenn `CALCULATOR_EMBEDDING_PRODUCT_ID`/`_API_KEY` gesetzt, sonst lexikalisch; bei API-Fehler Auto-Fallback). `numpy` als Dependency ergänzt. Pre-Bundling ≠ verworfener Achsen-Definer (latent, aber gekapselt; siehe `doc/argument_clustering.md` §9). Neue Env in `secrets.yaml.dist`/`.env.dist`
- **Open Coding läuft auf Infomaniak-Gemma statt Claude (Variante B).** Der mengenintensive Open-Coding-Schritt (N Calls/Batch) nutzt jetzt `google/gemma-4-31B-it` über Infomaniak AI Tools (OpenAI-kompatible Chat Completions, neuer `src/llm/infomaniak_chat.py::InfomaniakOpenCoder`). Axial Coding / classify / split bleiben bei Anthropic. Neue `get_open_coder()`-Factory: Infomaniak wenn konfiguriert (gleiche Creds wie Embeddings), sonst Fallback auf Anthropic. Open-Coding-Prompt zentral in `base.py::SYSTEM_OPEN_CODING` (geteilt; inkl. „Codes IMMER auf Deutsch"). Infomaniak lehnt `response_format` ab (400) → JSON wird per Prompt erzwungen und robust geparst (```json-Fences). `coder_signature` = `infomaniak:<modell>:<prompt-hash>` → Cache/DB invalidiert beim Backend-/Modellwechsel. `snapshot.open_coder` zeigt das genutzte Backend. (Nebenbei: `load_dotenv` nach `config.py` vorgezogen, da der neue DB-Import `config` sonst vor dem .env-Laden zog.)
- **In-Memory-Snapshot-Store entfernt (`services/calculator`).** Da die Taxonomie jetzt versioniert in der DB liegt (`app_taxonomy_*`), ist die alte prozess-lokale Snapshot-Historie redundant: `src/tags/store.py` gelöscht, die Endpoints `GET /api/tags/snapshots[/{id}]` entfernt, kein `store.record`/`snapshot_id`/`created_at` mehr in der `/induce-batch`-Antwort (stattdessen `taxonomy_run_id`).
- **Taxonomie-View: Karten-Redesign, Farbcodierung + Positionsband (`services/appview`, `services/front`).** `taxonomy.get` aggregiert je Knoten die **relevanz-gewichtete Pro-Vorlage-Neigung** des Viewers (`proLeaning ∈ [-1,1]`, PRO=+/CONTRA=−, gewichtet mit der Relevanz-Bewertung), `dissent` (0..1, wie stark beide Pole bewertet wurden) und `ratedCount`; je Argument `viewerPreference`. Frontend: Top-Themen als **Cards** (zugeklappt by default, Drill-down), Hintergrund **grün/rot** nach `proLeaning` (eher dafür/dagegen). Neue Komponente **`PositionBand`** unter den Cards: jedes Top-Thema ein Punkt zwischen „Position der Gegner" (links/rot) ↔ „Position der Befürworter" (rechts/blau), Farbe nach Position, „gespalten"-Marker bei hohem Dissens. i18n in 5 Locales. Ohne Login/Bewertungen ist `proLeaning` null → neutrale Darstellung.
- **Frontend-View „Taxonomie" + AppView-Endpoint (`services/appview`, `services/front`).** Neuer XRPC-Endpoint `GET /xrpc/app.ch.poltr.taxonomy.get?ballot_rkey=…&lang=…` (AppView, additiv) liefert den Calculator-Themenbaum (`app_topic_*`) MIT den eingeordneten Argumenten je Knoten — lokalisierte Titel, `type` (PRO/CONTRA), `sourceType`, `likeCount`, `argumentCount` (Teilbaum distinct); ein Argument erscheint über seine Codes an mehreren Knoten (Multi-Thema). Frontend: dritte Argument-View neben booklet/feed (`view-toggle` + Route `ballot/[id]/arguments/taxonomy`) — einklappbarer Baum, Argument-Klick öffnet das bestehende Overlay (`navigate({type:'argument', rkey})`). Neue `agent.getTaxonomy`, Typen `TaxonomyTree/Node/Argument`, i18n in 5 Locales. Live gegen die DB verifiziert (58 Argumente in 37 Knoten, 3 Ebenen).
- **Top-down Themen-Hierarchie: Postgres-Persistenz + inkrementelles Einsortieren (`services/calculator`, `infra`).** Gegenentwurf zum bottom-up `app_taxonomy_*`: ein Themen-BAUM, top-down aus den OFFIZIELLEN Argumenten geseedet, mit adaptiver Tiefe (nur vertiefen, wo genug Material). Neu persistiert in **`app_topic_node`** (Adjazenzliste, `parent_id`) + **`app_topic_membership`** (Code/Argument → Knoten, mit `confidence`/`stance`). Anders als die versionierten Taxonomie-Tabellen: **EIN stabiler Baum pro Ballot**, inkrementell mutierbar (nicht pro Lauf neu). Endpoints: `POST /api/topdown/induce` (Baum neu bauen + persistieren, ersetzt), `POST /api/topdown/classify` (neue Argumente top-down in den bestehenden Baum einhängen — Q4, pro Ebene 1 LLM-Call, kein Neubau), `POST /api/topdown/grow` (Baum wachsen lassen — s.u.), `GET /api/topdown/tree` (lesen). DB-Funktionen `persist_topic_tree`/`fetch_topic_tree`/`fetch_unplaced_entries`/`add_topic_memberships`/`fetch_overfull_nodes`/`split_node`. Migration `infra/scripts/postgres/migrate-topics.sql` + `db-setup.sql` + Grants.
- **Top-down: Wachstum (Überlauf-Split, vertikal + horizontal) (`services/calculator`).** `POST /api/topdown/grow` lässt den persistierten Baum wachsen: Knoten mit zu vielen DIREKTEN Codes (`threshold`, Default 10; `depth < max_depth`) werden per LLM in Unterthemen aufgeteilt und die Memberships umgehängt. Dieselbe Mechanik deckt beide Fälle: an einem Themenknoten entstehen **Unterthemen** (vertikal), am **Wurzelknoten** (dessen Direkt-Codes der „andere"-Topf sind) entstehen **neue Hauptäste** (horizontal, eigener Prompt `_SYS_NEW_BRANCHES`). Ein Durchgang, mehrfach aufrufbar bis nichts mehr überläuft. Damit ist der inkrementelle Zyklus vollständig: `classify` (einhängen) → `grow` (wachsen). (Signierte ATProto-Snapshots bewusst zurückgestellt.) Prototyp-Lauf 663.1: 8 Wurzelthemen, ~2% „andere" (vs. ~24% Rand bottom-up), löst Fehler A+B (Codes einzeln klassifiziert statt Bündel-vererbt). Analog zu `openCodes` gibt `app.ch.poltr.argument.get` jetzt ein `axes`-Array mit: `axisId`, `label`, `poleA`/`poleB` (die zwei Enden), `pole` (auf welches Ende das Argument spricht), `stance`, `codeCount`, `confidence`, `conflict`. Per Subquery aus `app_arguments_axis` des **jüngsten** Taxonomie-Laufs des Ballots (`json_agg`, nur echte Achsen). Frontend: `BallotArgument.axes` typisiert, `argument-detail.tsx` rendert je Achse das Label + das Pol-Ende, auf das das Argument spricht (Konflikt mit ⚠). Live verifiziert.
- **Neue Tabelle `app_arguments_axis` — Rollup Argument → Achse mit Pol (`services/calculator`, `infra`).** Analog zu `app_argument_open_codes`, aber je Lauf: pro `(run, argument, axis)` die Achsenzugehörigkeit + ob das Argument fürs **a- oder b-Ende** spricht. Der Pol wird **ohne neuen LLM-Call** aus `app_taxonomy_membership` abgeleitet: Confidence-gewichtete Mehrheit der Code-Pole des Arguments auf der Achse (a vs. b). Spalten: `pole` (a/b/neutral), `stance` (pro/contra zur Vorlage, mitgeführt), `code_count`, `confidence`, **`conflict`** (Codes ziehen auf a UND b — das §10.2-„faul"-Signal). Nur echte Achsen (`kind='axis'`). `taxonomy_for_persistence` liefert `argument_axes`, `persist_taxonomy` schreibt die Tabelle am Ende von `/induce-batch` (später als eigenständige Funktion gedacht). Migration + `db-setup.sql` + Grant für `calculator`.
- **Nicht-zugeordnete Argumente als Run-Qualitätsmerkmal (`services/calculator`, `infra`).** `app_taxonomy_run` bekommt `arguments_total` + `arguments_unassigned` (codierte Argumente, die auf KEINER echten Achse landeten — alle Codes nur in Rand/ungrouped). `taxonomy_for_persistence` berechnet das aus der Faktentabelle (`run_stats`), der Router merged es in `run_metrics`. Direktes Abdeckungsmass je Lauf (663.1/run 11: 3 von 58 ≈ 5%). Migration + `db-setup.sql` (`ADD COLUMN IF NOT EXISTS`).
- **Qualitätsindikatoren in die Taxonomie-Tabellen (`services/calculator`, `infra`).** Lauf-weite Stage-0/Stage-1-Kennzahlen wandern in `app_taxonomy_run` (`stage0_applied`/`_min_frequency`/`_kept`/`_margin`, `prebundle_backend`/`_target`/`_rounds`/`_final_floor`/`_capped`/`_max_size`/`_max_bundle`) → jeder Lauf ist selbst-beschreibend, Qualität über Läufe vergleichbar. Pro Membership: `confidence` (Open-Coding-Confidence). Pro Bündel: `avg_confidence` (Ø Member) + `cohesion` (mittlere paarweise Ähnlichkeit der Member — Cosinus/embedding bzw. Jaccard/lexical, NULL bei Singletons) als granularer Bruder von `final_floor`: `cohesion ≥ floor` = echte Dubletten, darunter = erzwungenes Mini-Becken. `prebundle_embedding`/`_lexical` liefern `cohesion` je Bündel; `db.persist_taxonomy` nimmt ein `run_metrics`-Dict, der Router stellt es aus dem batch-Output zusammen. Live verifiziert (663.1): Bündel-Kohäsion 0.52–0.77, Confidence 0.90–1.00. Migration + `db-setup.sql` (Spalten + `ADD COLUMN IF NOT EXISTS`).
- **Schweizer Rechtschreibung in den Prompts (`services/calculator`).** Alle drei System-Prompts (`SYSTEM_OPEN_CODING`, `SYSTEM_AXIAL`, `SYSTEM_AXIAL_SPLIT`) weisen das Modell jetzt an, durchgehend «ss» statt «ß» zu schreiben (z.B. «Ausstoss», «Massnahmen», «Grösse») — Codes, Achsen-Labels, Pole und Beschreibungen. Folge: die `coder_signature` ändert sich (`…:c1ad91e0` → `…:67d12099`) → der Open-Coding-Worker codiert das Material beim nächsten Lauf neu (mit Schweizer Schreibweise). Axial-/Split-Prompts beeinflussen die Signatur nicht.
- **Floor 0.72 + abgedeckte Singletons verwerfen (`services/calculator`).** Floor 0.60 erzeugte inkohärente Bündel (Kohäsion ~0.63, Mini-Sammelbecken). Default-Floor jetzt **0.72** (nur echte Nah-Dubletten, Kohäsion 0.72–0.89). Damit entstehen viele Singletons — die werden gefiltert: ein Singleton-Code, dessen Argument bereits einen Code in einem echten Cluster hat („abgedeckt"), wird **verworfen** (idiosynkratische Nebenfacette); nur Singletons von gar-nicht-clusternden Argumenten gehen in den Rand. `target_bundles`-Default 40 → **80** (weiche Decke, bei Floor 0.72 ohnehin nicht bindend). Output: `prebundle.unbundled_singletons` (→Rand) + `dropped_singletons` (verworfen). **Beobachtung (663.1):** Bündel sauber + Rand klein (36), aber das Axial-LLM lehnt ~60 kohärente Bündel-Codes ehrlich ab (`Nicht gruppiert`, 14/58 Argumente ohne Achse) — `max_themes` hoch ändert das nicht; auf diesen Daten passt ~24% schlicht in keine gemeinsame Achse.
- **Honest-Modus für die Vorbündelung — kein Zwang, kein Cap, Rand fängt den Rest (`services/calculator`).** Statt 161 diverse Codes auf `target_bundles=40` zu *erzwingen* (→ Mega-Bündel oder erzwungene Mini-Becken), wird jetzt nur noch gemergt, was wirklich nah ist (Cosinus ≥ `PREBUNDLE_EMBED_FLOOR`); `target_bundles` ist nur weiche Decke. Codes ohne Partner ≥ Floor sind Singletons und wandern in den **Rand-Topf** (`kind='margin'`) statt einzeln ans Axial. Der Größen-Cap entfällt als Default (`CALCULATOR_PREBUNDLE_MAX_BUNDLE_SIZE=0`, nur opt-in-Sicherheitsnetz) — ohne Zwang gibt es keinen Snowball. Floor-Default 0.72 → **0.60** (steuert Rand ↔ Qualität; 663.1: 0.72≈60% Rand, 0.60≈21%). `prebundle_embedding` macht jetzt einen einzigen ehrlichen Agglomerations-Durchgang (kein Floor-Lockern); `_axial_two_stage` routet Singletons in den Rand und reicht nur Multi-Member-Cluster ans Axial. Live (663.1): aus dem 37er-Sammelbecken werden 6 ausgewogene Achsen (14–25 Codes), grösstes Bündel 14, 21% im Rand. Output: `prebundle.singletons`/`unbundled_singletons`.
- **Größen-Cap pro Bündel gegen Sammelbecken (`services/calculator`).** Die Cap-Erzwingung in Stage 1 (161 Codes → 40 Bündel) ließ bei gelockertem Floor greedy Average-Link *ein* Cluster lawinenartig wachsen — real ein 37er-Mega-Bündel, das 37 heterogene Codes über *einen* Repräsentanten in *eine* Achse („Ebene der Klimaverantwortung") zog; der Reorg-Split (§9.1) konnte das nicht heilen, da er auf Repräsentanten arbeitet, nicht auf Bündel-Innenleben. Fix: `_agglomerate` (embedding) und `prebundle_lexical` überspringen Merges, die eine Bündel-Obergrenze überschritten (`max_size`, Default `ceil(n_codes/target_bundles)`). Auf echten Daten: max. Bündelgröße 37 → 5, Singletons 23 → 5. `prebundle.max_size`/`max_bundle` im Output. Nebenbefund dokumentiert (doc §9, Stage 0): die Open-Codes wiederholen sich praktisch nie (`freq≥2`: 0 von 161) → Häufigkeitsfilter greift nicht, Verdichtungslast liegt ganz bei Stage 1.
- **Kein stiller Lexical-Fallback mehr bei Embedding-Ausfall (`services/calculator`).** Bisher fiel die Stage-1-Vorbündelung bei einem Embedding-API-Fehler leise auf das lexikalische Backend zurück — man bekam unbemerkt schlechtere Bündel (u.a. ein 37er-Mega-Bundle + viele Singletons), obwohl Qwen3-Embeddings konfiguriert waren. Jetzt scheitert der Lauf in diesem Fall hörbar: `_axial_two_stage` re-raised den Embedding-Fehler, der Endpoint antwortet mit `502` (Alarm). Der alte Fallback ist per `CALCULATOR_PREBUNDLE_EMBED_FALLBACK=true` (Default `false`) reaktivierbar. `auto` ohne Embedding-Creds bleibt regulär lexikalisch (Konfigurations- ≠ Fehlerfall). Qwen3-Embedding-8B live verifiziert (4096-dim, sinnvolle Cosinus-Nähe). Doku: README + §9.
- **Retry für transiente Embedding-Fehler (`services/calculator`).** Das Infomaniak-Embeddings-Gateway antwortet sporadisch mit `502 Bad Gateway`. `embedding.embed_texts` wiederholt solche transienten Fehler (Status 429/500/502/503/504 sowie Netz/Timeout) jetzt mit exponentiellem Backoff (`CALCULATOR_EMBEDDING_MAX_ATTEMPTS`, Default 4 → 1s/2s/4s) — derselbe Backend-Call, kein Lexical-Fallback. Permanente Fehler (z.B. 400/401) werden sofort durchgereicht; bleibt es nach allen Versuchen transient, scheitert der Lauf hörbar (`502`, s.o.).
- **Haltung (PRO/CONTRA) in der Taxonomie (`services/calculator`, `infra`).** `app_taxonomy_membership` bekommt `stance` (`pro`/`contra`, aus `app_arguments.type` normalisiert) — die Haltung des Arguments je Zugehörigkeit. Aggregiert auf `app_taxonomy_axis.pro_share` (`real`, 0..1) = Anteil PRO unter den distinct Argumenten der Achse (unbekannte Haltung zählt in den Nenner, nicht als PRO; NULL bei leerer Achse). `fetch_open_codes_for_ballot` liest `a.type` mit, der Router reicht `stance_by_arg` an `TagSystem.batch_induce` durch, `taxonomy_for_persistence` schreibt beides. Zeigt, ob ein Streitpunkt einseitig (nahe 0/1) oder echt umstritten (nahe 0.5) belegt ist. Migration + `db-setup.sql` (Spalten + `ADD COLUMN IF NOT EXISTS`). **Außerdem:** fehlenden Upgrade-`ALTER` für `app_taxonomy_membership.pole` nachgezogen (bestehende Tabellen hatten die Spalte nicht → Persistenz schlug mit `column "pole" … does not exist` fehl).
- **Denormalisierte Qualitätsmetriken in den Taxonomie-Tabellen (`services/calculator`, `infra`).** `app_taxonomy_axis` bekommt `bundle_count` / `argument_count` / `code_count` (Bündel bzw. distinct Argumente/Codes je Achse), `app_taxonomy_bundle` ein `code_count` (distinct Codes je Bündel) — beim Schreiben aus der Membership-/Bündel-Tabelle berechnet (`TagSystem.taxonomy_for_persistence`) und in `db.persist_taxonomy` mitgeschrieben. Spart Aggregations-Joins bei der Qualitätsmessung (eine Achse mit auffällig hohem `code_count`/`argument_count` = Sammelbecken-Verdacht, §9.1). Migration `infra/scripts/postgres/migrate-taxonomy.sql` (Spalten in `CREATE TABLE` **und** `ALTER TABLE … ADD COLUMN IF NOT EXISTS` für bestehende Tabellen) + `db-setup.sql`.
- **`coverage`-Block in `/api/tags/induce-batch` (`services/calculator`).** Der Endpoint baut die Achsen über die gerade `status='done'`-Open-Codes — läuft parallel ein Re-Code (z.B. nach Änderung von `SYSTEM_OPEN_CODING`, die per `coder_signature` **alle** Codes invalidiert), entsteht die Taxonomie still nur über den schon fertigen Teil. Neue `db.ballot_coding_coverage()` hängt jetzt einen rein informativen `coverage`-Block an die Antwort: `arguments_total`, `done` (= axialer Input, ≙ `source.count`), `done_current_sig`/`done_stale_sig` (aktuelle vs. veraltete Signatur / editierte Argumente), `empty`, `processing`, `failed`, `uncoded` + `current_open_coder_signature`. Kein Block/Urteil (per Wunsch), nur Sichtbarkeit. Hintergrund: ein `/induce-batch`-Lauf erzeugte nur 10 statt der erwarteten Achsen, weil er mitten in einer prompt-getriggerten Neucodierung lief und nur 10 Argumente `done` waren — kein Token-Limit. Doku: README.
- **Reorganisation: überladene Achsen splitten (2. Sicherheitsnetz, `services/calculator`).** Nach der Achsenbildung wird je Achse die Größe (Codes pro Achse) gegen den Schnitt der **übrigen** Achsen verglichen; eine deutlich überdurchschnittliche Achse (`> split_factor ×` Schnitt der anderen, Default `1.8`; erst ab `split_min_reps` Repräsentanten) vermischt vermutlich mehrere Streitfragen und wird in einem **fokussierten zweiten LLM-Lauf** nur über ihre eigenen Codes in 2–`split_max_sub` scharfe Achsen aufgeteilt — das engere Blickfeld erzwingt die feinen Unterschiede, die der große Durchlauf verwischt. Neue `LLMClient.split_axis` (Anthropic: gemeinsame `_group_codes`-Mechanik mit Axial Coding, aber Split-Prompt `SYSTEM_AXIAL_SPLIT`); `TagSystem._split_overloaded_axes` mutiert `axis_of_rep`/`code_to_tag`/Pole. Lineage über die schon vorhandenen `Tag.derived_from`/`superseded_by`: eine restlos aufgeteilte Achse wird `status='split'` und fällt aus der Persistenz/`themes`; Leftover-Reps bleiben auf der aktiven Rest-Achse. Steuerung in `BatchOptions` (`reorganize`, `split_factor`, `split_min_reps`, `split_max_sub`); Output meldet `splits`. Ergänzt den geschärften Axial-Prompt (verhindert vorab) durch nachträgliche Korrektur. `coder_signature` unberührt (Split-Prompt invalidiert die Open-Code-Persistenz nicht). Doku: `doc/argument_clustering.md` §9.1.
- **Taxonomie-Persistenz in der DB (`services/calculator`, `infra`).** Jeder `/induce-batch`-Lauf schreibt sein Ergebnis **versioniert** in vier neue Tabellen: `app_taxonomy_run` (ein Lauf = eine Version pro Ballot), `app_taxonomy_axis` (finale Achsen + `kind` `axis`/`margin`/`ungrouped`, mit Platz für `pole_a`/`pole_b`), `app_taxonomy_bundle` (Prebundle-Resultat → Achse) und `app_taxonomy_membership` (Faktentabelle: pro `(Argument, Code)` → Bündel/optional → Achse). Aus der Faktentabelle fallen alle vier Beziehungen per `DISTINCT`: Code↔Achse, Code↔Bündel, Argument↔Achse, Argument↔Bündel. Neue `TagSystem.taxonomy_for_persistence()` (lokale IDs) + `db.persist_taxonomy()` (mappt auf Identity-PKs, eine Transaktion); Antwort trägt `taxonomy_run_id`. Migration `infra/scripts/postgres/migrate-taxonomy.sql` + `db-setup.sql` + Grants für die `calculator`-Rolle.
- **Strukturierte Pole + Pol-Neigung je Code (`services/calculator`, `infra`).** Das `_AXIAL_TOOL`-Schema gibt jetzt pro Achse `pole_a`/`pole_b` (die zwei Positionen derselben Streitfrage) zurück, und jeder Code trägt eine `pole`-Neigung (`a`/`b`/`neutral`). `Tag` um `pole_a`/`pole_b` erweitert; `axial_group` liefert `[{label, description, pole_a, pole_b, codes:[{code, pole}]}]`; Bündel-Member erben die Pol-Neigung ihres Repräsentanten. Persistiert: `app_taxonomy_axis.pole_a/pole_b` (Spalten existierten schon) + neue Spalte `app_taxonomy_membership.pole` (CHECK a/b/neutral). Live (Sonnet): saubere Gegensätze wie „Verbote sind Bevormundung ↔ Regulierung ist nötig" mit Codes je Seite.
- **Axial-Prompt neu: Achsen als benannte Streitpunkte (`services/calculator`).** `SYSTEM_AXIAL` ersetzt — eine Achse = GENAU EINE Streitfrage als Gegensatzpaar „Pol A ↔ Pol B" (Test: kann man beiden Polen gleichzeitig zustimmen → zwei Achsen), überladene Achsen splitten, ehrlicher „nicht gruppiert"-Auffang. `max_themes` steht jetzt im System-Prompt (`axial_system(max_themes)`), nicht mehr in der User-Message. Live: Sonnet erzeugt Labels wie „Fossile Verbote als Eingriff in die Freiheit ↔ Regulierung als notwendige Lenkung". `coder_signature` unberührt (Axial-Prompt invalidiert die Open-Code-Persistenz nicht).
- **Prompts zentralisiert (`services/calculator`).** Neues Modul `src/prompts.py` bündelt **alle** LLM-Prompts: `SYSTEM_OPEN_CODING`, `OPEN_CODE_JSON_INSTRUCTION` (Gemma-JSON-Suffix), `SYSTEM_AXIAL` sowie die User-Message-Builder `open_code_user()` / `axial_user()`. Vorher verstreut über `base.py` / `anthropic_client.py` / `infomaniak_chat.py` — diese importieren jetzt nur noch aus `src.prompts`. Texte byte-identisch übernommen → `coder_signature` unverändert (verifiziert: `…:39f2a534`), persistierte Open Codes bleiben gültig (kein Neu-Codieren).
- **Axial Coding auf Sonnet (`services/calculator`).** `CALCULATOR_LLM_MODEL` Default `claude-haiku-4-5` → `claude-sonnet-4-6`. Axial ist der qualitätskritische Schritt (bestimmt die Achsen), aber nur **1 Call pro Lauf** → das Upgrade ist günstig und liefert sichtbar schärfere, inhaltlich definierte Achsen (Abgrenzungskriterium als Leitfrage statt bloßer Oberbegriff). Betrifft auch den seltenen Anthropic-Open-Coding-Fallback.
- **Ein einziger Axial-Pfad statt Direkt/Zweistufig-Weiche (`services/calculator`).** `batch_induce` ruft immer `_axial_two_stage` (Stage 0/1/2); der separate `_axial_direct`-Pfad + `two_stage_threshold` entfernt. Bei wenig Material degeneriert es automatisch: der Stage-0-Guard setzt den Häufigkeitsfilter aus, und **Stage 1 macht einen Short-Circuit** (≤ `target_bundles` Codes → jeder Code wird sein eigenes Bündel, **kein Embedding-Call**) → Stage 2 sieht alle Codes direkt (= altes Direkt-Verhalten, gleiche Kosten). Output-Feld `mode` (`direct`|`two-stage`) ersetzt durch **`bundled`** (true, wenn tatsächlich vorgebündelt). Ein Codepfad, ein Output-Schema.
- **`/api/tags/induce-batch` liest Open Codes aus der DB statt sie zu generieren (`services/calculator`).** Open Coding (Schritt 1) ist nun ausschließlich Sache des Cron-Workers (→ `app_argument_open_codes`). Der Batch-Endpoint generiert keine Codes mehr: neue `db.fetch_open_codes_for_ballot(ballot_rkey)` liest die `status='done'`-Codes (offizielle zuerst, dann `created_at`), dann läuft nur noch Axial Coding + Zuordnung. Request-Contract neu: `{ballot_rkey, limit?, options}` statt `{arguments|source}`; `422` wenn der Ballot noch nicht codiert ist. Entfernt aus dem Endpoint: Open-Coding-Phase, `get_open_coder`/`open_code_cache`/`_resolve_items`/`ArgumentIn`/`SourceSpec`/`max_codes`. `open_code_cache.py` ist damit ungenutzt (Worker nutzt die DB als Cache). `TagSystem.batch_induce` arbeitet jetzt ausschließlich mit übergebenen Codes (`codes_by_arg`, Pflicht-Argument) — der LLM-Open-Coding-Fallback + `max_codes` entfernt; `TagSystem` ruft kein `open_code` mehr auf. **ATProto-Reader entfernt:** Modul `src/atproto/` (PDS-`listRecords`-Fetch) gelöscht — die Argument-Quelle ist jetzt immer die DB; zugehörige Config/Env (`CALCULATOR_PDS_HOST`, `CALCULATOR_DEFAULT_ARGUMENT_DID/LIMIT`, `ARGUMENT_NSID`) entfernt. **Toten Variante-A-Code entfernt:** `TagSystem.ingest`/`reorganize`/`reorganize_with_clustering` + Helfer (`active_tags`, `_argument_text`, `_arg_texts`, die Schwellwert-Felder), die LLM-Methoden `classify_or_propose`/`split_tag`/`propose_merge` (base + AnthropicLLM) inkl. Tool-Schemas + `SYSTEM`-Prompt, sowie die Dateien `open_code_cache.py` und `example_output.json`. AnthropicLLM behält nur noch `open_code` (Fallback) + `axial_group`.
- **Ballot-Status-Filter fürs Open Coding (`services/cms`, `services/calculator`, `infra`).** Neuer Ballot-Status `archived` in der Payload-`Ballots`-Collection (zusätzlich zu `draft`/`published`). Der Open-Coding-Worker codiert nur noch Argumente von Ballots mit Status `published`/`draft` — `archived` wird übersprungen (z.B. um eine doppelt importierte Vorlage stillzulegen). Da Ballot-Status in der **cms**-DB liegt (getrennt von appview), liest der Worker die codierbaren `rkey`s read-only über eine zweite Verbindung (`CALCULATOR_CMS_POSTGRES_URL` → Fallback `CMS_DATABASE_URL`); ohne URL kein Filter. Claim-Query um `ballot_rkey = ANY(codeable)` erweitert (NULL = kein Filter). Neue Migration `infra/scripts/postgres/migrate-ballot-status.sql` (gegen **cms**-DB): `ALTER TYPE enum_ballots_status ADD VALUE 'archived'` + `GRANT SELECT ON ballots TO calculator` (+ CONNECT/USAGE). `CALCULATOR_OPENCODING_CODEABLE_STATUSES` (Default `published,draft`) konfigurierbar.
- **Open-Coding-Worker + DB-Anbindung (Variante B, Stage 1 persistent).** Neuer Cron-getriebener Endpoint `POST /opencoding` (+ `GET /opencoding/status`): verarbeitet alle 5 min einen Batch (Default 20) noch nicht/veraltet codierter Argumente aus `app_arguments` und persistiert die Open Codes nach der neuen Tabelle `app_argument_open_codes`. Reihenfolge offizielle-zuerst-dann-`created_at`; Re-Coding automatisch bei Edit (`cid`) oder Modell-/Prompt-Wechsel (`coder_signature`); Fehler bis 3 Versuche → `failed_permanent` (keine Endlosschleife), transiente Fehler (Netz/429/5xx) zählen nicht; `processing`-Lease (3 min) + CronJob `concurrencyPolicy: Forbid` gegen Overlap; Tagescap 300 (`CALCULATOR_OPENCODING_DAILY_CAP`). Codes immer Deutsch (Prompt), Eingabe `title`+`body`. Neuer `asyncpg`-Pool (`src/core/db.py`, AppView-Vorbild, `CALCULATOR_POSTGRES_URL` → Fallback `APPVIEW_POSTGRES_URL`); DB-Rolle `calculator` (SELECT `app_arguments`, RW `app_argument_open_codes`); Tabelle + Grants in `db-setup.sql` und `migrate-open-codes.sql`; CronJob `calculator-opencoding` in `infra/kube/cronjobs.yaml`. `open_code(..., raise_on_error=True)` propagiert API-Fehler für die transient/permanent-Klassifikation. (Nebenbei behoben: `OPEN_CODE_ERROR_NOTE` war in `anthropic_client.py` nicht importiert → latenter NameError auf dem Fehlerpfad.)
- **`max_codes` Default 3 (Variante B).** Open-Coding-Default ist 3 (überschreibbar, 1–8); der effektive Wert steht als `max_codes` im Output.
- **Axiale Achsen + `max_themes` (Variante B).** Der Axial-Prompt zielt jetzt explizit auf inhaltlich definierte Achsen (idealerweise benannte Gegensätze, z.B. „Verzicht ↔ Technologie") statt auf bloße Sammelordner. Neues `BatchOptions.max_themes` (Default 6) als **weicher** Cap für die Achsenzahl (durchgereicht bis `AnthropicLLM.axial_group`) — Prompt-Bitte, nicht deterministisch (ein Lauf mit `max_themes=6`/37 Codes ergab 7 Achsen). Embedding-Clustering (`reorganize_with_clustering`) wurde unter dem Leitkriterium „inhaltlich definierte Trennlinien, nicht latent" verworfen; siehe `doc/argument_clustering.md`
- **Open-Coding-Cache (Variante B).** Phase 1 (Open Coding) ist je Argument unabhängig → neuer prozess-lokaler Cache `src/tags/open_code_cache.py` (in-memory, max. 5000, Schlüssel `sha256(coder-signatur | max_codes | text)`). Neue Argumente lösen einen LLM-Call aus, bereits codierte Texte kommen aus dem Cache; Antwort enthält `open_coding_cache: {hits, misses, size}`. Selbst-invalidierend bei Text-Änderung (anderer Hash) sowie bei Modell-/Prompt-Wechsel (neue `LLMClient.open_code_signature` = Modell + Hash des Open-Prompts). Transiente LLM-Fehler-Fallbacks (`OPEN_CODE_ERROR_NOTE`) werden NICHT gecacht. Axial-Prompt geschärft: gruppiert die *Codes* (nicht die Fälle) zu wenigen quer-schneidenden Achsen (3–8, Singletons vermeiden)

## 2026-06-01

### Peer review: activity-triggered assignment + wait-for-quorum closure (`services/appview`, `services/indexer`, `services/front`, `lexicons`, `doc`)

- **Closure semantics rewritten.** `services/indexer/src/db.js::checkReviewQuorum` previously closed a review as soon as a majority was mathematically locked in (early termination: `approvals > QUORUM/2` → approved; symmetric for rejected). Now: closure happens only when exactly `QUORUM` valid responses are collected, then **majority decides, ties → rejected** ("the proposal must earn its acceptance"). Joined to `invited=true` invitations as defense in depth — stray responses without a matching active invitation never sway the count. The `WHERE review_status='preliminary'` guard on the UPDATE remains, so any late vote that slips past the AppView cannot flip a terminal status
- **Submit endpoint blocks late votes.** `services/appview/src/routes/deliberation/reviews.py::submit_review` adds a fifth pre-write check after the existing "invited / not yet reviewed" guards: a `COUNT(*)` of valid responses against the same `JOIN ... invited=true` — once it hits `QUORUM`, returns `409 quorum_reached`. Mirrors the indexer's closure semantic at the AppView boundary so the PDS never sees the over-quorum write
- **Worker replaced by activity hook.** Old background-poll worker (`services/appview/src/arguments/peer_review.py` — every 60 s, iterated preliminary arguments × eligible users) **deleted**. New `services/appview/src/arguments/peer_review_assign.py::maybe_assign_reviews_for_user(did)` runs in `services/appview/src/auth/middleware.py::verify_session_token` after a successful session lookup, **fire-and-forget** via `asyncio.create_task` so the request response isn't blocked. In-memory `dict[did → last_check_at]` throttles to one execution per user per 30 s; lost on pod restart, harmless because the work is idempotent (deterministic rkey + `ON CONFLICT DO NOTHING`). Removed `start_peer_review_loop`/`stop_peer_review_loop` from `services/appview/src/core/fastapi.py::start_participation_loops`
- **Why on-request instead of on-login.** Magic-link sessions are long-lived → most "returning" users present a 7-day cookie without re-running login. A pure on-login hook would miss them. Middleware-on-every-request + 30 s throttle catches all real activity (login or cookie reuse), still cheap (`O(2 small SQL reads)` for the once-per-30 s case, no-op otherwise)
- **Daily per-user cap.** New `APPVIEW_PEER_REVIEW_DAILY_LIMIT` (default 3). Each hook call computes `slots_left = limit - COUNT(invitations WHERE invitee=did AND invited=true AND created_at > now − 24h)` and stops when it hits 0. Sliding 24 h window, simpler in SQL and more predictable than calendar-day for users. Anti-collusion **`INVITE_PROBABILITY`** (default 0.35) stays — independent dimension: even when a slot is free, the per-candidate roll keeps small cliques from deterministically landing on a target argument's panel. Pool entries (`invited=false`) are still recorded so the same `(argument, user)` is never re-rolled
- **Candidate query.** Per hook call, max 100 candidates: `review_status='preliminary' AND source_type='user' AND author!=did AND NOT EXISTS (any invitation for this pair) AND (SELECT COUNT(*) FROM ri WHERE argument_uri=a.uri AND invited=true) < QUORUM`. ORDER BY `created_at ASC` to drain older arguments first
- **Frontend — rejected arguments visible to everyone.** Previous filter `review_status IN ('approved','preliminary') OR author_did = viewer` in `services/appview/src/routes/deliberation/arguments.py` removed; the activity-feed milestone in `services/appview/src/routes/deliberation/activity.py` now emits for both `'approved'` **and** `'rejected'` (was approved-only). `services/front/src/app/(app)/ballot/[id]/arguments/feed/page.tsx::MilestoneActivityCard` renders red "Community-verworfen" (toned down — small red dot + colored text, no shouty ❌) for rejected vs. green "Community-bestätigt" + 🎉 for approved. New translation key `communityRejected` added in `messages/{de,en,fr,it,rm}.json`
- **Lexicons added.** `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` were used in production code but never had a lexicon file — created `lexicons/app/ch/poltr/review/invitation.json` (incl. `invited` flag with semantics documented) and `lexicons/app/ch/poltr/review/response.json` (vote enum, criteria[] with key/label/rating 1–5, optional justification — required for REJECT, enforced AppView-side). The third review-record `app.ch.poltr.review.comment` is renamed to `app.ch.poltr.review.note` (file moved, id updated) to disambiguate from the public-discourse `app.ch.poltr.comment`. No records exist yet for that NSID → zero-risk rename
- **Full doc.** New `doc/PEER_REVIEW.md` covers the lifecycle, the activity-trigger rationale, the algorithm (incl. how `INVITE_PROBABILITY` × `DAILY_LIMIT` × `QUORUM` interact), eligibility rules, edge cases, env-var reference, and a backfill SQL snippet for the 9 terminal statuses on ballot 663-0 that were assigned under the old early-termination logic and are not re-evaluated automatically (the `WHERE review_status='preliminary'` guard in `checkReviewQuorum` freezes them)

### TLS certificate setup: Infomaniak DNS-01 webhook restored (`infra/cert`, `doc`)

- **Root cause.** Three cert-manager `Certificate` resources (`poltr-handle-tls` for `*.id.poltr.ch`, `poltr-wildcard-cert` for `*.poltr.info`, `poltr-ch-tls` for `poltr.ch`) were stuck on `SecretMismatch` / `Expired`. `poltr-handle-tls` had been expired since 2026-05-13 → external Bluesky AppView could not resolve any POLTR handle (`InvalidRequest: Unable to resolve handle`) because TLS handshake against `*.id.poltr.ch/.well-known/atproto-did` failed. Deeper root cause: the **Infomaniak DNS-01 webhook was not installed in the cluster** — the `ClusterIssuer letsencrypt-prod-dns` referenced `acme.infomaniak.com/v1alpha1/infomaniak`, but no `APIService` for that group existed → `cert-manager` got `forbidden: cannot create resource "infomaniak" in API group ...` on every challenge attempt
- **Remediation.** Helm-chart distribution of the webhook was discontinued (the URL in `infra/cert/cert-manager-wildcard.yaml`'s prerequisites comment, `https://infomaniak.github.io/cert-manager-webhook-infomaniak`, returns 404). Now installed via the rendered manifest at `https://github.com/Infomaniak/cert-manager-webhook-infomaniak/releases/download/v0.3.1/rendered-manifest.yaml` (creates the `cert-manager-infomaniak` namespace, `infomaniak-webhook` Deployment + Service, the `v1alpha1.acme.infomaniak.com` APIService, and the RBAC). Comment block in `cert-manager-wildcard.yaml` updated to reflect the new install method
- **Secret-name pitfall fixed.** Initially created the token Secret as `infomaniak-api-token` (the name our ClusterIssuer historically referenced) → webhook returned `secret 'cert-manager/infomaniak-api-token' not found` in its logs. The webhook ships a `Role infomaniak-webhook:secret-reader` with `resourceNames: [infomaniak-api-credentials]` — read access is scoped to exactly that name. Renamed Secret to `infomaniak-api-credentials`, patched the ClusterIssuer's `apiTokenSecretRef.name`. After deleting the stuck Challenges to force a fresh retry, all three certs reissued
- **Doc.** New `doc/TLS_CERTIFICATES.md` covers the architecture (why DNS-01 is required for `*.id.poltr.ch`), the one-time setup, automatic-renewal expectations (cert-manager rotates ~30 days before expiry — no manual action needed under normal conditions), webhook upgrade path, and a Troubleshooting playbook with the common failure modes encountered here

### Lexicon hygiene & cleanup script (`lexicons`, `infra/scripts`)

- **Obsolete-collection cleanup.** New `infra/scripts/cleanup_obsolete_governance_records.py` deletes four leftover record types from governance ballot accounts: `app.ch.poltr.ballot.entry` (ballots are CMS content now), `app.ch.poltr.content.rating` (ratings live on user accounts, not governance), `app.bsky.feed.like` (Bsky cross-likes live on user accounts), `app.bsky.feed.generator` (the poltr feed-generator lives on `did:web:app.poltr.info`, not on per-ballot accounts). Loads credentials from `auth.governance_accounts` like `import_peerreviews.py`; defaults to all governance accounts but accepts `GOV_DID=...` to scope. `DRY_RUN=true` lists without deleting. Deleted 8 stale records from the legacy `admin.id.poltr.ch` (`did:plc:3ch7iwf6od4szklpolupbv7o`) on first run
- **CMS handle slugging.** `services/cms/src/lib/atproto-publish.ts::publishGovernanceAccount` and `services/appview/src/atproto/governance.py::create_ballot_account` now sanitize dots in the rkey before composing the PDS handle (`663.0` → `ballot-663-0.id.poltr.ch`) — the `*.id.poltr.ch` wildcard cert is a single-label match, and ATProto handle rules are stricter about multi-label segments. The DB `ballot_rkey` column keeps the original dotted form for lookup; only the on-PDS handle is slugged
- **Reload hint on CMS Ballot form.** `services/cms/src/collections/Ballots.ts` field descriptions for `governanceDid`/`governanceHandle` now note that the page must be reloaded after publishing to see the auto-populated values (the afterChange hook updates the doc via a recursive `payload.update`; the form UI doesn't pick that up until refetch)
- **Test-user bulk creation.** New `infra/scripts/create_test_users.py` mirrors the AppView registration flow (`register.py` + `provisioning.py`) as a batch — invite-code → PDS account → profile record → encrypted creds in `auth.auth_creds` → pseudonym in `app_profiles`. Used to inflate the test pool from 9 → 24 users so peer-review hash collisions in `import_peerreviews.py`'s `hash(user_id) % len(users)` deterministic mapping don't collapse multiple distinct demokratiefabrik users onto the same test account

### Multilingual content: ATProto records gain `langs` + translations (`lexicons`, `services/appview`, `services/indexer`, `services/cms`, `services/front`, `infra`)

- **Five-language baseline (DE/FR/IT/RM/EN), env-driven.** New `services/appview/src/core/languages.py` + `services/indexer/src/languages.js` materialize a single `SUPPORTED_LANGUAGES` list per service from `POLTR_LANGUAGES=de,fr,it,rm,en`; the frontend reads `NEXT_PUBLIC_POLTR_LANGUAGES` at build time; the CMS reads the same env in `services/cms/src/payload.config.ts`. Adding a sixth language is a ConfigMap edit + Payload migration; the lexicon's `format: "language"` BCP-47 fields accept any code without a schema bump, and worker/indexer status derivation is dynamic against the list (no hardcoded `5`). See `doc/RECORD_TRANSLATIONS.md` for the full design and the `## Sprache hinzufügen` checklist
- **Arguments — inline `translations[]` (Variant A).** `lexicons/app/ch/poltr/ballot/argument.json` extends the existing record with `langs` (Bluesky-compatible array, max 3, default `['de']`) and `translations[]` (max 10, each `{lang, title, body, source: 'manual'|'ai', model?, translatedAt}`) via a new `#translation` def. Arguments live in the ballot's governance account → POLTR has write access → translations belong on the same record, replaced via `putRecord`. `app_arguments` gains `langs TEXT[]`, `translations JSONB`, `translation_status TEXT` (`pending|partial|complete|manual_only`) with a GIN index on `langs` and a partial index on `translation_status` as the worker queue. `services/indexer/src/db.js::upsertArgumentDb` parses the new fields and computes `translation_status` dynamically against `SUPPORTED_LANGUAGES`
- **Comments — sidecar records (Variant B).** Comments live in user repos (intern) or foreign Bluesky repos (extern); POLTR must not write into those. New lexicon `lexicons/app/ch/poltr/comment/translation.json` defines `app.ch.poltr.comment.translation` — a single-language-per-record sidecar with `subject: {uri, cid?}` pointing at the original comment, plus `ballot` (denormalized), `lang`, `body`, `source`, `model`, `translatedAt`. rkey composed as `{commentRkey}-{lang}` → idempotent `putRecord`. Originals stay untouched; only `langs` is added on the existing `app.ch.poltr.comment` shape
- **DB schema (comments).** `app_comments` gets only `langs TEXT[]` + `translation_status TEXT` (no inline JSONB). New table `app_comment_translations` (`uri, cid, subject_uri, ballot_rkey, lang, body, source, model, translated_at, deleted`) with unique partial index `(subject_uri, lang) WHERE NOT deleted`. Migration `infra/scripts/postgres/migrate-translations.sql` is idempotent and drops any stray inline `app_comments.translations` column left over from a discarded draft attempt
- **Indexer (sidecar).** New collection handler for `app.ch.poltr.comment.translation` in `services/indexer/src/record_handler.js` (non-governance writes rejected, mirroring arguments/reviews). `upsertCommentTranslationDb` + `markCommentTranslationDeleted` populate the sidecar table and call `recomputeCommentTranslationStatus(subject_uri)` to update the parent comment's `translation_status` via a UNION of `langs` + non-deleted sidecar langs. `upsertCommentDb` also recomputes after every comment write — out-of-order-safe (sidecar may index before its parent and vice versa)
- **CMS Payload Localization.** `services/cms/src/payload.config.ts` registers the 5 locales (env-driven). `Ballots.title/description/topic` and `OfficialArguments.title/body` are now `localized: true`; both collections get a new sidebar `originLanguage` select (replaces the broken `Ballots.language` field, which was incompatible with the `unique: true` constraint on `rkey`). The `OfficialArguments` `afterChange` hook (`services/cms/src/lib/atproto-publish.ts::buildArgumentRecord`) is now async + dynamic: loads `originLanguage` as the top-level `(title, body, langs)` and every other non-empty locale as a `translations[]` entry with `source: 'manual'`
- **CMS TranslationStatus widget.** New `services/cms/src/components/TranslationStatus.tsx` renders `DE ✓ FR ✓ IT ✗ RM ✗ EN ✓` badges in the sidebar of each Edit view (registered on both Ballots and OfficialArguments via a virtual `type: 'ui'` field). Loads `?locale=all&depth=0` from Payload REST to decide which slots are filled
- **CMS data migration.** `services/cms/src/migrations/20260601_ballots_localized.ts` copies pre-existing monolingual `title/description/topic` values into the slot of the recorded `originLanguage` (defaults to `de`), and sets `originLanguage` for OfficialArguments. Idempotent (skips docs that already have `originLanguage`). One-time `pnpm payload migrate` after schema deploy
- **AppView reads — lang-aware.** New `services/appview/src/routes/deliberation/_lang.py` exports `resolve_requested_lang(query|header)` and `pick_translation()` (inline variant). Argument list/get endpoints accept `?lang=<code>` (falling back to `Accept-Language`) and add `langs`, `availableLangs`, `translatedFrom`, `translationSource` to every row. Comment list/get use `LEFT JOIN app_comment_translations` for the requested-lang sidecar plus an aggregate of all sidecar langs in the same query → one roundtrip, no N+1
- **AppView writes — `langs` accepted.** Argument and comment `create` endpoints accept an optional `langs` array (filtered against `SUPPORTED_LANGUAGES_SET`, defaults to `[DEFAULT_LANGUAGE]`). Frontend `createArgument` forwards `langs: [<currentLocale>]` from `useLocale()`
- **Background translation worker (skeleton).** New `services/appview/src/translation/translator.py` — asyncio poll loop (`APPVIEW_TRANSLATE_ENABLED`, `APPVIEW_TRANSLATE_POLL_INTERVAL_SECONDS`, `APPVIEW_TRANSLATE_BATCH_SIZE`, `APPVIEW_TRANSLATE_MODEL`) wired into `core/fastapi.py::start_participation_loops`. Two parallel paths: `_process_arguments_batch` does inline `putRecord` on argument records (governance account); `_process_comments_batch` writes sidecar records via `put_governance_record` with composed rkey `{commentRkey}-{lang}` (never touches user/Bluesky repos). The LLM call (`_translate_via_llm`) is a **TODO stub** — returns `None` until the Anthropic SDK is wired; the full DB→worker→PDS→indexer→DB pipeline is testable end-to-end with fake translations injected via SQL
- **Frontend i18n** (`services/front/src/i18n/config.ts`) reads `NEXT_PUBLIC_POLTR_LANGUAGES`; `localeLabels` covers all 5 codes. Stub `messages/{fr,it,rm}.json` files added as DE copies (placeholders until translated). Argument records carry optional `langs`, `translatedFrom`, `translationSource` in `types/ballots.ts`; `ArgumentWithMetadata` and `CommentWithMetadata` gain `availableLangs` + hoisted `translationSource` so badge rendering doesn't need to dig into `record.*`
- **Memory.** New `MEMORY.md` entry `project_architecture_layers.md` captures the layering decision (basis-app = no ATProto; deliberation = ATProto) so future tasks don't propose PDS storage for ballots

### AppView routes restructured: basis-app REST vs. deliberation XRPC (`services/appview`)

- **Folder split** to mirror the architectural layering. `services/appview/src/routes/ballots/ballots.py` was a 1300-line monolith bundling ballots, arguments, comments, likes, activity behind a single `/xrpc` router. Now split into `routes/ballots/` (basis-app REST, just ballots) and `routes/deliberation/{arguments,comments,likes,activity,reviews}.py` (XRPC, ATProto-backed records). The previous `routes/arguments/reviews.py` moves into `deliberation/reviews.py`; the `routes/arguments/` directory is removed
- **`routes/deliberation/__init__.py`** re-exports the five routers as a list; `main.py` registers basis-app routers and deliberation routers separately, with a comment marking the boundary. Shared helpers (`_lang.py`) live in the `deliberation/` package since only those routes need them. Imports from `src/atproto/*`, `src/core/*`, `src/arguments/peer_review.py` (background loop) are unchanged
- **Why**: ballots are CMS-backed redactional content; arguments/comments/likes/activity/reviews are ATProto-backed federation-capable records. The split is now visible at three levels — URL prefix (`/api/ballots*` vs `/xrpc/app.ch.poltr.*`), folder structure, and the design memo (`MEMORY.md::project-architecture-layers`)

### Ballots: pseudo-ATProto records replaced by honest REST API (`services/appview`, `services/front`)

- **Why**: ballot endpoints previously fabricated ATProto-shaped responses — `$type: 'app.ch.poltr.ballot.entry'`, `uri: 'cms://ballots/<rkey>'`, empty `cid`, no lexicon file in `lexicons/`. The shape misled readers into believing ballots were federation-capable records; in reality they are CMS content that only exists in Payload. Architectural rule: basis-app (ballots, auth, profiles) is ATProto-free; only the deliberation layer is on ATProto
- **AppView** (`routes/ballots/ballots.py`): exposes `GET /api/ballots?lang=<code>` and `GET /api/ballots/<rkey>?lang=<code>` (was `/xrpc/app.ch.poltr.ballot.{list,get}`). `_serialize_ballot()` returns a flat shape `{rkey, title, description, topic, ballotType, voteDate, officialRef, originLanguage, langs, availableLangs, governanceDid, …Count, viewer}` — no `$type`, no `record` wrapper, no `cms://` URI, no empty `cid`. `governanceDid` remains as the explicit bridge to the deliberation layer. Both endpoints forward `?locale=<code>` to the Payload REST API and parallel-fetch a `?locale=all` query to compute `availableLangs`
- **Frontend**: `types/ballots.ts` drops `BallotRecord` and replaces `BallotWithMetadata` with a flat `Ballot` (uses `rkey` instead of a synthetic URI). `lib/agent.ts::getBallot`/`listBallots` call `/api/poltr/ballots*` instead of `/api/xrpc/…`. New proxy `services/front/src/app/api/poltr/[...path]/route.ts` mirrors the existing `/api/xrpc/[...path]` proxy but forwards to `/api/*` on the AppView and passes `Accept-Language` through. The four ballot-rendering pages (`(app)/home`, `(app)/ballots`, `ballot/[id]/arguments/feed`, `ballot/[id]/arguments/booklet`) updated: `ballot.record.title` → `ballot.title`, `ballot.uri.split("/").pop()` → `ballot.rkey`, `ballot.record.text` → `ballot.description`. The old `ballot.record.language` badge is replaced by a per-locale `availableLangs` row (origin highlighted via `Badge variant="default"`)
- **Argument creation** now forwards the current frontend locale as `langs: [<currentLocale>]` to `argument.create` (no separate language picker — the editor's UI locale is the authoring locale by definition). `AddArgumentModal` prop renamed `ballotUri` → `ballotRkey` since there is no longer a pseudo-URI on the ballot side; `createArgument()` in `lib/agent.ts` accepts an optional `langs` array

### Comment lexicon restored (`lexicons`, `infra/scripts`)
- **Added canonical `lexicons/app/ch/poltr/comment.json`.** The lexicon file for the `app.ch.poltr.comment` record type was missing from the lexicon tree — writes/reads worked because the PDS does not enforce self-hosted NSIDs, but the shape was implicit, spread across `services/appview/src/routes/deliberation/comments.py` (write/read), `services/indexer/src/db.js` (`upsertCommentDb`), and the AppView read serializer. Now derived back into a single lexicon spec; sits next to the existing `comment/` sub-folder (which holds `comment/translation.json`), following the Bluesky `app/bsky/feed/post.json` + `app/bsky/feed/` convention
- **Schema**: required `body` (1–5000), `argument` (at-uri), `createdAt` (datetime); optional `parent` (at-uri, threading), `langs` (max 3 BCP-47, default `['de']`), and `title` (max 300). The `title` field is marked **UNSTABLE/TBD** in its description: it originates from the Demokratiefabrik xlsx import dump, is not rendered by the current frontend, and may be dropped or formalised in a later iteration
- **`body.maxLength: 5000`** enforced via lexicon. `infra/scripts/import_comments.py`: added `COMMENT_BODY_MAX_LEN = 5000` constant and pre-flight truncation in `create_comment()` — over-length xlsx rows are now trimmed (with a log line) instead of failing PDS `putRecord` with `InvalidRecord` once the lexicon is in force
- **`langs` description** points at the sidecar-translation pattern (`app.ch.poltr.comment.translation` records under the ballot's governance account) — translations are not stored inline on the comment record itself, since comments live in user repos (intern) or foreign Bluesky repos (extern) where we cannot write

## 2026-05-26

### PDS error handling overhaul (`services/appview`, `services/front`)
- **Categorized, sanitized PDS errors.** New `services/appview/src/atproto/errors.py`: `PDSError` with categories `auth_required`→401, `pds_unavailable`→503 (+`Retry-After`), `invalid_request`→400, `internal`→500; `from_response()`/`from_network_error()` map the PDS's own XRPC errors and transport failures. The DID + raw PDS text go **only to server logs**, never to the client
- **De-duplicated handling.** `atproto/atproto_api.py` + `atproto/governance.py` user/governance write helpers now raise `PDSError` instead of `RuntimeError`; `core/fastapi.py` registers **one** shared `PDSError` exception handler; the 5 PDS-write endpoints (comment/argument/rating/unrating/review.submit) dropped their copy-pasted `try/except … "pds_error"` blocks
- **Contract change:** clients now receive `{"error":"auth_required|pds_unavailable|invalid_request|internal"}` with the matching HTTP status (the only consumer is our own frontend)
- **Frontend feedback + rollback.** New `lib/pdsError.ts` (`toPdsError` → typed error; dispatches `poltr:session-expired` on 401 — now also for likes/ratings, which previously bypassed it) and `lib/toast.ts` (`notifyPdsError`). Added `sonner` + `<Toaster>` in `app/layout.tsx`. Write helpers (`lib/ballots.ts`, `lib/agent.ts`) throw structured `PdsError`. Rating-commit and comment-like now **roll back** the optimistic UI on failure + toast; the comment composer keeps the typed text + shows an inline `Alert`. New `errors` i18n namespace (`messages/{de,en}.json`)

### PDS storage-full incident: peer-review invitation runaway (`services/appview`, `services/indexer`, `infra`)
- **Root cause.** The peer-review invitation loop (`arguments/peer_review.py`, every 60 s) re-wrote review-invitation records via `putRecord` (deterministic rkey) on every cycle because its dedup table `app_review_invitations` was only fed by the indexer (create-only) and that feedback had gaps. Each rewrite emitted a fresh firehose commit; **~225 k redundant events accumulated in `sequencer.sqlite` (945 MB)** and filled the 1 GiB `pds-data` volume → all repo ops (incl. `createSession`) returned 500. The actual repos stayed tiny (3.4 MB) — *many commits, no data*
- **Fix.** `peer_review.py` now writes invitations via **`createRecord`** at a deterministic rkey (immutable; a duplicate write is rejected *before* any commit → a runaway is structurally impossible) and **synchronously inserts the dedup row** into `app_review_invitations` (indexer-independent). `governance.create_governance_record()` gained an optional `rkey` param. The indexer stays create-only for invitations (immutability)
- **One-time remediation (ops).** Pruned ~210 k stale `append` events from the sequencer (kept the last 20 k + all identity/account/sync; `integrity_check` ok; **945 MB→86 MB, `/data` 100%→9%**); reconciled leftover PDS invitation records into `app_review_invitations`. `infra/kube/secrets.yaml`: `APPVIEW_PEER_REVIEW_ENABLED` toggled off during remediation, back on after the fixed appview image was deployed

### Indexer backfill fix + PDS disk monitoring (`infra/kube`)
- **Backfill cronjob fixed** (`indexer.yaml`): Service `targetPort` + `containerPort` 3000→**3001**. The admin/backfill HTTP server listens on `BACKFILL_PORT=3001`, but the Service targeted 3000, so `indexer-backfill-nightly`'s curl to `:80` failed with connection-refused
- **Disk early-warning** — new `infra/kube/pds-monitoring.yaml`: weekly CronJob `pds-disk-alert` (+ minimal SA/Role/RoleBinding) reads `df /data` in the PDS pod via `kubectl exec` and emails an alert (appview SMTP creds) when usage ≥ 70 %. Public images only (no ghcr build needed)

### Repo policy: no AI co-author trailers
- Commits must **never** carry `Co-Authored-By: Claude …` (or any Anthropic/AI co-author). Documented in `CLAUDE.md`; enforced by a `commit-msg` hook (`.githooks/commit-msg`, via `core.hooksPath`) that strips such lines

## 2026-05-25

### Argument relevance rating: 1–100 slider wired to per-user PDS ratings (`services/appview`, `services/front`)
- **Generic content rating, fully wired.** The pre-existing `app.ch.poltr.content.rating` record (carrying a `preference` field) is now used as a generic, scale-agnostic preference signal on any subject. Convention: **`preference` is always stored normalised to the canonical 0–100 scale** (a binary "like" = `preference=100`); differing input scales (binary, 5-grade, 100) are normalised by the caller. Differentiation by content kind comes from the `subject` strongRef, not from separate record types
- **AppView write (`routes/ballots/ballots.py` `create_like`)**: now clamps `preference` to 0–100 and writes via the new `pds_put_record_session()` (`atproto/atproto_api.py`) at a **deterministic rkey = the subject's rkey**, so re-rating overwrites in place (idempotent, immune to indexer lag). One rating per (user, subject). Still written into the user's own PDS repo
- **AppView read**: `argument.list` + `argument.get` viewer subqueries now also return `preference` → new `viewer.preference` field in `_serialize_argument_row` (undefined when the user hasn't rated). No DB change — `app_likes.preference` already existed
- **Frontend**: new `rateContent(uri, cid, preference)` in `lib/ballots.ts`. The `RelevanceRating` slider (`components/relevance-rating.tsx`) gained an `onCommit` callback fired on pointer-release / +–-buttons; the argument detail view persists via `rateContent`, seeding the initial value from `viewer.preference`. The booklet card reads the real `viewer.preference` (placeholder hashing removed). `ArgumentWithMetadata.viewer.preference` added to `types/ballots.ts`
- **Note**: ratings on arguments mean `like_count` (count of rating rows) now reads as "number of ratings". Aggregate average relevance (for the Auswertung section) is not yet implemented

## 2026-05-13

### Argument sources: official BK arguments alongside user-submitted ones (`lexicons`, `services/appview`, `services/indexer`, `services/cms`, `services/front`, `infra`)
- **Lexicon `app.ch.poltr.ballot.argument` extended** with a closed `source` union (3 refs): `#sourceUser` (existing user-authored args; `authorDid` moved inside), `#sourceOfficial` (Bundeskanzlei leaflet, `documentRef` + `section`), `#sourceOrganization` (parties/associations/NGOs, `orgKey` — schema reserved, publish path not yet wired up). Top-level legacy `authorDid` tolerated as backward-compat fallback. New file: `lexicons/app/ch/poltr/ballot/argument.json`
- **DB migration** (`infra/scripts/postgres/migrate-argument-sources.sql`): `app_arguments` gains `source_type` (`user|official|organization`, default `user`), `source_org_key`, `source_doc_ref`, `source_section`, `source_verified_did`; `author_did` relaxed to nullable; consistency check ensures user → `author_did NOT NULL`, organization → `source_org_key NOT NULL`. Indexes on `source_type` + partial on `source_org_key`. Mirrored in `infra/scripts/postgres/db-setup.sql`
- **Indexer**: `upsertArgumentDb` parses the `source` union into the flat DB columns. Legacy records (no `source`, top-level `authorDid`) treated as `sourceUser`. Curated content (`official`/`organization`) inserted with `review_status='approved'` — bypasses peer review entirely
- **AppView**: `argument.create` wraps the caller's DID as `source: { $type: '…#sourceUser', authorDid }` on the record. `argument.list` accepts a `source` query param (`user|official|organization|all`) and reconstructs the `source` union in the response. Peer-review filter on the list endpoint exempts `official`/`organization` rows
- **CMS `OfficialArguments` collection** (`services/cms/src/collections/OfficialArguments.ts`): curated arguments are entered in Payload. `afterChange` hook calls `publishImportedArgument()` which loads the ballot's governance creds (NaCl SecretBox), opens a PDS session, writes the record with `sourceOfficial`, and persists `pds_uri`/`pds_cid` back to the CMS row. `sourceOrganization` option in the collection is commented-out until that path is built
- **Frontend `/ballot/[id]/new_arguments`**: experimental two-section view — "Offizielle Argumente" (warm off-white bg, `★` marker, 3px left accent on cards) above "Community" (dashed border, `◐` marker). Sticky PRO/CONTRA column header; mobile interleaves cards. `ArgumentSource` discriminated union added to `types/ballots.ts`; `listArguments(..., source?)` accepts the new query param; `author` is now optional on `ArgumentWithMetadata` because curated args have no pseudonym
- **Wiki updates**: `Arguments-and-Comments.md` gains a "Argument Sources" section + curated-content note; `ATProto-Integration.md` lexicon table updated to the union shape; `Peer-Review.md` notes the curated-content bypass
- **Tooling**:
  - `infra/scripts/backfill_argument_sources.py`: idempotent rewrite of legacy user arguments on the PDS — applied to all 99 existing records, each now carries `source: sourceUser` and the top-level `authorDid` is removed
  - `infra/scripts/import_bk_arguments.py`: parses a markdown dump of leaflet arguments and bulk-publishes the missing ones via PDS `createRecord` + direct CMS row insert (bypasses the CMS hook). Idempotent on case-insensitive title match. Used to import the 11 remaining BK 663 (Klimaschutz-Initiative) arguments
- **Operations fixes**:
  - `infra/kube/indexer.yaml`: removed stale `env: APPVIEW_CROSSPOST_ENABLED` reference (the indexer doesn't read that var — it was a copy-paste from appview, and the missing key was blocking pod startup)
  - **Payload hook deadlock fix** in `Ballots.ts` and `OfficialArguments.ts`: the `afterChange` → `payload.update(same collection)` pattern was deadlocking the Postgres adapter (outer tx held the row lock; inner update on a new connection waited for it). Both hooks now pass `req` (share transaction) plus `context: { skipPublishHook: true }` (short-circuits the recursive afterChange)

## 2026-05-10

### Login/Registration separation and AppView restructure (`services/appview`, `services/eidproto`)
- **Login without PDS**: `login_account()` is now a pure AppView operation — no PDS call needed. PDS access token is obtained lazily on first record write via stored app password
- **Registration split into 3 phases**: (1) Prepare handle/password/pseudonym, (2) PDS provisioning (`provision_pds_account()` in `participation/provisioning.py`), (3) DB writes + session
- **Removed refresh tokens**: `refresh_token` column dropped from `auth_sessions`. `_ensure_fresh_token()` re-logs in via app password instead of refreshing. Simpler, no long-lived tokens in DB
- **eID verification**: gets a fresh access token before sending to eidproto, no refresh token needed
- **eidproto cleanup**: removed `refresh_token` from API contract, JWT state, and `writeEidRecord()`
- **Renamed**: `login_pds_account()` → `login_account()`, `login.py` split into `login.py` (session) + `register.py` (registration)
- **AppView restructure**: `src/lib/` split into `src/core/` (shared: db, config, email) and `src/participation/` (ATProto: governance, crosspost, peer review, PDS API, provisioning)
- **Routes restructure**: `routes/poltr/` + `routes/review/` merged into `routes/participation/` (ballots.py, reviews.py). `routes/actor/` + `routes/feed/` + `routes/ozone/` merged into `routes/atproto/` (actor.py, feed.py, ozone.py, wellknown.py). Deleted `routes/bluesky/` (dead code). Background loops (`crosspost`, `peer_review`) started via `participation/__init__.py` instead of directly from `core/fastapi.py`

### Ballots moved to CMS (`services/cms`, `services/appview`, `services/indexer`)
- **Ballots are CMS content**: No longer ATProto records. Created and managed in Payload CMS admin UI. New `Ballots` collection with title, description, topic, voteDate, officialRef, language, status
- **Governance account on publish**: `afterChange` hook creates a PDS governance account (`ballot-{id}.id.poltr.ch`) when ballot status changes to "published". Credentials encrypted and stored in AppView `governance_accounts` table
- **AppView proxies CMS**: `ballot.list` and `ballot.get` endpoints now fetch from CMS REST API (`/api/ballots`) and enrich with argument/comment counts from AppView DB
- **Indexer**: Removed `COLLECTION_BALLOT` handler and `app_ballots` DB functions — ballots no longer come from the PDS firehose
- **Bluesky poller rewritten**: Now polls cross-posted **argument** threads instead of ballot threads. Imports external Bluesky replies as comments (`origin = 'extern'`) linked to the argument. Removed ballot-level polling, `getActiveBallots`, `updateBallotBskyCounts`. Optimized: batch-checks reply counts via `getPosts` (25/call) before fetching full threads — only fetches when reply count changed. Age-based frequency: fresh arguments (<48h) polled every cycle, stale arguments every 6th cycle. New `bsky_reply_count` column on `app_arguments`
- **Crosspost simplified**: Removed ballot crossposting (`_crosspost_ballots`). Arguments are cross-posted as standalone Bluesky posts (no longer as replies to a ballot post). Removed `_create_bsky_cross_like`
- **`governance_accounts` moved to `auth` schema**: Table contains encrypted credentials, belongs with `auth_creds`. Indexer gets column-level `SELECT` on `did`, `handle`, `ballot_rkey` only (no access to passwords)
- **CMS new dependencies**: `pg` (PostgreSQL client), `tweetnacl` (NaCl encryption for password storage)
- **CMS new env vars**: `APPVIEW_POSTGRES_URL`, `PDS_INTERNAL_URL`, `PDS_ADMIN_PASSWORD`, `APPVIEW_PDS_CREDS_MASTER_KEY_B64`, `PDS_PUBLIC_HANDLE`

### Security hardening (`services/appview`, `services/front`)
- **Session token hashing**: DB stores `SHA-256(session_token)` instead of plaintext. Cookie has the original. DB leak no longer exposes usable session tokens
- **PDS access token removed from DB**: `access_token` column dropped from `auth_sessions`. Tokens live only in an in-memory cache (1h TTL). DB leak no longer exposes PDS bearer tokens
- **Logout invalidates all sessions**: New `ch.poltr.auth.logout` endpoint deletes all sessions for the user's DID (`DELETE WHERE did = $1`). Logging out on one device logs out all devices
- **Frontend ATProto removal**: Removed `@atproto/api`, `@atproto/oauth-client-browser`, `@atproto/lexicon` dependencies. Deleted OAuth callback, lexicon validation, direct PDS calls. Frontend only communicates with AppView via proxy
- **Removed env vars**: `NEXT_PUBLIC_PDS_URL`, `NEXT_PUBLIC_REDIRECT_URI`, `NEXT_PUBLIC_CLIENT_ID_BASE`, `NEXT_PUBLIC_HANDLE_RESOLVER` — frontend no longer knows about PDS

### Frontend: Home shows ballots, new Profile page (`services/front`)
- **Home page**: Shows current ballots (no archived). Empty state with link to archived ballots
- **Profile page** (`/profile`): Moved from home — pseudonym explanation, DID, handle, eID verification, app password
- **Navigation**: Profile link added to user dropdown menu
- **Default locale**: Changed from `en` to `de`

## 2026-05-09

### Per-ballot governance accounts (`services/appview`, `services/indexer`, `infra`)
- **One PDS account per ballot**: Each ballot (Abstimmungsvorlage) now gets its own governance account on the PDS. The account's repo is a self-contained archive: ballot entry, arguments, review invitations/responses, and Bluesky cross-posts
- **Handle schema**: `ballot-{rkey}.id.poltr.ch`
- **New `governance_accounts` table**: Stores DID, handle, ballot_rkey, and encrypted password (using `APPVIEW_PDS_CREDS_MASTER_KEY_B64`) per ballot account
- **`governance_pds.py` rewritten**: All functions (`create_governance_record`, `put_governance_record`) now require an explicit `did` parameter. Password loaded from DB on-demand. New functions: `create_ballot_account()`, `get_did_for_ballot()`, `get_did_for_ballot_uri()`, `is_governance_did()`
- **Argument creation**: Looks up governance DID from ballot before writing to PDS
- **Review system**: `submit_review` and peer-review invitation loop resolve governance DID from the argument's `did` column
- **Crossposting**: Each ballot's Bluesky cross-posts are made from its own governance account
- **Indexer multi-DID support**: Replaced single `GOVERNANCE_DID` env var with `isGovernanceDid()` set loaded from `governance_accounts` table (refreshed every 60s)
- **Import script updated**: `import_peerreviews.py` now loads credentials from DB via `BALLOT_RKEY` + `DB_URL` + `MASTER_KEY_B64` instead of `GOV_HANDLE`/`GOV_PASSWORD`
- **Removed env vars**: `PDS_GOVERNANCE_ACCOUNT_DID` and `PDS_GOVERNANCE_PASSWORD` removed from K8s secrets, poltr.yaml, and all code
- **Portability**: Ballots can be independently exported, deleted, or moved between PDS instances

## 2026-03-15

### Short code authentication (`services/appview`, `services/front`, `infra`)
- **Short code alongside magic link**: users now receive a 6-character code in the login/registration email as an alternative to clicking the magic link
- **New endpoint `ch.poltr.auth.verifyShortCode`**: accepts `{email, code, purpose}`, with atomic failed-attempt tracking (max 5), constant-time comparison, and rate limiting
- **Updated email template**: shows short code in large monospaced font alongside the existing magic link
- **Frontend code input UI**: added to the "check your email" page with character filtering (no ambiguous chars 0/O/1/I/L), error display with remaining attempts
- **DB schema**: added `short_code` and `failed_attempts` columns to `auth_pending_logins` and `auth_pending_registrations`

### Frontend translations (`services/front`)
- Added multilingual translation support to the frontend

## 2026-03-08

### Argument reimport to governance repo (`infra`)
- **Updated `import_arguments.py`**: arguments are now written to the governance repo (`admin.id.poltr.ch`) with `authorDid` set to a random non-admin user. No longer writes to individual user repos. Simplified auth: uses governance account credentials directly instead of decrypting per-user app passwords
- **New `cleanup_arguments_reimport.sql`**: DB cleanup script that deletes all arguments, comments, review invitations, review responses, and related likes, then resets ballot counts. Run before reimporting
- **Updated `.env`**: governance account set to `admin.id.poltr.ch`

## 2026-03-07

### Immutable pseudonyms — no PDS record (`services/appview`, `services/indexer`)
- **Pseudonyms written directly to `app_profiles`** at registration via `INSERT ... ON CONFLICT DO NOTHING` — no longer stored as PDS record (`app.ch.poltr.actor.pseudonym`)
- **Removed `COLLECTION_PSEUDONYM` from indexer**: firehose events for pseudonym records are ignored. Removed `upsertProfileDb` and `deleteProfile` from `db.js`
- **Immutability**: pseudonym is set once at registration and can never be changed or deleted by the user

### Arguments stored in governance repo (`services/appview`, `services/indexer`, `infra`)
- **Arguments now written to governance PDS repo** instead of individual user repos. The `create_argument` endpoint uses `create_governance_record()` and includes `authorDid` in the record to track the actual author
- **New `author_did` column** on `app_arguments` table — the `did` column now always holds the governance account DID, while `author_did` holds the user who authored the argument
- **Removed dual-record pattern**: dropped `original_uri` and `governance_uri` columns. No more governance copy creation after peer review approval — arguments live in the governance repo from the start
- **Cross-posts under governance account**: argument Bluesky cross-posts are now made from the governance account, not the user's account. Removed user session cache from crosspost loop
- **Updated lexicon** `app.ch.poltr.ballot.argument`: added required `authorDid` field
- **Indexer governance-only filter**: ballots, arguments, and review invitations are only indexed from the governance repo (`PDS_GOVERNANCE_ACCOUNT_DID` env var added to indexer deployment)
- **Migration script**: `infra/scripts/postgres/migrate_arguments_to_governance.sql`
- **Cleanup script**: `infra/scripts/cleanup_user_arguments.py` — deletes old argument records from user repos on the PDS (dry-run by default)

### Immutable peer-review decisions (`services/indexer`, `services/appview`, `infra`)
- **Invitation decisions are immutable**: both positive (`invited: true`) and negative (`invited: false`) decisions are stored. Once created, they can never be overwritten, updated, or deleted
- **Review responses are immutable**: `app.ch.poltr.review.response` records use `ON CONFLICT DO NOTHING` and cannot be soft-deleted. Quorum check only runs on actual new inserts
- **Updated lexicon** `app.ch.poltr.review.invitation`: added required `invited` boolean field
- **DB schema changes**:
  - `app_review_invitations`: added `invited` column, removed `deleted` column, unique index `(argument_uri, invitee_did)` is now unconditional
  - `app_review_responses`: removed `deleted` column, unique index `(argument_uri, reviewer_did)` is now unconditional
- **Indexer**: delete events for invitations and review responses are logged and ignored (no-op)
- **AppView**: peer review loop now creates records for both selected and non-selected users; DB pre-check prevents race conditions on PDS writes
- **Updated doc**: `doc/PEER_REVIEW.md` fully rewritten, `doc/LEXICONS.md` and `doc/ARCHITECTURE.md` updated

## 2026-03-02

### Comment Detail Page + Feed Navigation (`services/front`, `services/appview`)
- **New page `/feed/[id]/comment`** (`services/front/src/app/feed/[id]/comment/page.tsx`): Comment thread detail view. Shows full ancestor chain (compact gray strips, indented per level), focal comment (white bg, blue left border, prominent), and direct replies (full `CommentNode` threading). Reply input at bottom posts as reply to the focal comment. Marks item as seen on navigation
- **New endpoint `GET /xrpc/app.ch.poltr.comment.get`** (`services/appview/src/routes/poltr/__init__.py`): Returns a single comment by AT URI plus its parent argument info (`uri`, `rkey`, `title`, `body`, `type`, `likeCount`, `commentCount`, `reviewStatus`, `ballotRkey`). 404 if deleted or not found
- **New agent function `getComment()`** (`services/front/src/lib/agent.ts`): Wrapper around the new endpoint
- **Replaced inline expansion with page navigation** (`services/front/src/app/feed/[id]/page.tsx`): Clicking a comment/reply card now navigates to `/feed/[id]/comment?uri=…`; clicking an argument/milestone card navigates to `/ballots/[id]`. Removed `expandedUri` state, `handleToggleExpand`, and all inline `ArgumentComments` rendering. Removed `buildThreadTree`, `CommentNode`, `ArgumentComments`, and `ReplyInput` components (now only defined in the comment detail page)

### Activity Tab — Feed View Upgrade (`services/front`, `services/appview`, `infra/scripts/postgres`)
- **New DB table `app_activity_seen`** (`infra/scripts/postgres/db-setup.sql`): Persists per-user seen state for activity items. Primary key `(did, activity_uri)`, indexed on `did`
- **New endpoint `GET /xrpc/app.ch.poltr.activity.list`** (`services/appview/src/routes/poltr/__init__.py`): Returns a paginated, chronological activity feed for a ballot. Uses a CTE UNION of 4 activity types (new_argument, milestone, comment, reply). Supports `filter` (all/comments/arguments), ISO timestamp `cursor` pagination, and viewer context (like state + seen state)
- **New endpoint `POST /xrpc/app.ch.poltr.activity.markSeen`** (`services/appview/src/routes/poltr/__init__.py`): Marks a batch of activity URIs as seen for the authenticated user via `INSERT … ON CONFLICT DO NOTHING`
- **New `ActivityItem` TypeScript type** (`services/front/src/types/ballots.ts`): Covers all 4 activity types with actor, argument, comment, parent, and viewer sub-objects
- **New agent functions `listActivity`, `markActivitySeen`** (`services/front/src/lib/agent.ts`): Thin wrappers around the two new XRPC endpoints
- **Redesigned `/feed/[id]` page** (`services/front/src/app/feed/[id]/page.tsx`): Replaced virtualised argument list with an Activity Tab. Key changes:
  - 4 distinct card types (CommentActivityCard, ReplyActivityCard, NewArgumentActivityCard, MilestoneActivityCard) with colour-coded backgrounds
  - Blue dot unseen indicator + shadow elevation for unseen items
  - ArgumentContextBox reusable component (gray bg, blue left border) for argument context in comment/reply/milestone cards
  - Filter dropdown (All Activity / Arguments / Comments) replaces old PRO/CONTRA filter tabs + sort select
  - Click-to-expand inline comment section per card; marks item as seen on expand (optimistic update + DB persist)
  - "Load More" cursor-based pagination
  - Removed VirtualArgumentFeed and ArgumentCard components

## 2026-02-25

### Sliding Window Session Expiry (`services/appview`)
- **Session now extends on every request** (`src/auth/middleware.py`): Changed from fixed 7-day expiry to sliding window — `expires_at` is reset to `NOW() + APPVIEW_SESSION_LIFETIME_DAYS` on each authenticated request. Users stay logged in as long as they are active within any 7-day window; inactive sessions still expire and require magic-link re-auth

## 2026-02-23

### Peer Review Import & Structural Duplicate Prevention (`infra/scripts`, `services/appview`, `services/front`)
- **Added `import_peerreviews.py`** (`infra/scripts/`): Imports historical peer-review data from Demokratiefabrik xlsx dumps (`content_peerreview.xlsx`, `content_peerreview_progression.xlsx`) into PDS as `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` records on the governance account
  - Reads 99 INSERT peer review procedures and 2,562 individual invitation/response rows
  - Maps old `user_id` to PDS DIDs deterministically via `hash(user_id) % len(users)` (sorted by DID)
  - Scans existing argument records to build `content_id → AT URI` map
  - Uses `putRecord` with composed rkeys (`{content_id}-{did_suffix}`) for idempotent re-runs
  - Maps old binary criteria (0/1) to rating scale (1/5), `response=1` → `APPROVE`, `response=0` → `REJECT`
  - Env vars: `PDS_HOST`, `GOV_HANDLE`, `GOV_PASSWORD`, `BALLOT_URI`, `MAX_RESPONSES`, `DRY_RUN`, `PEERREVIEW_XLSX`, `PROGRESSION_XLSX`
- **Structural duplicate prevention for peer review** (`services/appview/src/lib/governance_pds.py`): Added `put_governance_record()` (upsert with explicit rkey) and `compose_review_rkey()` helper (`{arg_rkey}-{did_suffix}`). Duplicate invitations/responses are now impossible at the PDS level — `putRecord` overwrites rather than creating a second record
- **Refactored invitation creation** (`services/appview/src/lib/peer_review.py`): `_invite_for_argument()` now uses `put_governance_record` with composed rkey instead of `create_governance_record`
- **Refactored review submission** (`services/appview/src/routes/review/__init__.py`): `submit_review()` now uses `put_governance_record` with composed rkey. Existing DB duplicate check remains as fast-path guard
- **Updated lexicon key type** (`services/front/src/lexicons/`): Changed `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` from `"key": "tid"` to `"key": "any"` to allow composed rkeys
- **Updated docs** (`doc/PEER_REVIEW.md`): Documented composed rkey format, structural duplicate prevention mechanism, updated lexicon key types from `tid` to `any`, added import script to implementation files table

### Comment-on-Comment Threading (`infra/scripts`)
- **Added nested reply support to `import_comments.py`**: Previously, comments whose `parent_id` referenced another comment were silently skipped. Now uses two-pass parsing: Pass 1 reads all COMMENT rows into a dict; Pass 2 classifies each as root (parent is argument), nested (parent is another comment), or orphan (skip). Walks up the `parent_id` chain to resolve the root argument AT-URI for nested replies. Topological sort (Kahn's algorithm) ensures parents are created before children on the PDS. Tracks `comment_id → AT-URI` and `comment_id → DID` mappings during import. Sets `record.parent` to the direct parent comment's AT-URI for nested replies. Excludes parent comment's author when randomly assigning users to nested replies
- **Changed `create_comment()` return type**: Now returns the AT-URI string (or `None` on failure) instead of `bool`, enabling parent URI tracking for child comments

### Pseudonym Profile Fix (`services/appview`, `services/front`)
- **Re-enabled pseudonym record write** (`services/appview/src/auth/login.py`): The `app.ch.poltr.actor.pseudonym` PDS record write was commented out — new registrations wrote `app.bsky.actor.profile` but never the pseudonym record that the indexer watches. Re-enabled the write so the indexer populates `app_profiles` (display name, canton, color) on registration. Cast `height` to `int()` since ATProto DAG-CBOR rejects float values
- **Updated pseudonym lexicon** (`services/front/src/lexicons/app.ch.poltr.actor.pseudonym.json`): Changed `height` type from `"number"` to `"integer"` to match DAG-CBOR encoding constraint
- **Backfilled existing users**: Wrote `app.ch.poltr.actor.pseudonym` records for all 5 existing non-admin users from PDS profile + mountain template data, populating `app_profiles` so the feed view shows pseudonym names instead of "Anonym"

### Indexer Hotfix (runtime)
- **Deployed `parent_uri` support via ConfigMap**: The running indexer image (commit `61d7c56`) predated the `parent_uri` column support added in `75ba38f`. Patched the deployment with a ConfigMap volume mount for `db.js` to enable `parent_uri` indexing without a full image rebuild. To be removed after next CI deploy

## 2026-02-22

### Argument/Comment Feed View (`services/front`, `services/appview`, `services/indexer`)
- **Added feed view at `/feed/[id]`** (`services/front/src/app/feed/[id]/page.tsx`): New social-media-style single-column argument feed (max 640px, centered). Each argument renders as a card with colored canton avatar, pseudonym, relative timestamp, PRO/CONTRA pill badge, like toggle with optimistic UI, comment count, and share button. Left accent line (green/red 3px) per argument type
- **Restored classic view at `/ballots/[id]`**: Original 2-column PRO/CONTRA grid preserved as the default ballot detail page. Added "Feed View" button linking to `/feed/[id]`; feed page has "Classic View" button linking back
- **Added threaded inline comments**: Comments load lazily below each argument card. Flat API response is threaded client-side via `parentUri`. Shows first 3 top-level comments + 1 nested reply each, with "Show N more" expand. Smaller sizing for comments (28px avatar, 13px text). External Bluesky comments display handle + butterfly badge
- **Added filter/sort toolbar**: Sticky bar with filter tabs (Alle/Pro/Contra) and sort dropdown (Zufall/Top/Neu/Diskutiert). Re-fetches arguments on change
- **Added inline reply input**: Collapsed "Write a comment..." text input below each argument's comment thread, expands to textarea + Send on focus. Supports threaded replies via parent URI
- **Added "Add Argument" modal**: Overlay with PRO/CONTRA toggle, title input, body textarea, submit button. Creates `app.ch.poltr.ballot.argument` record on PDS
- **Added mobile FAB**: Floating "+" button (bottom-right, brand blue) on screens < 640px, hidden on desktop where toolbar button is shown instead
- **Enhanced `app.ch.poltr.argument.list` endpoint** (`services/appview/src/routes/poltr/__init__.py`): Added `sort` query param (`random`/`top`/`new`/`discussed`), `type` filter (`PRO`/`CONTRA`), and LEFT JOIN on `app_profiles` to include author `displayName`, `canton`, `color` in response
- **Added `app.ch.poltr.comment.list` endpoint** (GET): Returns flat comment list for an argument URI with author profile data (intern via `app_profiles` join, extern via stored handle/display_name), viewer like subquery, and `parentUri` for client-side threading
- **Added `app.ch.poltr.comment.create` endpoint** (POST): Creates comment records on PDS with optional `parent` URI for threaded replies. Validates argument exists
- **Added `app.ch.poltr.argument.create` endpoint** (POST): Creates argument records on PDS. Validates ballot exists and type is PRO/CONTRA
- **Fixed `refreshLikeCount`** (`services/indexer/src/db.js`): Now updates `app_arguments.like_count` and `app_comments.like_count` in addition to `app_ballots.like_count` — previously likes on arguments/comments were indexed but counts never persisted
- **Added `parent_uri` to intern comments** (`services/indexer/src/db.js`): `upsertCommentDb` now reads `record.parent` and stores it in `parent_uri` column, enabling threading for native comments (previously only set for extern Bluesky comments)
- **Updated comment lexicon** (`services/front/src/lexicons/app.ch.poltr.comment.json`): Added optional `parent` property (AT URI format) for threaded replies
- **Expanded `ArgumentWithMetadata.author`** (`services/front/src/types/ballots.ts`): Added `displayName?`, `canton?`, `color?` fields
- **Added `CommentRecord` and `CommentWithMetadata` types** (`services/front/src/types/ballots.ts`)
- **Enhanced `listArguments()`** (`services/front/src/lib/agent.ts`): Added `sort` and `type` params
- **Added API functions** (`services/front/src/lib/agent.ts`): `listComments()`, `createComment()`, `createArgument()`
- **Added `likeContent`/`unlikeContent` aliases** (`services/front/src/lib/ballots.ts`): Aliases for `likeBallot`/`unlikeBallot` (underlying API already accepts any subject URI)
- **Added `formatRelativeTime()`** (`services/front/src/lib/utils.ts`): Returns "jetzt", "5min", "2h", "3d", or falls back to `formatDate()` for older items

## 2026-02-21

### Comments on Arguments (`services/front`, `services/indexer`, `infra/scripts`)
- **Added lexicon** (`services/front/src/lexicons/app.ch.poltr.comment.json`): New `app.ch.poltr.comment` record type with `title`, `body`, `argument` (AT-URI reference to parent argument), and `createdAt`
- **Added `title` column** to `app_comments` table (`infra/scripts/postgres/db-setup.sql`)
- **Added indexer support** (`services/indexer/src/record_handler.js`, `services/indexer/src/db.js`): Handles `app.ch.poltr.comment` create/update/delete events from firehose — `upsertCommentDb()` (derives `ballot_uri`/`ballot_rkey` from parent argument, origin `'intern'`), `markCommentDeleted()`; both refresh `comment_count` on the parent `app_arguments` row via `refreshCommentCount()`
- **Added `import_comments.py`** (`infra/scripts/`): Imports COMMENT entries from `dump/content.xlsx` into PDS as `app.ch.poltr.comment` records
  - Scans existing arguments to resolve `parent_id` (xlsx) → argument AT URI
  - Assigns comments to random non-admin PDS users; reuses same account on re-import
  - Uses `putRecord` with deterministic rkeys (xlsx row id) for idempotent re-imports
  - Same env vars as `import_arguments.py`: `PDS_HOST`, `PDS_ADMIN_PASSWORD`, `BALLOT_URI`, `MAX_IMPORTS`, `XLSX_PATH`, `INDEXER_POSTGRES_URL`, `APPVIEW_PDS_CREDS_MASTER_KEY_B64`
- **Updated docs** (`doc/LEXICONS.md`): Added `app.ch.poltr.comment` record documentation; updated data hierarchy diagram

### Ballot-level Counts (`services/indexer`, `infra/scripts`)
- **Added `argument_count` and `comment_count` columns** to `app_ballots` table (`infra/scripts/postgres/db-setup.sql`)
- **Added indexer refresh functions** (`services/indexer/src/db.js`): `refreshBallotArgumentCount()` called on argument create/delete; `refreshBallotCommentCount()` called on comment create/delete

## 2026-02-20 (Peer Review)

### Peer-Review System for Arguments (`services/appview`, `services/indexer`, `services/front`, `infra`)

Community-driven quality gate for user-submitted arguments. Arguments start as "preliminary", undergo probabilistic peer-review by active users, and if approved, get republished as exact copies to the governance account's PDS. Controlled by `APPVIEW_PEER_REVIEW_ENABLED` feature flag (default: off). See `doc/PEER_REVIEW.md` for the full design.

- **Database schema** (`infra/scripts/postgres/db-setup.sql`): Added `review_status`, `original_uri`, `governance_uri` columns to `app_arguments`; created `app_review_invitations` and `app_review_responses` tables with unique constraints and indexes
- **Lexicons** (`services/front/src/lexicons/`): Added `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` record schemas
- **Secrets** (`infra/kube/secrets.yaml.dist`): Added `APPVIEW_PEER_REVIEW_ENABLED`, `APPVIEW_PEER_REVIEW_QUORUM`, `APPVIEW_PEER_REVIEW_INVITE_PROBABILITY`, `APPVIEW_PEER_REVIEW_POLL_INTERVAL_SECONDS`, `APPVIEW_PEER_REVIEW_CRITERIA` to appview-secrets; added `APPVIEW_PEER_REVIEW_QUORUM` to indexer-secrets
- **Indexer** (`services/indexer/src/`): Added firehose handlers for `review.invitation` and `review.response` collections; modified `upsertArgumentDb` to derive initial `review_status` from `originalUri` field; added post-index quorum check in `upsertReviewResponseDb` — updates `review_status` to `approved`/`rejected` when decision formula is met
- **Governance PDS helper** (`services/appview/src/lib/governance_pds.py`): Extracted shared governance session management from crosspost.py; added `create_governance_record()` helper used by crosspost, peer-review invitations, and governance copy creation
- **Peer-review background loop** (`services/appview/src/lib/peer_review.py`): Two responsibilities per poll cycle: (1) invite eligible active users for preliminary arguments with configurable probability, (2) create governance PDS copies for newly approved arguments (where indexer set `review_status = 'approved'` but `governance_uri` is not yet set)
- **Review endpoints** (`services/appview/src/routes/review/__init__.py`): 4 XRPC endpoints — `review.pending` (list invitations for user), `review.submit` (write review to governance PDS; quorum check happens in indexer via firehose), `review.status` (vote counts + quorum progress; author sees individual feedback), `review.criteria` (configurable criteria list from env)
- **Modified argument listing** (`services/appview/src/routes/poltr/__init__.py`): Added `reviewStatus` to response when peer review is enabled; filters rejected arguments to author-only visibility; when `APPVIEW_PEER_REVIEW_ENABLED=false`, omits `reviewStatus` and shows all arguments without filtering
- **Modified crosspost** (`services/appview/src/lib/crosspost.py`): Refactored to use shared `governance_pds.py`; preliminary arguments cross-posted with `[Preliminary]` prefix under author (only when peer review enabled); approved governance copies cross-posted under governance account
- **Frontend types** (`services/front/src/types/ballots.ts`): Added `ReviewCriterion`, `ReviewCriterionRating`, `ReviewInvitation`, `ReviewStatus`, `ReviewResponse` interfaces; added `reviewStatus` to `ArgumentWithMetadata`
- **Frontend API** (`services/front/src/lib/agent.ts`): Added `getReviewCriteria()`, `getPendingReviews()`, `submitReview()`, `getReviewStatus()`
- **Frontend UI** (`services/front/src/app/`): Added review status badges (amber "Preliminary", green "Peer-reviewed", red "Rejected") on argument cards in ballot detail; created `/review` dashboard page with criteria rating sliders (1–5), approve/reject toggle, justification textarea; added Peer Review navigation button

## 2026-02-20

### Ballot Arguments (`services/indexer`, `services/front`, `infra/scripts`)
- **Added lexicon** (`services/front/src/lexicons/app.ch.poltr.ballot.argument.json`): New `app.ch.poltr.ballot.argument` record type with `title`, `body`, `type` (PRO/CONTRA), `ballot` (AT-URI reference), and `createdAt`
- **Added `app_arguments` table** (`infra/scripts/postgres/db-setup.sql`): Stores arguments with `ballot_uri`/`ballot_rkey` foreign references, `bsky_post_uri`/`bsky_post_cid` for cross-posts, `like_count`, `comment_count`, soft-delete support; indexed on `ballot_uri`, `ballot_rkey`, `did`, `type`
- **Added indexer support** (`services/indexer/src/record_handler.js`, `services/indexer/src/db.js`): Handles `app.ch.poltr.ballot.argument` create/update/delete events from firehose — `upsertArgumentDb()`, `markArgumentDeleted()` (returns bsky_post_uri for cleanup)

### Argument Cross-Posting to Bluesky (`services/indexer`)
- **Added `createBskyArgumentPost()`** (`services/indexer/src/pds_client.js`): Posts arguments as `app.bsky.feed.post` replies to the ballot's cross-posted Bluesky post. Authenticates as the argument author (not governance) using stored app passwords from `auth.auth_creds`
- **Added `deleteBskyPost()`** (`services/indexer/src/pds_client.js`): Deletes cross-posts by extracting the DID from the AT-URI and authenticating as that user; falls back to governance account for older posts
- **Added DB helpers** (`services/indexer/src/db.js`): `getArgumentBskyPostUri()`, `setArgumentBskyPostUri()` for tracking argument cross-post URIs
- **Wired up cross-post lifecycle** (`services/indexer/src/record_handler.js`): On argument create, cross-posts as reply if ballot has a Bluesky post; on argument delete, removes the cross-post

### Argument Import Script (`infra/scripts`)
- **Added `import_arguments.py`**: Imports PRO/CONTRA arguments from `dump/content.xlsx` into PDS as `app.ch.poltr.ballot.argument` records
  - Assigns arguments to random non-admin PDS users to simulate real platform behaviour
  - Authenticates using stored app passwords from `auth.auth_creds` (no `updateAccountPassword` — preserves credentials)
  - Uses `putRecord` with deterministic rkeys (xlsx row id) for idempotent re-imports
  - Scans all repos for existing arguments before import to reuse the same account on re-import (prevents duplicates)
  - Env vars: `PDS_HOST`, `PDS_ADMIN_PASSWORD`, `BALLOT_URI`, `MAX_IMPORTS`, `XLSX_PATH`, `INDEXER_POSTGRES_URL`, `APPVIEW_PDS_CREDS_MASTER_KEY_B64`
- **Updated `import_proposals.py`**: Added `BALLOT_ANR` env var to import a single ballot by BFS number

### Indexer Auth Access (`infra/scripts/postgres/db-setup.sql`)
- **Granted indexer read access to `auth.auth_creds`**: Required for decrypting user app passwords for Bluesky cross-posts (`GRANT USAGE ON SCHEMA auth TO indexer; GRANT SELECT ON auth.auth_creds TO indexer`)

## 2026-02-16

### Bluesky Feed Generator (`services/appview`, `infra/kube`)
- **Added `app.bsky.feed.getFeedSkeleton` endpoint** (`src/routes/feed/__init__.py`): Returns a skeleton of cross-posted ballot post URIs for the poltr feed. Queries `app_ballots` for rows with `bsky_post_uri IS NOT NULL AND NOT deleted`, ordered by `created_at DESC`. Uses composite `created_at::rkey` cursor for stable pagination. Validates feed URI, supports `limit` (1–100, default 50) and `cursor` params.
- **Added `app.bsky.feed.describeFeedGenerator` endpoint** (`src/routes/feed/__init__.py`): Returns the feed generator DID (`did:web:app.poltr.info`) and the poltr feed URI
- **Updated `/.well-known/did.json`** (`src/wellknown.py`): Added `BskyFeedGenerator` service entry so Bluesky can discover the feed generator at `https://app.poltr.info`
- **Added `APPVIEW_FEED_GENERATOR_DID`** to `appview-secrets` (`infra/kube/secrets.yaml`): Defaults to `did:web:app.poltr.info`
- **Manual step required**: Create `app.bsky.feed.generator` record (rkey `poltr`) in governance account repo on PDS — see `doc/BLUESKY_FEED.md`

## 2026-02-15b

### Bluesky Cross-Post Fix (`services/indexer`, `services/appview`)
- **Fixed cross-post not triggering**: `PDS_GOVERNANCE_ACCOUNT_DID` and `PDS_GOVERNANCE_PASSWORD` were missing/wrong in both K8s secrets and local `.env` — updated to match `admin.id.poltr.ch` (`did:plc:3ch7iwf6od4szklpolupbv7o`)
- **Fixed TID rkey format**: Switched `upsertBskyPost` from `putRecord` (plain rkey) to `createRecord` (auto-generated TID rkey). Bluesky's AppView only indexes `app.bsky.feed.post` records with TID-format rkeys
- **Upsert support for cross-posts**: On ballot update, deletes the previous cross-post and creates a new one; passes `existingPostUri` from DB to avoid orphaned posts
- **Added `bsky_post_uri` column** to `app_ballots` (was missing from live DB, already in `db-setup.sql`)
- **AppView session re-login fallback** (`src/lib/atproto_api.py`): When both access and refresh tokens are expired, `_ensure_fresh_token` now falls back to re-authenticating using the encrypted PDS password stored in `auth_creds` instead of failing with "Failed to refresh session"

## 2026-02-15

### Bluesky Cross-Likes (`services/appview`, `services/indexer`)
- **New `_create_bsky_cross_like()` function** (`src/routes/poltr/__init__.py`): When a user likes a ballot entry on POLTR, automatically creates a corresponding `app.bsky.feed.like` on Bluesky targeting the cross-posted Bluesky post (best-effort, non-blocking)
- **Updated unlike endpoint**: Deletes the mirrored Bluesky like when user unlikes on POLTR
- **Added `bsky_post_cid` column** to `app_ballots` (`db-setup.sql`): Stores CID of cross-posted Bluesky post (needed for like targeting)
- **Added `bsky_like_uri` column** to `app_likes` (`db-setup.sql`): Tracks mirrored Bluesky like URI for deletion on unlike
- **Updated indexer cross-post** (`pds_client.js`, `record_handler.js`, `db.js`): Now stores both URI and CID when cross-posting ballot entries to Bluesky

### AppView Token Refresh Refactor (`services/appview`)
- **New `_ensure_fresh_token()` helper** (`src/lib/atproto_api.py`): Extracted duplicate PDS token refresh logic into reusable function. Now used by `pds_create_app_password()`, `pds_create_record()`, and `pds_delete_record()`

### Account Limit Enforcement (`services/appview`)
- **New `MAX_PDS_ACCOUNTS` config** (`src/config.py`): Environment variable (default: 50) to cap account creation. Bluesky relay throttles at 100 accounts per PDS hostname
- **Updated `create_account()`** (`src/auth/login.py`): Returns 503 `"account_limit_reached"` when limit hit

### Indexer Backfill Rewrite (`services/indexer`)
- **Rewrote `runBackfill()`** (`src/backfill_handler.js`): Replaced multi-batch iterator with single-pass idle-timeout approach using Firehose + MemoryRunner. Runs until no new events for `BACKFILL_IDLE_TIMEOUT_SEC` (default 10s), then auto-cleans up
- **Added MemoryRunner to main firehose** (`src/main.js`): Cursor now persisted on every event via `runner.setCursor()`. Removed manual workaround for `@bluesky-social/sync` getCursor bug
- **Added `/health` endpoint** (`src/main.js`): Returns firehose connection state and current cursor
- **Added `FIREHOSE_ENABLED` env var**: Can disable firehose for testing
- **Updated dependencies** (`package-lock.json`): Express 4.22.1, Fastify 5.7.4, body-parser 1.20.4

### Removed Unused Ballot Embed Lexicon (`services/front`)
- **Deleted `app.ch.poltr.ballot.embed.json`**: Unused lexicon schema — cross-posting uses `app.bsky.embed.external` (link cards) instead
- **Cleaned up** `src/lib/lexicons.ts`, `src/types/ballots.ts`: Removed related types and validation functions

### Test Registration Script (`infra/scripts`)
- **Added `test_registration.py`**: Step-by-step diagnostic tool that creates a test account, traces the full federation chain (PDS → PLC → relay → Bluesky AppView), identifies exactly where the chain breaks, with interactive pauses and automatic cleanup

### Documentation
- **Added `doc/pds-relay-probleme.md`** (German): Operational runbook covering three PDS-relay failure modes — throttling on first boot (race condition), sequence gap after reset, and throttling risk on restore
- **Updated `doc/FEDERATION.md`**: Removed `app.ch.poltr.ballot.embed`, documented cross-likes to Bluesky
- **Updated `doc/BALLOTS.md`**: Documented cross-post and cross-like behavior
- **Updated `doc/LEXICONS.md`**: Removed `app.ch.poltr.ballot.embed` section
- **Updated `CLAUDE.md`**: Added "PDS — Critical: Do Not Break Relay Federation" safety section

### Misc
- **Updated `infra/scripts/import_proposals.py`**: Removed 1-year date filter — now imports all historical ballots

## 2026-02-14

### PDS Rename: `pds.poltr.info` → `pds2.poltr.info`
- **Context**: The hostname `pds.poltr.info` is permanently throttled on the Bluesky relay (`bsky.network`). Throttling is hostname-based and cannot be fixed from our side. Renaming to `pds2.poltr.info` gives a clean relay reputation.
- **Updated code defaults** (11 files): All hardcoded `pds.poltr.info` references updated to `pds2.poltr.info` in appview config, auth routes, frontend pages/Dockerfile/.env, indexer service/Dockerfile, pds_reset.py, test_registration.py, and GitHub Actions workflow.
- **Updated K8s manifests**: `PDS_HOSTNAME` in `secrets.yaml.dist` (pds-secrets + indexer-secrets), Ingress host in `poltr.yaml`.
- **Updated documentation**: Bulk replaced `pds.poltr.info` → `pds2.poltr.info` across CLAUDE.md, README.md, FEDERATION.md, DOMAINS.md, ARCHITECTURE.md, bluesky-interoperability.md, pds-relay-probleme.md.
- **What does NOT change**: K8s service name `pds`, internal URL `http://pds.poltr.svc.cluster.local`, PVC name `pds-data`, TLS cert (`*.poltr.info` wildcard).
- **Manual steps required**: Generate new `did:plc` via `pds_reset.py`, K8s reset procedure, DNS update (`*.id.poltr.ch` CNAME → `pds2.poltr.info`), rebuild frontend Docker image.

## 2026-02-13

### PDS Hard Reset Script (`infra/scripts`)
- **Added `pds_reset.py`** (`infra/scripts/pds_reset.py`): Two-mode script for PDS identity reset. Mode 1 (default): generates new secp256k1 key pair, derives `did:key`, builds and signs PLC genesis operation (DAG-CBOR + SHA-256 + secp256k1), computes `did:plc`, registers at `plc.directory`, and prints new secret values, K8s reset checklist, and DB cleanup SQL. Mode 2 (`--verify`): post-reset verification that checks PDS health, `describeServer`, PLC resolution, `requestCrawl`, creates a test account, writes a profile, and — critically — verifies the relay reports `active: true` (not throttled). Cleanup deletes the test account.
- **Context**: All 22 existing accounts were permanently `RepoInactive: throttled` by the Bluesky relay, creating broken stubs on the Bluesky AppView (`createdAt: 0001-01-01`). A new PDS server DID with clean relay reputation is required.

### Bluesky Federation Fix (`services/appview`)
- **Added relay repo indexing barrier** (`src/lib/atproto_api.py`): New `wait_for_relay_repo_indexed()` polls `bsky.network/xrpc/com.atproto.sync.getLatestCommit` until the relay confirms it has indexed the repo commit (up to 30s). This is the critical fix: the Bluesky AppView creates permanent broken stub entries when it processes an `#identity` event before the corresponding repo commit (containing the profile record) is available on the relay.
- **Added PLC resolution barrier** (`src/lib/atproto_api.py`): New `wait_for_plc_resolution()` polls plc.directory until the DID is resolvable (up to 10s) before writing records.
- **Added handle-toggle workaround** (`src/lib/atproto_api.py`): New `pds_admin_toggle_handle()` forces a second `#identity` event on the PDS firehose after account creation, giving the AppView a second chance to index the account (see [atproto#4379](https://github.com/bluesky-social/atproto/discussions/4379))
- **Updated registration flow** (`src/auth/login.py`): After `createAccount`, the flow now: (1) waits for PLC resolution, (2) writes minimal + full profile records, (3) requests relay crawl, (4) **waits for relay to confirm repo is indexed**, (5) only then toggles handle to emit the `#identity` event — ensuring the AppView sees the repo data before processing the identity event
- **Fixed relay rev comparison** (`src/lib/atproto_api.py`, `src/auth/login.py`): `wait_for_relay_repo_indexed()` now compares commit revs instead of just checking for any 200 response. Previously, the relay could return 200 for an older commit (from initial account creation, before the profile was written), causing the handle toggle to fire while the relay still lacked the profile data. Now `pds_put_record()` returns the commit rev, and the relay wait verifies the relay has that exact rev or newer before proceeding.

## 2026-02-12

### Bluesky Cross-Post for Ballot Entries (`services/indexer`)
- **Added PDS client module** (`services/indexer/src/pds_client.js`): Authenticates as the governance account on the PDS and creates `app.bsky.feed.post` records with `app.bsky.embed.external` embedding a link card back to POLTR
- **Updated record handler** (`services/indexer/src/record_handler.js`): On new `app.ch.poltr.ballot.entry` from the governance DID, auto-creates a corresponding Bluesky post (non-blocking — indexing continues on failure)
- **Added `bsky_post_uri` column** (`infra/scripts/postgres/db-setup.sql`, `services/indexer/src/db.js`): Tracks cross-posted Bluesky post URIs on `app_ballots` to prevent duplicates
- **New env vars**: `PDS_INTERNAL_URL`, `PDS_GOVERNANCE_ACCOUNT_DID`, `PDS_GOVERNANCE_PASSWORD`, `FRONTEND_URL`
- **Updated K8s secrets** (`infra/kube/secrets.yaml.dist`): Added `PDS_GOVERNANCE_ACCOUNT_DID` to `pds-secrets`; added `PDS_GOVERNANCE_PASSWORD` and `FRONTEND_URL` to `indexer-secrets`
- **Updated indexer deployment** (`infra/kube/poltr.yaml`): Indexer now pulls `PDS_INTERNAL_URL` and `PDS_GOVERNANCE_ACCOUNT_DID` from `pds-secrets`

### Handle Domain Migration (`id.poltr.ch`)
- **Added TLS certificate for `*.id.poltr.ch`** (`infra/cert/cert-manager-wildcard.yaml`): New Certificate resource using DNS-01 challenge via existing `letsencrypt-prod-dns` ClusterIssuer
- **Added Ingress TLS + routing for `*.id.poltr.ch`** (`infra/kube/poltr.yaml`): New TLS entry with `poltr-handle-tls` secret; new host rule routing `*.id.poltr.ch` to PDS (placed before `*.poltr.info` catch-all)
- **Updated `PDS_SERVICE_HANDLE_DOMAINS`** (`infra/kube/secrets.yaml`, `secrets.yaml.dist`): Changed from `.poltr.info` to `.id.poltr.ch` — new accounts get `@user.id.poltr.ch` handles
- **Manual steps required**: DNS CNAME `*.id.poltr.ch → pds.poltr.info` must be created in Infomaniak Panel; existing accounts need handle migration

## 2026-02-11

### Indexer Fixes (`services/indexer`)
- **Added `getCursor` to firehose subscription** (`src/main.js`): Firehose now resumes from last known cursor on restart, preventing missed events during pod downtime
- **Fixed graceful shutdown** (`src/main.js`): Changed `firehose.stop()` to `firehose.destroy()` to match the `@bluesky-social/sync` API

### Pseudonymization (`app.ch.poltr.actor.pseudonym`)
- **Added lexicon schema** (`services/front/src/lexicons/app.ch.poltr.actor.pseudonym.json`): New record type for pseudonymous identities with `displayName`, `mountainName`, `mountainFullname`, `canton`, `height`, `color`, and `createdAt`
- **Added `auth.mountain_templates` table** (`infra/scripts/postgres/db-setup.sql`): Seed/reference table with 4,294 Swiss mountains (name, fullname, canton, height >= 2,000m)
- **Added `app_profiles` table** (`infra/scripts/postgres/db-setup.sql`): Ephemeral indexed table keyed by DID, stores pseudonym data from firehose
- **Added mountain seed data** (`infra/scripts/postgres/seed-mountains.sql`): 4,294 INSERT statements generated from `doc/templates/berge_vorlage.xlsx`; generator script at `infra/scripts/postgres/seed-mountains.py`
- **Rewrote pseudonym generator** (`services/appview/src/auth/pseudonym_generator.py`): `generate_pseudonym()` draws random mountain from DB, generates random letter (A-Z) and luma-constrained hex color
- **Added PDS write functions** (`services/appview/src/lib/atproto_api.py`): `pds_set_profile()` writes `app.bsky.actor.profile` with displayName; `pds_write_pseudonym_record()` writes `app.ch.poltr.actor.pseudonym` record via `com.atproto.repo.putRecord`
- **Integrated in account creation** (`services/appview/src/auth/login.py`): `create_account()` now generates pseudonym, writes profile + pseudonym records to PDS, and passes displayName to session cookie
- **Added indexer support** (`services/indexer/src/record_handler.js`, `services/indexer/src/db.js`): Handles `app.ch.poltr.actor.pseudonym` events from firehose — `upsertProfileDb()` on create/update, `deleteProfile()` on delete
- **Added documentation** (`doc/PSEUDONYMIZATION.md`): Describes concept, architecture, database schema, ATProto lexicon, and data flow

## 2026-02-10

### Ballot Likes Feature (`app.ch.poltr.ballot.like`)
- **Added Lexicon schema** (`services/front/src/lexicons/app.ch.poltr.ballot.like.json`): New record type for liking ballot entries, with `subject` (uri + cid) and `createdAt` fields
- **Added `app_likes` table** (`infra/scripts/postgres/db-setup.sql`): Stores individual likes with `uri`, `cid`, `did`, `subject_uri`, `subject_cid`, soft-delete support; indexed on `subject_uri` and `did`
- **Added `like_count` column to `app_ballots`**: Denormalized count for fast reads, maintained by the indexer
- **Added indexer DB helpers** (`services/indexer/src/db.js`): `upsertLikeDb`, `markLikeDeleted`, `refreshLikeCount` — upsert/delete likes and recount after each mutation
- **Updated record handler** (`services/indexer/src/record_handler.js`): Routes `app.ch.poltr.ballot.like` events to like helpers, `app.ch.poltr.ballot.entry` to ballot helpers, ignores other collections
- **Updated AppView API** (`services/appview/src/routes/poltr/__init__.py`): `app.ch.poltr.ballot.list` now returns `likeCount` from the denormalized column and `viewer.liked` (boolean) via an `EXISTS` subquery against the authenticated user's DID

## 2026-02-07

### services/front
- **Moved auth calls server-side via Next.js API routes**: Session token now lives in an `httpOnly` cookie instead of `localStorage`, eliminating XSS exposure
- **Added `api/auth/verify-login/route.ts`**: Proxies login verification to AppView, sets session as `httpOnly` cookie
- **Added `api/auth/verify-registration/route.ts`**: Same pattern for registration verification
- **Added `api/auth/logout/route.ts`**: Clears the `poltr_session` cookie
- **Added `api/auth/session/route.ts`**: Session validity check for AuthContext hydration
- **Added `api/xrpc/[...path]/route.ts`**: Catch-all XRPC proxy — forwards all AppView calls server-side, reads `poltr_session` cookie and sends as `Authorization: Bearer` header
- **Updated all client pages**: `page.tsx`, `verify-login`, `register`, `verify-registration` now use relative `/api/...` URLs instead of direct AppView calls
- **Updated `lib/agent.ts`**: All XRPC calls (`listProposals`, `createAppPassword`, `initiateEidVerification`) route through `/api/xrpc/...` proxy; removed `localStorage` session token logic
- **Updated `lib/AuthContext.tsx`**: On mount verifies session via `/api/auth/session`; logout calls `/api/auth/logout`; removed all `session_token` localStorage references
- **`APPVIEW_URL` server-only env var**: API routes use `APPVIEW_URL` with fallback to `NEXT_PUBLIC_API_URL` for local dev compatibility
- **Hardened `RichText` component**: Whitelisted heading tags to `h1`–`h6` (prevents arbitrary tag injection), restricted link `href` to `http(s)://`, `mailto:`, `tel:`, and relative paths (blocks `javascript:` URIs)
- **Extracted `useAppPassword` hook**: Moved app password state and logic from `home/page.tsx` to `lib/useAppPassword.ts`
- **Reorganized auth pages under `app/auth/`**: Moved `register`, `verify-login`, `verify-registration`, `magic-link-sent`, `callback` into `auth/` subfolder (URLs now `/auth/...`); updated all internal links and import paths
- **Updated `README.md`**: Rewrote project structure, documented `app/auth/` vs `app/api/auth/` distinction, corrected tech stack (was still referencing Vite/Nginx)

- **Fixed `lib/proposals.ts`**: Changed `sessionStorage.getItem('user')` to `localStorage.getItem('poltr_user')` — `createProposal`, `deleteProposal`, `updateProposal` were broken
- **Cleaned up Dockerfile**: Removed hardcoded env defaults, removed `NEXT_PUBLIC_API_URL` (no longer used client-side); `NEXT_PUBLIC_*` build args now passed from CI
- **Untracked `.env.local` from git**: Added `**/.env.*` to `.gitignore`, kept `!**/.env.example`

### services/appview
- **Updated email template links**: Magic link URLs now point to `/auth/verify-login` and `/auth/verify-registration`

### CI/CD
- **Added `NEXT_PUBLIC_*` build args to GitHub Actions**: Frontend Docker build now receives public env vars (redirect URI, client ID base, PDS URL, handle resolver) via `build-args`

### Infrastructure
- **Added `APPVIEW_URL` to `front-secrets`**: Runtime server-only env var for API route proxying to AppView
- **Restructured repo root**: Consolidated `k8s/`, `setup/`, `issues/` into `infra/` with subfolders (`kube/`, `cert/`, `deployer/`, `scripts/`, `openstack/`); moved docs to `doc/`; renamed `ARCHIV` to `archive`
- **Removed root `package.json`/`node_modules`**: Unused workspace root with only `concurrently` devDependency
- **Cleaned up `.gitignore`**: Updated all paths for new structure; ignored entire `infra/openstack/` directory

### Documentation
- **Rewrote root `README.md`**: Updated repo structure, services table, doc links, quick start (was still referencing Vite, broken links to moved files)
- **Updated `doc/TODO.md`**: Moved completed items (CMS, backfill, auth, etc.) to Done section
- **Updated `doc/ARCHITECTURE.md`**: Added server-side auth proxy to frontend section, data flow, and security notes
- **Updated `CLAUDE.md`**: Fixed frontend tech stack (Next.js, not Vite)

## 2026-02-05

### Infrastructure: Load Balancer Removal
- **Switched from OpenStack LoadBalancer to hostPort**: ingress-nginx now binds directly to ports 80/443 on the node via hostPort, eliminating the OpenStack LB
- **Assigned floating IP to node**: `83.228.203.147` moved from LB to node `ext1-pck-uvgx6be-pjt-pwlbk-g6tz7`
- **Added security group rules**: Opened TCP 80 and 443 on the node's security group for public access
- **Cost savings**: ~10 CHF/month (from ~17 to ~7 CHF/month)
- **Added `doc/LOAD_BALANCING.md`**: Documents current dev/test setup and go-live restore procedure with all OpenStack resource IDs

### services/front
- **Fixed RichText build error**: Changed `JSX.IntrinsicElements` to `React.JSX.IntrinsicElements` in `src/components/RichText.tsx` (React 19 namespace change)
- **CMS connectivity fix**: `CMS_INTERNAL_SERVER_URL` must use internal K8s service name (`http://cms.poltr.svc.cluster.local`) for server-side CMS fetches from within the cluster

### k8s/poltr.yaml
- **Added CMS service**: Deployment, Service, and Ingress for Payload CMS at `cms.poltr.info`
- **Updated ingress**: Added `cms.poltr.info` host rule

### Documentation
- **Rewrote `doc/ARCHITECTURE.md`**: Updated with all 10 services (added CMS, Ozone, Ozone Redis, Verifier, eID Proto), ingress routing table, internal service DNS, PVCs, secrets, ConfigMaps, CronJobs
- **Updated frontend tech stack**: Corrected from React+Vite+Nginx to Next.js 16 + standalone Node.js

## 2026-02-04

### services/front
- **Embedded CMS into frontend**: Added `[slug]/page.tsx` catch-all route for CMS pages with `generateStaticParams` for SSG
- **Added CMS client library** (`src/lib/cms.ts`): Fetches pages, blocks, media, settings from Payload CMS with ISR (60s revalidation)
- **Added RichText renderer** (`src/components/RichText.tsx`): Lightweight Lexical JSON renderer for Payload CMS content (bold, italic, headings, lists, links, images, quotes)

### services/cms
- **Fixed CMS pod**: Corrected deployment configuration and health checks

## 2026-02-03

### services/cms (NEW)
- **Set up Payload CMS 3.x**: Headless CMS for managing frontend content
- **Collections**:
  - `Users` - Admin authentication
  - `Media` - Image/file uploads with alt text
  - `Pages` - Full pages with title, slug, rich text content, SEO metadata, draft/published status
  - `Blocks` - Reusable content blocks for homepage, header, footer, sidebar, banner, modal placements
- **Stack**: Payload 3.74.0, Next.js 15.4.11, React 19, PostgreSQL (shared database)
- **Port**: Runs on port 3002

### services/front
- **Refactored to Next.js**: Migrated frontend from Vite/React to Next.js App Router
- **Added CMS client** (`src/lib/cms.ts`): API helper for fetching pages, blocks, media, and settings from Payload CMS
- **ISR support**: Content cached with 60-second revalidation

### services/appview
- **Restructured API routes**: Reorganized XRPC endpoint handlers for better maintainability

## 2026-02-02

### Ozone Moderation Service
- **Fixed handle verification**: Added Ingress path routing for `/.well-known/atproto-did` to PDS for `ozone.poltr.info`
- **Created new moderation account**: `moderation.poltr.info` (`did:plc:5ecl3anpfxtmn2szxsm2mjhf`)
- **Registered labeler service**: Added `#atproto_labeler` service to DID via PLC operation
- **Updated OZONE_SERVER_DID**: Changed from `did:web:ozone.poltr.info` to `did:plc:5ecl3anpfxtmn2szxsm2mjhf`
- **Updated OZONE_ADMIN_DIDS**: Added moderation account to admin list
- **Deleted old account**: Removed `ozone.poltr.info` from PDS

### k8s/poltr.yaml
- **Added `.well-known/atproto-did` routing**: For `ozone.poltr.info`, routes handle verification requests to PDS while other requests go to Ozone service

### Documentation
- **Added `doc/CREATE_MODERATION_ACCOUNT.md`**: Step-by-step guide for creating Ozone moderation accounts with PLC operations

## 2026-01-29

### services/eidproto
- **Fixed Dockerfile**: Changed from `npm ci` to `pnpm install` since the project uses pnpm as package manager
- **Generated `pnpm-lock.yaml`**: Required for reproducible builds

### services/appview
- **Added Bluesky proxy** (`src/bsky_proxy.py`): Forwards `app.bsky.*` XRPC requests to Bluesky's upstream AppView (`api.bsky.app`), allowing the AppView to extend Bluesky while maintaining compatibility
- **Added birthDate to account creation**: Set to `1970-01-01` by default for Bluesky compatibility (required field for age verification)
- **Implemented admin account creation flow**:
  - Added `_pds_admin_create_invite_code()` helper function
  - Updated `pds_api_admin_create_account()` to first generate a single-use invite code via admin auth, then create the account with that code
  - Uses internal K8s URL (`http://pds.poltr.svc.cluster.local`) for admin operations
  - This works with `PDS_INVITE_REQUIRED=true` on the PDS
- **Fixed birthDate preference for Bluesky compatibility**:
  - Added `set_birthdate_on_bluesky()` function to set birthDate on Bluesky's AppView
  - Called automatically when user creates an App Password (= wants to use Bluesky)
  - Uses correct preference type: `app.bsky.actor.defs#personalDetailsPref` (not `#birthDate`)
  - Format: `"1970-01-01T00:00:00.000Z"` (ISO with time)
  - Checks if birthDate already exists before setting
- **Fixed user session response**: Now returns full user object with `did`, `handle`, `displayName` instead of just DID string
- **Fixed frontend VerifyMagicLink**: Changed from `data.user.email` to `data.user.did`

### k8s/secrets.yaml.dist
- **Updated PDS AppView config**: Changed from custom AppView to Bluesky's official AppView for federation:
  ```yaml
  PDS_BSKY_APP_VIEW_URL: "https://api.bsky.app"
  PDS_BSKY_APP_VIEW_DID: "did:web:api.bsky.app"
  ```

### Documentation
- **Added `issues/bluesky-interoperability.md`**: Documents the birthDate/age verification problem with Bluesky, including hardcoded AppView DIDs, attempted solutions, and the final working approach

### Architecture Notes
- **PDS config** points to Bluesky's AppView (`api.bsky.app`) so official Bluesky clients work
- **Custom frontend** can call `app.poltr.info` directly for poltr-specific features (`app.ch.poltr.*`)
- **AppView proxy** forwards standard Bluesky requests upstream while handling custom routes locally
- **birthDate flow**: Account on own PDS → App Password creation → birthDate set on Bluesky → User can login to Bluesky without age prompt
