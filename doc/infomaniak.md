# Infomaniak AI Tools — Provider-Notizen

Infomaniak (Schweizer Hosting, gleicher Anbieter wie unsere K8s-Plattform und die
DNS-Zonen) bietet **AI Tools**: eine OpenAI-kompatible API für Chat Completions
und Embeddings. Interessant für **Datensouveränität** (CH-Hosting) und weil die
mengenintensiven Schritte günstiger laufen als auf Claude.

> Status: aktuell **nicht** im Code verwendet — der Calculator läuft komplett auf
> Anthropic (`claude-sonnet-4-6`). Diese Notiz hält fest, wie man Infomaniak als
> KI-Provider anbindet, für eine spätere Reaktivierung. Die Env-Variablen liegen
> als (auskommentierte) Platzhalter in `services/calculator/.env.dist` und
> `infra/kube/secrets.yaml.dist`.

## Auth & Basis

- **Base URL:** `https://api.infomaniak.com`
- **Auth:** `Authorization: Bearer <API-Token>` (Token im
  [Infomaniak Manager](https://manager.infomaniak.com/v3/profile/api-tokens) erstellen)
- **Product ID:** AI-Tools sind an ein „Produkt" gebunden; die `product_id` geht
  in den Pfad. Auffindbar über `GET /1/ai`.

Beide Werte (Token + Product ID) teilen sich Chat und Embeddings.

## Discovery-Endpoints

```bash
# verfügbare AI-Produkte (liefert die product_id)
curl -s -H "Authorization: Bearer $TOKEN" https://api.infomaniak.com/1/ai

# verfügbare Modelle (exakte Modell-IDs, Dimensionen etc.)
curl -s -H "Authorization: Bearer $TOKEN" https://api.infomaniak.com/1/ai/models
```

## Chat Completions (OpenAI-kompatibel)

```
POST https://api.infomaniak.com/2/ai/{product_id}/openai/v1/chat/completions
Header: Authorization: Bearer <token> · Content-Type: application/json
```

```bash
curl -s -X POST \
  "https://api.infomaniak.com/2/ai/$PRODUCT_ID/openai/v1/chat/completions" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "model": "google/gemma-4-31B-it",
    "messages": [
      {"role": "system", "content": "Antworte nur mit JSON."},
      {"role": "user", "content": "..."}
    ],
    "max_tokens": 600,
    "temperature": 0.2
  }'
# → { "choices": [ { "message": { "content": "..." } } ] }
```

Bewährtes Chat-Modell: **`google/gemma-4-31B-it`** (mengenintensive Klassifikation).

### ⚠️ Quirks (wichtig)

- **Kein forced tool-use / kein `response_format`.** Infomaniak lehnt
  `response_format` mit **HTTP 400** ab. Strukturierte Ausgabe muss man **per
  Prompt** erzwingen („Antworte AUSSCHLIESSLICH mit JSON in genau dieser Form …")
  und robust parsen. Anthropic-Code, der auf `tool_choice`/forced tools baut,
  läuft hier **nicht** 1:1 — ein JSON-Prompt-Adapter ist nötig.
- **Gemma verpackt JSON oft in ` ```json `-Fences.** Vor dem Parsen Fences
  strippen, dann das erste `{ … }` herausziehen.

## Embeddings (OpenAI-kompatibel)

```
POST https://api.infomaniak.com/2/ai/{product_id}/openai/v1/embeddings
Header: Authorization: Bearer <token> · Content-Type: application/json
Body:   {"model": <id>, "input": [<text>, ...], "encoding_format": "float", "dimensions": <opt>}
Resp:   {"object":"list","data":[{"embedding":[...],"index":0}, ...]}
```

```bash
curl -s -X POST \
  "https://api.infomaniak.com/2/ai/$PRODUCT_ID/openai/v1/embeddings" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3-Embedding-8B","input":["text a","text b"],"encoding_format":"float"}'
```

Bewährtes Embedding-Modell: **`Qwen/Qwen3-Embedding-8B`** (4096 dim).

### ⚠️ Quirks

- **Batch-Limit:** „input list must have less than 100 items" (HTTP 400 ab 100) —
  konservativ in Chunks von ~64 schicken.
- **Reihenfolge:** das `data`-Array kommt nicht zwingend sortiert → nach `index`
  sortieren, bevor man die Embeddings den Eingaben zuordnet.
- **`dimensions`** ist optional (modellabhängige Reduktion); leer = Modell-Default.

## Transiente Fehler

Das Infomaniak-Gateway zickt sporadisch mit **429/500/502/503/504**. Diese kurz
mit Backoff (1/2/4 s) wiederholen — derselbe Call nochmal, **kein** stiller
Fallback auf einen anderen Provider. Permanente Fehler (400/401) sofort
durchreichen.

## Env-Variablen (Konvention)

| Variable | Zweck |
|----------|-------|
| `CALCULATOR_EMBEDDING_BASE_URL` | Basis-URL (Default `https://api.infomaniak.com`) |
| `CALCULATOR_EMBEDDING_PRODUCT_ID` | AI-Tools Product ID (via `GET /1/ai`) |
| `CALCULATOR_EMBEDDING_API_KEY` | Infomaniak API-Token (Bearer) |
| `CALCULATOR_EMBEDDING_MODEL` | Embedding-Modell-ID (z.B. `Qwen/Qwen3-Embedding-8B`) |
| `CALCULATOR_OPENCODING_MODEL` *(bzw. ein neuer Chat-Modell-Name)* | Chat-Modell-ID (z.B. `google/gemma-4-31B-it`) |

Token + Product ID teilen sich Chat und Embeddings (gleiches Produkt).

## Referenz-Implementierung (entfernt, im git-Verlauf)

Eine frühere, funktionierende Anbindung lag in:
- `services/calculator/src/llm/infomaniak_chat.py` — Chat Completions + JSON-Prompt-Adapter
- `services/calculator/src/tags/embedding.py` — Embeddings mit Chunking + Retry

Beide wurden mit der bottom-up-Taxonomie entfernt (`git log` / `git show HEAD~:…`),
taugen aber als Vorlage für die Reaktivierung.
