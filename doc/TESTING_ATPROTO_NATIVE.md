# Testkonzept: ATProto-native Deliberation (Akzeptanz-Pipeline)

Testet die Phasen 1–4 (Plan `typed-kindling-flask`, Konzept `doc/ATPROTO_NATIVE_DELIBERATION.md`).
Die Pipeline ist flag-gated; getestet wird **die neue Logik**, nicht das (unveränderte) Default-Verhalten.

## Warum drei Schichten

Die Pipeline spannt über **appview (Python)** → **PDS/Firehose** → **Projektor (Node)** →
**`app_acceptance_queue` (Postgres)** → **Writer (Python)** → **Community-Repo** → zurück. Es gibt
**keine** Test-DB-/PDS-Infra im Repo, und der bestehende pytest-`FakePool` kann **keine** echten
Transaktionen, `FOR UPDATE SKIP LOCKED`, `LISTEN/NOTIFY` oder einen Firehose simulieren. Deshalb:

| Schicht | Deckt ab | Werkzeug | Automatisiert |
|---------|----------|----------|---------------|
| **1 Unit/Logik** | Gate-Entscheidungen, Record-Bau, rkey, Idempotenz | pytest + Mocks (kein DB/PDS) | ✅ |
| **2 SQL-Contract** | richtige SQL/Params (Queue-Insert+NOTIFY, origin-Spalten) | `node:test` + Fake-Pool | ✅ |
| **3 E2E** | echte Tx-Semantik, NOTIFY/SKIP LOCKED, Firehose-Echo, PDS | Dev-Cluster, **manuell** (Checkliste) | ❌ (siehe unten) |

## Schicht 1 — Unit/Logik (appview, pytest)

`services/appview/tests/test_acceptance.py` — der Writer-Kern (`src/atproto/acceptance.py`):
- `_community_rkey` deterministisch, kollisionsfrei, gültiger rkey-Charset.
- `_as_dict` (str/dict/None/Schrott).
- `_accept_argument`: Happy-Path schreibt Community-Record mit `source.originUri/originCid` + korrektem rkey;
  ineligible → `rejected/not_eligible`; kein Community-Konto → `rejected`; **Idempotenz** (existierender Record →
  `done`, kein zweiter Write).
- `_accept_response`: Happy-Path (community-DID aus `app_arguments`, top-level `originUri/originCid`,
  rkey = `compose_review_rkey`); unbekanntes Argument → `rejected/argument_not_found`.

`services/appview/tests/test_user_repo_flag.py` — der appview-Dispatch:
- Flag-Helfer lesen ihre Env-Var (Default aus).
- `argument.create` mit Flag **on** → schreibt ins **User-Repo** (`pds_create_record`); Flag **off** →
  **Community** (`create_community_record`). (Deps gemockt, Rate-Limiter im Test deaktiviert.)

## Schicht 2 — SQL-Contract (indexer, node:test)

`services/indexer/test/db.test.js` — die DB-Helfer (`src/db.js`), die `clientOrPool` als Param nehmen:
- `stageForAcceptance` → `INSERT INTO app_acceptance_queue … ON CONFLICT (user_uri) DO NOTHING` + `NOTIFY`.
- `upsertArgumentDb` projiziert `origin_uri/origin_cid` (gesetzt für Community-Record, **null** für Legacy).
- `upsertPeerreviewResponseDb` projiziert `origin_uri/origin_cid`.

## Ausführen

```bash
# appview (16 Tests inkl. Bestand)
cd services/appview && ./venv/bin/python -m pytest tests/ -q

# nur die neuen
cd services/appview && ./venv/bin/python -m pytest tests/test_acceptance.py tests/test_user_repo_flag.py -q

# indexer
cd services/indexer && npm test
```

## Schicht 3 — E2E auf dem Dev-Cluster (manuell)

Was Schicht 1/2 **nicht** abdecken kann (echte Tx/Locks/NOTIFY/Firehose/PDS). Voraussetzung:
`app_acceptance_queue` + `origin_*`-Spalten + `auth.v_eligible_participants` angewandt; Flags
`APPVIEW_ARGS_USER_REPO_ENABLED` + `APPVIEW_RESPONSES_USER_REPO_ENABLED` (appview) **und**
`ACCEPTANCE_PIPELINE_ENABLED` (indexer + writer) gesetzt; Writer-Pod läuft.

Checkliste:
1. **Argument anlegen** → `goat record get` zeigt es im **User-Repo** (user-signiert); kurz darauf existiert
   der **Community-Record** im Community-Repo mit `source.originUri/originCid`; `app_arguments`-Zeile mit
   `origin_uri/origin_cid`; `app_acceptance_queue`-Zeile `done`.
2. **PR-Response** analog → Community-Response im Community-Repo (rkey wie Legacy), `app_peerreview_responses`
   mit `origin_*`; Quorum-Logik unverändert.
3. **Gate (Frontend)**: über Quota → appview lehnt **inline** ab (4xx), kein User-Repo-Write.
4. **Gate (Bypass)**: direkter PDS-Write einer nicht-eligible DID → Queue-Zeile `rejected`, kein
   Community-Record.
5. **Idempotenz/Crash**: Writer mitten im Lauf killen → Neustart erzeugt **keinen** Doppel-Record
   (deterministischer rkey + Existenz-Check); fehlgeschlagene Zeile bleibt `pending` (Retry).
6. **appview crosspost-frei**: neues Argument → Crosspost erscheint, aber **nur** der writer-Pod loggt ihn.

## Bewusste Lücken (später)

Eine echte **Integrationsschicht gegen Postgres** (Testcontainers/Docker-Postgres) würde Schicht-3-Punkte
1–5 automatisieren (Tx/SKIP LOCKED/NOTIFY real). Bisher kein Test-DB-Setup im Repo → als Folgeaufgabe, falls
die Pipeline über Dev hinaus geht (zusammen mit der Härtung in `doc/TODO.md`).
