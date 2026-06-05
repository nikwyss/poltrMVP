# POLTR Calculator

Statistik- und LLM-Service für POLTR. Python 3.11 + FastAPI, REST.
Endpoint: **calculator.poltr.info** (intern: `calculator.poltr.svc.cluster.local`).

Der Service ist bewusst zustandslos und ATProto-frei: er rechnet/klassifiziert
auf Eingabedaten und gibt das Ergebnis zurück. Persistenz und Anbindung an
PDS/DB liegen bei den aufrufenden Services (AppView/Indexer).

## LLM

Der Service nutzt `AnthropicLLM` (forced tool-use, Modell aus
`CALCULATOR_LLM_MODEL`). **`ANTHROPIC_API_KEY` ist erforderlich** — fehlt er,
antworten die LLM-Endpoints mit `503 LLM not configured` (statt still wertlose
Ergebnisse zu liefern).

**Aufgabenteilung der Modelle.** Nicht alles läuft auf Claude:

| Schritt | Backend | Modell |
|---------|---------|--------|
| **Open Coding** (mengenintensiv, N Calls/Batch) | Infomaniak AI Tools | `google/gemma-4-31B-it` (`CALCULATOR_OPENCODING_MODEL`) |
| **Axial Coding / classify / split** | Anthropic | `CALCULATOR_LLM_MODEL` (Claude) |
| **Embeddings** (Stage-1-Vorbündelung) | Infomaniak AI Tools | `Qwen/Qwen3-Embedding-8B` |

Open Coding und Embeddings teilen sich die Infomaniak-Creds
(`CALCULATOR_EMBEDDING_PRODUCT_ID` + `CALCULATOR_EMBEDDING_API_KEY`). Sind diese
nicht gesetzt, fällt **Open Coding auf Anthropic** und **Embeddings auf das
lexikalische Backend** zurück. Der Open-Coding-Cache invalidiert automatisch beim
Backend-/Modellwechsel (die `coder_signature` ändert sich).

## Endpoints

### `GET /healthz`
Liveness/Readiness. → `{"status": "ok"}`

### `POST /opencoding` · `GET /opencoding/status`
Cron-getriebener Open-Coding-Worker (Variante B, Stage 1 persistent). `POST
/opencoding` verarbeitet einen Batch (Default 20) noch nicht (oder veraltet)
codierter Argumente aus `app_arguments` und schreibt die Open Codes nach
`app_argument_open_codes`. Reihenfolge: offizielle Argumente zuerst, dann nach
`created_at`. Eigenschaften:

- **Re-Coding** automatisch bei Argument-Edit (`cid`-Änderung) oder Modell-/
  Prompt-Wechsel (`coder_signature`).
- **Fehler:** bis 3 Versuche → dann `failed_permanent` (keine Endlosschleife).
  **Transiente** Fehler (Netz/429/5xx) zählen nicht als Versuch.
- **Overlap-Schutz:** `processing`-Lease (3 min) + CronJob `concurrencyPolicy: Forbid`.
- **Tagescap:** max. 300 erfolgreich codierte Argumente/Tag (`CALCULATOR_OPENCODING_DAILY_CAP`).
- **Sprache:** Codes immer Deutsch (Prompt), Eingabe = `title` + `body` im Original.
- **Ballot-Status-Filter:** nur Argumente von Ballots mit Status `published`/`draft`
  werden codiert; `archived` nicht. Der Status liegt in der **CMS-DB** (separate
  DB) → der Worker liest die codierbaren `rkey`s read-only über
  `CALCULATOR_CMS_POSTGRES_URL` (Fallback `CMS_DATABASE_URL`). Ohne diese URL wird
  nicht nach Status gefiltert. Braucht den Grant aus `migrate-ballot-status.sql`.

`GET /opencoding/status` liefert Counts je Status, Tagesbudget und Anzahl noch
nicht codierter Argumente — **gezählt nur über codierbare Ballots** (Status
published/draft, wie der Worker; `codeable_ballots` im Output). `coded_today`
bleibt global (Tagescap = globales Budget). Beide Endpoints sind aktuell **nur
cluster-intern** gedacht (kein Endpoint-Schutz; folgt später).

### `POST /api/tags/induce-batch`
**Variante B — Axiale Taxonomie über die persistierten Open Codes eines Ballots.**
Open Coding (Schritt 1) macht der Cron-Worker (`/opencoding` → Tabelle
`app_argument_open_codes`). Dieser Endpoint **generiert keine Codes mehr** — er
liest die `status='done'`-Codes des Ballots aus der DB und führt nur noch aus:

1. **Axial Coding** — *alle* Codes werden gemeinsam zu wenigen Achsen gruppiert
   (das LLM sieht den Gesamtbestand auf einmal). Zuordnung über stabile Code-IDs.
2. **Reorganisation** — überladene Achsen werden in 2–3 schärfere aufgeteilt
   (2. Sicherheitsnetz, s.u.).
3. **Zuordnung** — jedes Argument wird *allen* Achsen seiner Codes zugeordnet
   (Mehrfach-Zuordnung möglich).

```bash
curl -s -X POST http://localhost:3005/api/tags/induce-batch \
  -H 'Content-Type: application/json' \
  -d '{"ballot_rkey": "663.1", "options": {"max_themes": 6}}'
```

`ballot_rkey` ist Pflicht; optionales `limit` begrenzt die Argumentzahl. Gibt es
keine codierten Argumente für den Ballot, kommt `422` (erst den Open-Coding-Worker
laufen lassen).

`max_themes` (Default 6) ist ein **weicher Cap**: der Axial-Prompt bittet um
höchstens N inhaltliche Achsen, das LLM hält sich meist, aber nicht garantiert
daran (z.B. 7 statt 6). Der Prompt zielt auf inhaltlich definierte Achsen
(idealerweise benannte Gegensätze), nicht auf bloße Sammelordner — Hintergrund in
[`doc/argument_clustering.md` §8](../../doc/argument_clustering.md).

Antwort enthält `method`, `bundled` (ob tatsächlich vorgebündelt wurde),
`source` (`{mode:"db", ballot_rkey, count}`), `themes` (Axial-Ergebnis),
`code_count`, `assignments` (mehrwertig — ein Argument kann unter mehreren
Achsen erscheinen) und `coverage` (s.u.).

**`coverage` — über wie viel codiert wurde (rein informativ).** Der Endpoint baut
die Achsen über die gerade `status='done'`-Codes; läuft parallel der
Open-Coding-Worker (z.B. ein **Re-Code nach Prompt-Änderung**, der alle Codes
invalidiert), ist nur ein Teil `done` — und die Taxonomie entsteht still über
diesen Teil. `coverage` macht das sichtbar: `arguments_total`, `done`
(= axialer Input, sollte `source.count` entsprechen), `done_current_sig` /
`done_stale_sig` (aktuelle vs. veraltete Open-Coder-Signatur bzw. editierte
Argumente), `empty`, `processing` (Re-Code läuft), `failed`, `uncoded` sowie die
`current_open_coder_signature`. Kein Block/Urteil — wenn `done < arguments_total`
oder `processing > 0`, lohnt es sich, den Worker erst fertig laufen zu lassen.

> ⚠️ Eine Änderung an `SYSTEM_OPEN_CODING` (`src/prompts.py`) ändert die
> `coder_signature` und invalidiert **alle** persistierten Open Codes → der
> Worker codiert das ganze Material neu. Läuft `/induce-batch` während dieser
> Neucodierung, sieht es nur die schon fertigen Argumente. Der `coverage`-Block
> zeigt es an; Axial-/Split-Prompt-Änderungen lösen **kein** Re-Code aus.

**Immer ein Pfad (Stage 0/1/2).** Die axiale Phase läuft immer dreistufig, degeneriert
aber bei wenig Material automatisch: Stage 0 Häufigkeitsfilter (seltene Codes →
sichtbarer `Rand`-Topf; per Guard ausgesetzt, wenn er zu viel filtern würde),
Stage 1 Vorbündelung **echter Nah-Dubletten** (Embeddings über Infomaniak/Qwen3,
Cosinus ≥ `CALCULATOR_PREBUNDLE_EMBED_FLOOR`, Default **0.72**). **Honest-Modus:**
es wird NUR ≥ Floor gemergt — kein Zwang auf `target_bundles`, kein Größen-Cap
(`CALCULATOR_PREBUNDLE_MAX_BUNDLE_SIZE`, Default 0 = aus); grosse Bündel entstehen
nur aus echter Nähe → kein Mega-Bündel/Sammelbecken. Singleton-Codes (kein Partner
≥ Floor): stammt der Code von einem Argument, das schon einen Code in einem echten
Cluster hat, wird er **verworfen** (idiosynkratische Nebenfacette); nur Singletons
gar-nicht-clusternder Argumente gehen in den **Rand-Topf**. So bleiben Bündel
kohärent UND der Rand klein. Transiente Embedding-Fehler
(502/503/Timeout) werden **wiederholt** (`CALCULATOR_EMBEDDING_MAX_ATTEMPTS`,
Default 4, Backoff 1/2/4s); bleibt es erfolglos, bricht der Lauf mit `502` ab
(Alarm, kein stiller Lexical-Fallback)
in max. 3 Runden; `prebundle.rounds`/`final_floor`/`capped` zeigen, wie er erreicht
wurde). **Sind ≤ `target_bundles` Codes da, wird gar nicht vorgebündelt** (jeder
Code = ein Bündel, `bundled:false`, kein Embedding-Call) → Stage 2 sieht alle Codes
direkt. Stage 2 = Achsenbildung auf den Repräsentanten. Nebenprodukt: die Hierarchie
**Achse → Bündel → Code → Argument** (Feld `hierarchy`). Optionen: `min_frequency`,
`target_bundles`; Output meldet `bundled`, `stage0`, `prebundle`, `bundles`,
`margin_codes`, `hierarchy`. Details:
[`doc/argument_clustering.md` §9](../../doc/argument_clustering.md).

**Reorganisation: überladene Achsen splitten (2. Sicherheitsnetz).** Nach der
Achsenbildung neigt das LLM dazu, eine Achse zum *Sammelbecken* zu machen
(mehrere Streitfragen in einen Topf). Größe ist der messbare Indikator: eine
Achse, die deutlich mehr Codes anzieht als die übrigen, vermischt vermutlich
mehrere Fragen. Solche Achsen werden erkannt (Codes pro Achse `>
split_factor ×` Schnitt der **übrigen** Achsen, Default `1.8×`; erst ab
`split_min_reps` Repräsentanten) und in einem **fokussierten zweiten LLM-Lauf**
nur über ihre eigenen Codes in 2–`split_max_sub` scharfe Achsen aufgeteilt — das
engere Blickfeld erzwingt die feinen Unterschiede, die im großen Durchlauf
verwischt wurden. Die alte Achse wird (wenn restlos aufgeteilt)
`status='split'`, taucht nicht in der Persistenz auf; die Sub-Achsen tragen
`derived_from`. Steuerung: `reorganize` (an/aus), `split_factor`,
`split_min_reps`, `split_max_sub`; Output meldet `splits`. Diese Schicht ergänzt
den geschärften Axial-Prompt (verhindert vorab) durch nachträgliche Korrektur —
Details: [`doc/argument_clustering.md` §9.1](../../doc/argument_clustering.md).

> Hintergrund, Designentscheidungen und Alternativen (inkl. der drei Optionen
> für „verlässlich wenige Achsen") sind in [`doc/argument_clustering.md`](../../doc/argument_clustering.md)
> ausführlich dokumentiert.

**Open Coding ist entkoppelt.** Die Codes entstehen im Cron-Worker (`/opencoding`,
Gemma → `app_argument_open_codes`, persistent, mit eigenem Re-Code-/Cache-Modell
über `coder_signature`). Dieser Endpoint liest sie nur noch — die Axial-Phase
läuft jedes Mal neu über den gelesenen Code-Pool und gruppiert die *Codes* (nicht
die Argumente) zu wenigen quer-schneidenden Achsen.

Hinweis: Die Themen-*Struktur* ist reihenfolge-unabhängig, aber die
Label-*Formulierung* variiert durch den LLM-Nichtdeterminismus von Lauf zu Lauf.

Antwort (gekürzt):
```json
{
  "mode": "two-stage",
  "llm": "anthropic",
  "source": {"mode": "db", "ballot_rkey": "663.1", "count": 31},
  "code_count": 86,
  "themes": [{"id": "t001-…", "label": "Technologische Innovation ↔ Verzichtsansatz", "...": "..."}],
  "assignments": [{"argument_id": "at://…/7043", "tag_id": "t001-…", "confidence": 0.9, "...": "..."}],
  "hierarchy": [{"axis": "…", "bundles": [{"representative": "…", "codes": ["…"]}]}]
}
```

Das Ergebnis wird zudem **versioniert in die DB** geschrieben (`app_taxonomy_*`,
siehe „DB-Anbindung"); die Antwort trägt die `taxonomy_run_id`.

## Lokal entwickeln

```bash
cd services/calculator
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.dist .env            # ANTHROPIC_API_KEY optional
uvicorn src.main:app --reload --host 0.0.0.0 --port 3000
# → http://localhost:3000/docs  (OpenAPI / Swagger)
```

## Aufbau

```
src/
  main.py              FastAPI-App, Router-Registrierung
  config.py            Env-Konfiguration
  prompts.py           ZENTRAL: alle LLM-Prompts (Open Coding + Axial)
  core/fastapi.py      App, CORS, Rate-Limit, /healthz, DB-Lifespan
  core/db.py           asyncpg-Pool (AppView-Schema)
  llm/
    base.py            LLMClient-Interface (open_code / axial_group)
    anthropic_client.py AnthropicLLM (Axial + Open-Coding-Fallback)
    infomaniak_chat.py InfomaniakOpenCoder (Open Coding via Gemma)
    factory.py         get_llm() / get_open_coder()
  tags/
    models.py          Tag, Assignment (+ Pole)
    tag_system.py      TagSystem.batch_induce (Axial + Reorg-Split + Zuordnung) + Persistenz-View
    prebundle.py       Stage 0/1 (Häufigkeitsfilter + Vorbündelung)
    embedding.py       Infomaniak-Embeddings (Stage-1-Vorbündelung)
    router.py          POST /api/tags/induce-batch
  opencoding/
    worker.py          Cron-Worker: Batch codieren → app_argument_open_codes
    router.py          POST /opencoding, GET /opencoding/status
```

## Kubernetes

- Manifest: `infra/kube/calculator.yaml`
- Ingress-Regel: `calculator.poltr.info` → Service `calculator:80`
- Secret: `calculator-secrets` (siehe `infra/kube/secrets.yaml.dist`)
- Image: `ghcr.io/nikwyss/poltr-calculator:latest`
- Cronjob: `calculator-opencoding` (alle 5 min → `POST /opencoding`, `infra/kube/cronjobs.yaml`)
- DB: Tabelle `app_argument_open_codes` + Rolle `calculator` (`infra/scripts/postgres/migrate-open-codes.sql`)
- DB (cms): Ballot-Status `archived` + `GRANT SELECT ON ballots TO calculator` (`infra/scripts/postgres/migrate-ballot-status.sql`, gegen die **cms**-DB)
- DB: Taxonomie-Persistenz `app_taxonomy_run/axis/bundle/membership` (`infra/scripts/postgres/migrate-taxonomy.sql`) — jeder `/induce-batch`-Lauf schreibt Achsen, Bündel und Zugehörigkeiten (versioniert, `taxonomy_run_id` in der Antwort). Achse/Bündel tragen denormalisierte Qualitätszähler (`bundle_count`/`argument_count`/`code_count` bzw. `code_count`); Membership trägt Haltung + Confidence (`stance` pro/contra, `confidence`), Bündel `cohesion`+`avg_confidence`, Achse `pro_share`; der Run speichert die Stage-0/Prebundle-Kennzahlen (`stage0_*`, `prebundle_*`)

## DB-Anbindung (AppView-Postgres)

Der Service liest `app_arguments` und persistiert Open Codes in
`app_argument_open_codes` (siehe `src/core/db.py`, `asyncpg`, nach AppView-
Vorbild). Verbindung über `CALCULATOR_POSTGRES_URL` (Fallback
`APPVIEW_POSTGRES_URL`). DB-Rolle `calculator`: `SELECT` auf `app_arguments`,
RW auf `app_argument_open_codes` (siehe `infra/scripts/postgres/db-setup.sql`
bzw. `migrate-open-codes.sql`). Der DB-Pool ist optional — fehlt die URL,
startet der Service trotzdem, nur die `/opencoding`-Endpoints brauchen ihn.

**Noch offen / Roadmap:**
- Endpoint-Schutz für `/opencoding` und `/api/tags/induce-batch` (aktuell nur cluster-intern).
