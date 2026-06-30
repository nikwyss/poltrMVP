# LM-assisted Peer Review

Riesenpaket. Wird in Phasen geliefert. Dieses Dokument beschreibt **Phase 1: Embeddings** als gemeinsame Grundlage für **Duplikatscheck** (Peer-Review/Composer) **und semantische Suche**. Spätere Phasen (LLM-Review-Vorschläge, Qualitäts-Scoring, Reviewer-Matching) bauen auf derselben Embedding-Infrastruktur auf.

> **Konsument:** Dies ist die Implementierung des TODO-Items „AI Redundanz checks (peerreview und composer)" ([doc/TODO.md](TODO.md)). Der bestehende Peer-Review ([doc/PEER_REVIEW.md](PEER_REVIEW.md)) ist heute rein vote-basiert und kennt noch keine Embeddings — die Anbindung (Phase 1.6 unten) ist neu.

## Ziel Phase 1

Pro embeddbarem Inhalt einen **Embedding-Vektor** speichern, der zwei Zwecke bedient:

1. **Duplikatscheck:** Vor dem Peer-Review / beim Composer erkennen, ob inhaltlich (nahezu) dasselbe Argument für dieselbe Vorlage schon existiert (Cosine-Ähnlichkeit innerhalb der Vorlage).
2. **Semantische Suche:** Bedeutungssuche über Argumente, bei der die Nutzer-Query in *ihrer* Sprache (de/en) gleichsprachig gegen den Korpus matcht — **ohne** die Query zur Laufzeit zu übersetzen.

Generisch ausgelegt (Option A): neben Argumenten auch **Taxonomie-Topics** (und später Kommentare/Vorlagen) in *einer* Tabelle.

Entscheidungen (mit Nutzer abgestimmt):

| Frage | Entscheidung |
|-------|--------------|
| Embedding-Provider | **Infomaniak AI** (OpenAI-kompatible API, CH/EU-Datenresidenz) |
| Modell | **`Qwen/Qwen3-Embedding-8B`** (default 4096 Dim), via `dimensions`-Param auf **1024** reduziert. Fallback: bge-multilingual-gemma2 |
| Compute-Ort | **Calculator-Service** (Python) |
| Vektor-Storage & Suche | **pgvector** in der bestehenden Postgres |
| Tabellen-Design | **generisch** (`app_embeddings`, `subject_type`/`subject_ref`) — Args + Topics + später mehr |

---

## Mehrsprachigkeits-Strategie (der Kern)

POLTR übersetzt ohnehin jeden Inhalt in alle konfigurierten Sprachen (`translations`-jsonb, `translation_status`). Die Embeddings **spiegeln dieses Modell 1:1**:

- **Sprachsatz = `POLTR_LANGUAGES`**, nicht Code. Aktuell `de-CH,en-GB` → Start mit **Deutsch + Englisch**. Eine Sprache hinzufügen ist ein Config-Edit (wie bei Translations), kein Redeploy. Calculator spiegelt das `SUPPORTED_LANGUAGES`-Modul von appview/indexer (kanonische Codes `de-CH`/`en-GB`, `normalize_lang`).
- **Ein Vektor pro `(subject, SUPPORTED_LANGUAGE)`.** Heute also **2 Vektoren/Inhalt** (de-CH + en-GB). Der Text je Sprache kommt aus `langs` (Original) bzw. `translations[*]` — exakt wie der Translator ihn liest.
- **Gleichsprachig in jeder Sprache** → beste Dedup- *und* Suchqualität für de UND en sofort, kein cross-linguales Matching nötig.
- **Modell:** trotzdem ein **multilinguales** Modell — als Fallback für cross-linguale Treffer und nicht-konfigurierte Query-Sprachen (z.B. fr-Query vor fr-Rollout).
- **Skalierung:** `fr-CH`/`it-CH`/`rm` zu `POLTR_LANGUAGES` → Translator füllt Text → Backfill embeddet ihn automatisch (gleiche `_missing_languages`-Logik). Selbstskalierend, kein Migrationsschritt.

### Modellwahl & Dimension

`doc/infomaniak.md` dokumentiert die Embeddings-API bereits und empfiehlt **`Qwen/Qwen3-Embedding-8B`** (4096 Dim, #1 MTEB-multilingual). Der **`dimensions`-Parameter wird unterstützt** (modellabhängige Reduktion) → wir setzen `dimensions=1024` serverseitig → schlanker pgvector-Index, schnellere Suche, weniger Storage. `vector(1024)` im Schema. Fallback nur falls ein Modell `dimensions` ignoriert: vollen Vektor präfix-kürzen + L2-renormalisieren (MRL ist prefix-truncatable).

**Warum genau 1024?** Die Dimension hängt *nicht* von der Anzahl Objekte ab (N bestimmt nur Index-Wahl + Gesamt-Storage), sondern ist ein Qualitäts-Regler des Modells. Bei unserer Größe sind Speicher (1024 Dim ≈ 4 KB/Vektor → wenige MB gesamt) und Query-Zeit vernachlässigbar; entscheidend sind nur zwei Schranken: **untere** = Dedup-Präzision (feine Near-Duplicate-Unterscheidung leidet unter ~1024) und **obere** = pgvector indexiert HNSW/IVFFlat nur **bis 2000 Dim** auf dem `vector`-Typ (4096 wäre gar nicht ANN-indexierbar, nur Seq-Scan/`halfvec`). 1024 trifft beide sauber. Die Dimension steckt fix in `vector(N)` → spätere Änderung = Migration + Re-Embed.

---

## Architektur-Entscheidung: eigene, generische Embeddings-Tabelle

Der Calculator ist laut Architektur **reines Compute** und schreibt heute *nie* direkt in Postgres (Taxonomie geht via CMS-Snapshot → PDS → Indexer). Embeddings sind jedoch ein rein **internes, abgeleitetes Artefakt** — kein ATProto-Record, nicht föderiert. Sie über PDS zu routen wäre Overkill.

Lösung: eine **neue Tabelle `app_embeddings`**, die der Calculator besitzt (RW), während die kanonischen Quellen (`app_arguments`, `app_taxonomy_node`) für ihn nur `SELECT` bleiben. Der Indexer fasst die Tabelle nicht an. Dies ist **der erste DB-Write des Calculators** (heute strikt read-only) — eng auf die eigene abgeleitete Tabelle begrenzt.

> **Warum direkt in die DB (anders als Argument-Übersetzungen)?** Maßgeblich ist die Source of Truth. Argument-/Kommentar-Übersetzungen sind Teil des **föderierten PDS-Records**; die DB-Zeile ist nur eine Projektion, die der Indexer bei jedem Firehose-Event neu aufbaut → der Translator schreibt sie via `putRecord` in die PDS (sonst überschreibt der Reindex sie). Embeddings sind **kein PDS-Record** (regenerierbar) → die **DB ist ihre Source of Truth** → Direkt-Write. Präzedenzfall: *Taxonomie*-Übersetzungen schreibt der Translator schon heute direkt in die DB.

```
  SELECT title/body/translations
  (app_arguments)                    INSERT/UPDATE
  SELECT name/introduction/transl.   ───────────►  app_embeddings  ──► AppView: Dedup / Suche
  (app_taxonomy_node)        Calculator (Infomaniak,                    (Cosine, SELECT)
                              httpx + retry)
```

---

## WO — Komponenten

| Komponente | Datei(en) | Änderung |
|------------|-----------|----------|
| Postgres-Image | `infra/kube/postgres.yaml` + `infra/docker/postgres-pgvector/Dockerfile` | custom `postgres:15-alpine` + pgvector (NICHT Debian — siehe „WIE 1.") |
| Schema (fresh) | `infra/scripts/postgres/db-setup.sql` | `CREATE EXTENSION vector`; Tabelle `app_embeddings`; Grants `calculator` (RW) + `appview` (SELECT) |
| Migration (live) | `services/appview/migrations/012_create_app_embeddings.sql` (neu) | dieselben Statements, idempotent — siehe „Migration" unten |
| Embedding-Client | `services/calculator/src/embedding/infomaniak_client.py` (neu) | **httpx** (kein openai-SDK), Retry/Backoff wie Translator, Chunking ≤64, Sort-by-`index` |
| Backfill | `services/calculator/src/embedding/backfill.py` (neu) | Args + Taxonomie-Nodes je Sprache, Stale-Check via `content_hash` |
| Similarity | `services/calculator/src/embedding/similarity.py` (neu) | Cosine: Dedup (innerhalb `scope_rkey`) + freie Query-Suche |
| Router | `services/calculator/src/embedding/router.py` (neu) + `src/main.py` | `APIRouter` wie `topdown.router`; `app.include_router(...)` |
| Config | `services/calculator/src/config.py` | `CALCULATOR_EMBEDDING_*` (Namen schon in `.env.dist` vorgesehen) |
| Deps | `services/calculator/requirements.txt` | `pgvector` (Python) ergänzen (asyncpg-Codec); `httpx` ist vorhanden |
| Secrets | `infra/kube/secrets.yaml.dist` (`calculator-secrets`) | `CALCULATOR_EMBEDDING_API_KEY`, `_PRODUCT_ID`, `_MODEL`, `_DIMENSIONS` |
| Cronjob | `infra/kube/cronjobs.yaml` | `embeddings-backfill` (Hausstil-Wrapper, curl, clusterintern) |
| Ingress | `infra/kube/ingress.yaml` | Calculator-`path` `/` → `/api/topdown` ([CALCULATOR_EXPOSURE.md](CALCULATOR_EXPOSURE.md)) |
| Changelog | `CHANGELOG.md` | Eintrag (Schema-Änderung wird hier dokumentiert) |

> **Vorlage existiert bereits:** Vor dem topdown-Umbau hatte der Calculator schon einen Infomaniak-Embedding-Client mit Chunking+Retry. Die gelöschten Dateien lassen sich als Referenz holen:
> `git show fd466db^:services/calculator/src/tags/embedding.py` und `…/src/llm/infomaniak_chat.py`. Mechanik (httpx, Chunking, Sort-by-index) übernehmen — **nicht** die alte Open-Coding-Semantik.

---

## WIE — Details

### 1. pgvector aktivieren — via custom **alpine**-Image (nicht Debian)
Eigenes Image `postgres:15-alpine` + pgvector ([infra/docker/postgres-pgvector/Dockerfile](../infra/docker/postgres-pgvector/Dockerfile)) bauen/pushen, dann in `postgres.yaml` als Image setzen (`strategy: Recreate` → kurzer Neustart, kein Föderations-Risiko, Postgres ≠ PDS). Danach `CREATE EXTENSION IF NOT EXISTS vector;`.

> **Lesson learned (2026-06-29):** Das offizielle **`pgvector/pgvector:pg15` (Debian) funktioniert NICHT** als Swap auf dem bestehenden Volume. Die DB wurde von `postgres:15-alpine` angelegt (musl, postgres-uid 70, Cinder/ext4); das Debian-Image (glibc, uid 999) läuft selbst als root in CrashLoop (`mkdir … Permission denied`) und brächte zusätzlich eine **Collation-Migration** (`en_US.utf8` musl→glibc → `REINDEX DATABASE` *aller* DBs). Beides entfällt mit der **gleichen alpine-Basis**: gleiche libc + gleiche uid → echtes Drop-in, **kein REINDEX**, nur die `vector`-Extension kommt dazu. Trotzdem: **Backup vor dem Swap** (Recreate auf der geteilten Prod-DB), als eigenständigen Wartungsschritt.

### 2. Schema (generisch, Option A)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS app_embeddings (
    subject_type  text NOT NULL,              -- 'argument' | 'taxonomy_node' (später 'comment','ballot')
    subject_ref   text NOT NULL,              -- argument.uri  bzw.  taxonomy_node.id::text
    lang          text NOT NULL,              -- kanonischer Code je POLTR_LANGUAGES: 'de-CH','en-GB',…
    scope_rkey    text,                       -- ballot_rkey (Args & Nodes haben das) für Vorlagen-Filter
    model         text NOT NULL,              -- z.B. 'Qwen/Qwen3-Embedding-8B'
    embedding     vector(1024) NOT NULL,      -- dimensions=1024 serverseitig
    content_hash  text NOT NULL,              -- sha256 des embeddeten Textes je Sprache → Re-Embed bei Änderung
    generated_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (subject_type, subject_ref, lang)
);
CREATE INDEX IF NOT EXISTS app_embeddings_scope_idx ON app_embeddings (subject_type, scope_rkey, lang);
-- HNSW optional: pro Vorlage nur zig–hunderte Einträge → Seq-Scan + Cosine reicht zunächst.
-- Bei wachsendem globalem Korpus: CREATE INDEX ... USING hnsw (embedding vector_cosine_ops);
```

**Kein FK** (polymorphes `subject_ref` lässt keinen einzelnen FK zu, also kein `ON DELETE CASCADE`). Akzeptabel, weil Embeddings ein **regenerierbarer Cache** sind: eine verwaiste Zeile ist harmlos (Queries joinen auf die Quelle und filtern `deleted`), Aufräumen lazy per Backfill/Cron.

Grants (GRANT ist in Postgres idempotent — gefahrlos in db-setup.sql *und* Migration):
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON app_embeddings TO calculator;
GRANT SELECT ON app_embeddings TO appview;
```

### 3. Embedding-Berechnung (Calculator)

- **Was:** je SUPPORTED_LANGUAGE den sprachspezifischen Text. Argument = `title + "\n\n" + body`; Taxonomie-Node = `name + "\n\n" + introduction`. Text aus `langs`/Original bzw. `translations[*]` — wie der Translator.
- **Modell/Dim:** `Qwen/Qwen3-Embedding-8B`, `dimensions=1024`.
- **Client (`infomaniak_client.py`) — Hausstil:** **httpx** (kein openai-SDK), exakt das Retry-Muster des Translators ([translator.py:128-129, 268-323](../services/community-writer/src/translation/translator.py#L268)): `_TRANSIENT_STATUS={429,500,502,503,504}`, `_BACKOFFS=(1,2,4)`, 4xx fail-fast. Request-Body: `{"model", "input":[…], "encoding_format":"float", "dimensions":1024}`.
- **Provider-Quirks (aus `doc/infomaniak.md`):**
  - `input`-Liste **< 100** Einträge (sonst HTTP 400) → in Chunks von ≤64 senden.
  - Response-`data` ist **nicht garantiert sortiert** → nach `index` sortieren, bevor man Vektoren den Texten zuordnet.
  - Endpoint: `POST {BASE}/2/ai/{PRODUCT_ID}/openai/v1/embeddings`, `Authorization: Bearer …`.
- **Re-Embed-Logik:** `content_hash` über den embeddeten Text je Sprache. Nur (subject, lang) berechnen, wo keine Zeile existiert ODER `content_hash` abweicht.
- **pgvector-Bind:** Vektor via `pgvector.asyncpg`-Codec (registrieren beim Pool-Setup) oder als `'[v1,v2,…]'`-String an die `vector`-Spalte.

### 4. Duplikat-Query (Dedup)

```sql
SELECT a.uri, a.title, 1 - (e.embedding <=> $query_vec) AS similarity
FROM app_embeddings e
JOIN app_arguments a ON a.uri = e.subject_ref
WHERE e.subject_type = 'argument'
  AND e.scope_rkey = $ballot_rkey
  AND e.lang = $lang          -- z.B. 'de-CH'; Sprache der Vorlage/des Autors
  AND a.deleted = false
  AND a.uri <> $self_uri
ORDER BY e.embedding <=> $query_vec
LIMIT 5;
```
Schwellwert (`CALCULATOR_DEDUP_SIM_THRESHOLD`, Start 0.85) beim Tuning festlegen. Topic-Ähnlichkeit analog mit `subject_type='taxonomy_node'`.

### 5. Semantische Suche
Query-Text → Embedding (ein Live-Call) → Cosine gegen `subject_type='argument'`, `lang = normalize_lang(<Query-Sprache>)`. Fallback `DEFAULT_LANGUAGE` + cross-lingual via multilingualem Modell, falls Query-Sprache nicht konfiguriert. Filter optional auf `scope_rkey`.

> **Latenz (kritisch):** Suche läuft im Nutzerpfad AppView → Calculator → Infomaniak (externer Call). Anders als die Übersetzung (Hintergrund) ist das latenzsensitiv. Mitigation: kurzes Timeout + Debounce; ggf. Query-Embeddings cachen. Im Plan als Punkt offen.

### 6. Anbindung an Peer-Review / Composer
Die Composer-Prüfstufe (`app.ch.poltr.argument.precheck`, Bündel) hat zwei Checks:
- **Check #1 — Duplikat-Check: IMPLEMENTIERT** (Calculator `/api/embeddings/similar`, zweistufiger Composer, same-stance + same-ballot + same-lang, Schwelle 0.66, Top-1, weicher Hinweis). Doku: [DUPLICATE_CHECK.md](DUPLICATE_CHECK.md).
- **Check #2 — Stance-/Kohärenz-Check (LLM): IMPLEMENTIERT** (Calculator `/api/review/stance`, Infomaniak Gemma JSON-Prompt, konservativ; im selben Bündel als `stance`; Ein-Klick-Positionswechsel bei Mismatch). Details: CHANGELOG 2026-06-29.

Offen: Reviewer-Kontext im Peer-Review selbst ([PEER_REVIEW.md](PEER_REVIEW.md)); weitere Checks (Verständlichkeit/Formulierungstipps, Thematik) als zusätzliche Bündel-Felder.

---

## WANN — Trigger (Cronjob, Hausstil)

```yaml
# infra/kube/cronjobs.yaml  — Wrapper analog zu peerreview-finalize
apiVersion: batch/v1
kind: CronJob
metadata: { name: embeddings-backfill, namespace: poltr }
spec:
  schedule: "*/2 * * * *"
  suspend: false
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 1
      activeDeadlineSeconds: 50
      ttlSecondsAfterFinished: 3600
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: embeddings-backfill-trigger
              image: curlimages/curl:8.2.1
              command: ["sh","-c"]
              args:
                - |
                  curl -X POST --fail --show-error --connect-timeout 5 --max-time 30 --retry 1 --retry-delay 5 \
                    "http://calculator.poltr.svc.cluster.local/api/embeddings/backfill" || exit 1
```
Clusterintern (Service-Port 80 → Container 3000), **nicht** über den öffentlichen Ingress. Idempotent, im Leerlauf praktisch gratis.

> **Sicherheit:** Der Calculator hängt heute komplett am öffentlichen Ingress; `/api/embeddings/*` (inkl. kosten-auslösendem `/backfill`) muss intern bleiben. Kurzfix: Ingress-`path` auf `/api/topdown` verengen. Details: [CALCULATOR_EXPOSURE.md](CALCULATOR_EXPOSURE.md).

---

## Migration (live DB)

Kein Migrations-Runner im Projekt; Konvention = nummerierte, **idempotente** SQL-Dateien in `services/appview/migrations/` (zuletzt `011_*`, nächste **`012_create_app_embeddings.sql`**), die per `psql` beim Deploy eingespielt werden, **plus** dieselben Statements in `db-setup.sql` (fresh installs), **plus** `CHANGELOG.md`-Eintrag.

`012_create_app_embeddings.sql` enthält atomar: `CREATE EXTENSION IF NOT EXISTS vector` · `CREATE TABLE IF NOT EXISTS app_embeddings` · `CREATE INDEX IF NOT EXISTS …` · die zwei `GRANT`s. (`CREATE EXTENSION` setzt voraus, dass das Postgres-Image bereits `pgvector/pgvector:pg15` ist — Reihenfolge unten.)

---

## Umsetzungs-Reihenfolge

1. **Infra/Provider:** Infomaniak Product-ID + API-Key in `calculator-secrets`; Modell/Dim verifizieren.
2. **Postgres (eigener Wartungsschritt):** custom alpine-pgvector-Image bauen+pushen → Backup → Image-Swap (kein REINDEX nötig, gleiche libc) → `CREATE EXTENSION vector` → verifizieren.
3. **Schema:** Migration `012_*` + `db-setup.sql` + `CHANGELOG.md`.
4. **Calculator:** `infomaniak_client.py` (httpx, Chunking, Sort-by-index) + `backfill.py` (Args + Topics) + `similarity.py` + `router.py` + Config + `requirements.txt` (`pgvector`).
5. **Cronjob + Ingress-Verengung** deployen; Erst-Backfill laufen lassen.
6. **Konsumenten:** Dedup in Composer/Peer-Review (Schritt 6 oben), semantische Suche.

## Offene Punkte / spätere Phasen
- **Operatives:** pgvector-Image-Swap auf der geteilten Prod-DB als separater, verifizierter Wartungsschritt (Backup + REINDEX).
- **Such-Latenz:** externer Embedding-Call im Nutzerpfad — Timeout/Debounce/Cache.
- **Konsumenten-Integration:** Composer-Dedup erledigt ([DUPLICATE_CHECK.md](DUPLICATE_CHECK.md)); offen: Reviewer-Kontext im Peer-Review, optional Reranker/LLM als Stage-2.
- **Translations-Kopplung:** en-Embedding entsteht erst nach der en-Übersetzung; der Translator-Loop hat einen Circuit-Breaker (HALT bei Fehler) → bei gestoppter Übersetzung bleibt die en-Suche/Dedup still degradiert. Monitoring sinnvoll.
- **Taxonomie-Backfill** ist ein zweiter Extraktor (anderer Text: name+introduction), gleiche Tabelle/Mechanik.
- **Verwaiste Embeddings** (kein CASCADE): Lazy-Cleanup im Backfill oder kleiner Cron.
- **Weitere Sprachen** (fr/it/rm): allein per `POLTR_LANGUAGES`-Edit.
- **Phase 2+:** LLM-Review-Vorschläge, Qualitäts-Scoring, Reviewer-Matching auf denselben Embeddings.
