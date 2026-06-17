# Dev-Rollout-Runbook: ATProto-native Deliberation (Phasen 1–6)

Geordnete Schritte, um die flag-gated Pipeline auf dem **Dev-Cluster** scharf zu schalten und end-to-end zu
verifizieren. Konzept: `doc/ATPROTO_NATIVE_DELIBERATION.md`. Tests/Checkliste: `doc/TESTING_ATPROTO_NATIVE.md`.

> **Kill-Switch / Rollback:** Alle Flags auf `"false"` → System ist wieder auf dem **Legacy-Pfad** (appview
> schreibt direkt ins Governance-Repo). Kein DB-Rückbau nötig (die neuen Tabellen/Spalten sind additiv).

## 0. Voraussetzung — neue Images

Der Cluster fährt Images; der neue Code (appview **und** indexer) muss in den Images sein. Also zuerst
appview- + indexer-Image bauen/pushen (wie üblich via CI/Registry), bevor die Pods neu ausrollen.

## 1. DB-Migrationen (als `allforone` gegen die `appview`-DB)

```bash
PGURL="postgresql://allforone:<pw>@<host>:5432/appview"
psql "$PGURL" -f infra/scripts/postgres/add-acceptance-pipeline.sql   # Tabelle + origin-Spalten + Grants
psql "$PGURL" -f infra/scripts/postgres/add-pod-roles.sql             # appview/writer-Rollen + Eligibility-View
```
Beide idempotent. Negativ-Checks (sollten *scheitern* = korrekt):
```bash
psql "postgresql://appview:<pw>@<host>:5432/appview" -c "SELECT 1 FROM pg_authid LIMIT 1;"   # permission denied
psql "postgresql://writer:<pw>@<host>:5432/appview"  -c "SELECT 1 FROM auth.auth_creds LIMIT 1;" # permission denied
psql "postgresql://writer:<pw>@<host>:5432/appview"  -c "SELECT pw_ciphertext FROM auth.governance_accounts LIMIT 1;" # OK
```

## 2. Secrets (echte `secrets.yaml`, nach Vorlage `secrets.yaml.dist`)

- **appview-secrets**: `APPVIEW_POSTGRES_URL` → `appview@…`; beide Master-Keys
  (`APPVIEW_USER_CREDS_MASTER_KEY_B64` + `APPVIEW_GOV_CREDS_MASTER_KEY_B64`, **gleicher Wert** wie der alte);
  alle neuen Flags zunächst **`"false"`**.
- **writer-secrets** (neu): `writer@`-DB-URL, Crosspost `"true"`, `ACCEPTANCE_PIPELINE_ENABLED:"false"`,
  Translate-Block.
- **indexer-secrets**: `ACCEPTANCE_PIPELINE_ENABLED:"false"`.
- Prüfen: `front-secrets` ist ein eigenes Dokument (kein `#---`).

```bash
kubectl apply -f infra/kube/secrets.yaml
```

## 3. Deploy (Flags noch AUS)

```bash
kubectl apply -f infra/kube/community-writer.yaml
kubectl rollout restart deploy/appview deploy/indexer deploy/cms -n poltr
kubectl get pods -n poltr            # writer-Pod läuft? appview/indexer/cms neu?
```

## 4. Smoke-Test (Flags AUS → unverändertes Verhalten)

Hier ist die Pipeline **dormant**; es testet nur, dass die *Verlagerung* (Phasen 1+5) + die neuen DB-User
nichts gebrochen haben.
- **Crosspost**: neues Argument → erscheint auf Bluesky; **writer**-Pod loggt „Argument cross-posted",
  **appview**-Pod loggt **nichts** dazu.
- **Translator**: Übersetzungen erscheinen weiter; nur **writer**-Pod loggt sie.
- **Legacy-Create**: Argument/Response landen wie bisher im Governance-Repo (appview schreibt direkt).
- Logs: `kubectl logs -n poltr deploy/community-writer` / `deploy/appview` / `deploy/indexer`.

## 5. Pipeline scharf schalten — Consumer ZUERST

Reihenfolge wichtig (nie Producer ohne Consumer, sonst „verschwinden" Argumente):
1. **Consumer**: `ACCEPTANCE_PIPELINE_ENABLED:"true"` in **indexer-secrets** + **writer-secrets** → apply →
   `kubectl rollout restart deploy/indexer deploy/community-writer -n poltr`. (Queue leer → No-op.)
2. **Producer**: `APPVIEW_ARGS_USER_REPO_ENABLED` / `APPVIEW_RESPONSES_USER_REPO_ENABLED` /
   `APPVIEW_REVIEW_REQUESTS_USER_REPO_ENABLED` = `"true"` in **appview-secrets** → apply →
   `kubectl rollout restart deploy/appview -n poltr`.

## 6. End-to-End verifizieren

Hilfsabfragen (gegen `appview`-DB):
```sql
SELECT uri, did, source_type, origin_uri, origin_cid, created_at
  FROM app_arguments ORDER BY created_at DESC LIMIT 5;
SELECT user_uri, kind, status, reason, updated_at
  FROM app_acceptance_queue ORDER BY created_at DESC LIMIT 10;
SELECT argument_uri, reviewer_did, origin_uri FROM app_peerreview_responses ORDER BY created_at DESC LIMIT 5;
```

1. **Argument** anlegen →
   - `app_acceptance_queue`: eine `kind=argument`-Zeile, kurz darauf `status=done`.
   - `goat record get at://<USER-did>/app.ch.poltr.ballot.argument/<rkey>` → liegt im **User-Repo** (user-signiert).
   - `goat record list <ballot-governance-handle>` → der **Community-Record** mit `source.originUri/originCid`.
   - `app_arguments`-Zeile mit gesetztem `origin_uri/origin_cid`; AppView zeigt das Argument (Community-Version).
   - Crosspost erscheint.
2. **PR-Response** analog (`kind=response`, `origin_*` in `app_peerreview_responses`; Quorum-Logik unverändert).
3. **Review-Request**: als eingeloggter User aktiv sein → `goat record get … peerreview.request` im User-Repo
   (max. 1×/Tag); `app_acceptance_queue` `kind=request` → `done`; Invitations erscheinen im Governance-Repo
   (`app_peerreview_invitations`).
4. **Gate (negativ)**: über Quota via Frontend → appview lehnt **inline** ab (4xx), nichts im User-Repo.
5. **appview ist loop-frei**: weder Crosspost- noch Translation-Logs in der appview-API.

## 7. Wenn etwas hakt

- `app_acceptance_queue`-Zeile bleibt `pending` → Writer-Logs prüfen (PDS/Gov-Session? Grant fehlt? Master-Key?).
- Zeile `rejected:not_eligible` → DID nicht in `auth.v_eligible_participants` (registriert?).
- Argument „verschwindet" → Producer-Flag an, aber Consumer (`ACCEPTANCE_PIPELINE_ENABLED`) aus.
- Writer-Pod crasht beim Start → `writer-secrets`/Inheritance (Master-Key, POLTR_LANGUAGES) prüfen.

→ Fehlermeldung hierher; gezielt nachziehen (wie bei der fehlenden Eligibility-View).
