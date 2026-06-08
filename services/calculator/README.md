# POLTR Calculator

Statistik- und LLM-Service für POLTR. Python 3.11 + FastAPI, REST.
Endpoint: **calculator.poltr.info** (intern: `calculator.poltr.svc.cluster.local`).

Der Service baut und pflegt die **top-down Themen-Hierarchie** eines Ballots:
einen Themen-BAUM, aus den offiziellen Argumenten geseedet, in den die Argumente
top-down einsortiert werden (Einheit = Argument; genau EIN Thema pro Argument).
Persistiert wird EIN stabiler Baum pro Ballot in `app_topic_node` /
`app_topic_membership` (inkrementell mutierbar, nicht pro Lauf versioniert).

## LLM

Der Service nutzt `AnthropicLLM` (forced tool-use, Modell aus
`CALCULATOR_LLM_MODEL`, Default `claude-sonnet-4-6`). **`ANTHROPIC_API_KEY` ist
erforderlich** — fehlt er, antworten die LLM-Endpoints mit
`503 LLM not configured` (statt still wertlose Ergebnisse zu liefern).

## Endpoints (`/api/topdown/*`)

Alle Mutationen sind **vorschlagsbasiert**: die LLM-Endpoints rechnen gegen den
übergebenen State-Baum und schreiben nichts; persistiert wird ausschliesslich
über `POST /api/topdown/save`. Editiert wird im CMS-Panel (`TaxonomyPanel.tsx`).

| Endpoint | Zweck |
|----------|-------|
| `GET  /healthz` | Liveness/Readiness → `{"status":"ok"}` |
| `POST /api/topdown/induce` | Baum NEU bauen (LLM): Wurzelthemen aus den offiziellen Argumenten ableiten + einsortieren. Mit `persist:true` direkt schreiben (ersetzt den Baum). |
| `POST /api/topdown/classify` | Neue, noch nicht verortete Argumente inkrementell in den BESTEHENDEN State-Baum einsortieren (pro Ebene 1 LLM-Call). |
| `POST /api/topdown/grow` | Überladene Knoten in Unterthemen aufteilen (vertikal) bzw. am Wurzelknoten neue Hauptäste bilden (horizontal). |
| `POST /api/topdown/branch_unplaced` | Aus „ganz fehlenden" (nicht zugeordneten) Argumenten neue Hauptäste vorschlagen. |
| `POST /api/topdown/save` | Den State-Baum persistieren (ersetzt Knoten + Zuordnungen komplett). |
| `GET  /api/topdown/tree` | Den persistierten Baum eines Ballots lesen. |
| `GET  /api/topdown/unplaced` | Argumente ohne Hauptthema in einem echten Ast (für den „Nicht zugeordnet"-Bereich im CMS). |
| `GET  /api/topdown/status` | Baum-Stand: ob ein Baum existiert + Anzahl nicht eingehängter Argumente. |

Je Thema werden vom LLM `name`, `description` (interner Klassifikations-Kontext),
`introduction` (voter-facing Einleitung) und `importance` (1–5) vorgeschlagen.
Die amtliche Vorlagen-Beschreibung wird (falls `CALCULATOR_CMS_POSTGRES_URL`
gesetzt) read-only als Zusatzkontext für die Wurzelthemen gelesen.

```bash
curl -s -X POST http://localhost:3000/api/topdown/induce \
  -H 'Content-Type: application/json' \
  -d '{"ballot_rkey": "663.1", "options": {"n_topics": 6, "persist": false}}'
```

## Lokal entwickeln

```bash
cd services/calculator
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.dist .env            # ANTHROPIC_API_KEY setzen
uvicorn src.main:app --reload --host 0.0.0.0 --port 3000
# → http://localhost:3000/docs  (OpenAPI / Swagger)
```

Read-only-Exploration eines Baums (schreibt `topdown_args_<rkey>.json`):

```bash
python -m src.topdown.prototype 663.1
```

## Aufbau

```
src/
  main.py              FastAPI-App, Router-Registrierung
  config.py            Env-Konfiguration
  core/fastapi.py      App, CORS, Rate-Limit, /healthz, DB-Lifespan
  core/db.py           asyncpg-Pool (AppView-Schema) + Topic-Tree-CRUD
  llm/
    base.py            LLMClient-Basistyp
    anthropic_client.py AnthropicLLM (forced tool-use, _call)
    factory.py         get_llm()
  topdown/
    prototype.py       Kern-Logik: propose_roots / classify_arguments / grow / serialize
    router.py          /api/topdown/* Endpoints
```

## Kubernetes

- Manifest: `infra/kube/calculator.yaml`
- Ingress-Regel: `calculator.poltr.info` → Service `calculator:80`
- Secret: `calculator-secrets` (siehe `infra/kube/secrets.yaml.dist`)
- Image: `ghcr.io/nikwyss/poltr-calculator:latest`

## DB-Anbindung (AppView-Postgres)

Der Service liest `app_arguments` und liest/schreibt die Top-down-Hierarchie
(`app_topic_node` / `app_topic_membership`) — siehe `src/core/db.py` (`asyncpg`,
nach AppView-Vorbild). Verbindung über `CALCULATOR_POSTGRES_URL` (Fallback
`APPVIEW_POSTGRES_URL`). DB-Rolle `calculator`: `SELECT` auf `app_arguments`, RW
auf `app_topic_node` / `app_topic_membership` (siehe
`infra/scripts/postgres/db-setup.sql` bzw. `migrate-topics.sql`). Optional liest
der Service über `CALCULATOR_CMS_POSTGRES_URL` (read-only) die amtliche
Vorlagen-Beschreibung als Themen-Kontext.

**Noch offen / Roadmap:**
- Endpoint-Schutz für `/api/topdown/*` (aktuell nur cluster-intern).
- Signierte ATProto-Snapshots des Baums (zurückgestellt).
