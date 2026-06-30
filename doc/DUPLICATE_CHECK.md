# Duplikat-Check beim Verfassen von Argumenten

Erkennt beim Verfassen eines neuen Arguments, ob für **dieselbe Vorlage** bereits ein inhaltlich (nahezu) gleiches Argument **gleicher Position** existiert, und zeigt es dem Nutzer als **weichen Hinweis** an. Erster Konsument der Argument-Embeddings; Teil der erweiterbaren „Prüfstufe" des Composers (siehe [LM_PEER_REVIEW.md](LM_PEER_REVIEW.md)).

## Prinzip

- **Embedding + Schwelle, kein LLM.** Cosine-Ähnlichkeit über pgvector-Embeddings; nur Treffer ≥ Schwelle werden gezeigt. Das genügt für die Frage „gibt es ein ähnliches Argument?" — die letzte Entscheidung trifft der Nutzer.
- **Weicher, nicht-blockierender Hinweis.** Der Nutzer kann das bestehende Argument ansehen oder seines trotzdem einreichen. Nichts wird verhindert.
- **Der Nutzer urteilt, nicht die Maschine.** Es wird kein „ist Duplikat = ja/nein" behauptet; es wird das ähnlichste bestehende Argument *vorgelegt*.

## Scope der Suche

Verglichen wird **strikt eingegrenzt**, alle drei Filter zusammen:

| Filter | Warum |
|--------|-------|
| **Gleiche Vorlage** (`scope_rkey = ballot_rkey`) | Argumente anderer Vorlagen sind irrelevant. |
| **Gleiche Position** (`a.type = PRO/CONTRA`) | Gleiches Thema mit *gegenteiliger* Position ist **kein** Duplikat, sondern das Gegenargument. Ohne diesen Filter wäre der nächste Treffer oft das Gegenteil (Confound). |
| **Gleiche Sprache** (`lang`, kanonisch z.B. `de-CH`) | Gleichsprachiger Vergleich ist am präzisesten; Embeddings liegen pro Sprache vor. |

## Ablauf

```
Composer (Schreiben) → "Prüfen"
   │  Frontend: precheckArgument(ballotRkey, title, body, type)
   ▼
AppView  POST /xrpc/app.ch.poltr.argument.precheck   (auth, Sprache via resolve_requested_lang)
   │  httpx → reicht Stance/Sprache weiter, graceful bei Fehler
   ▼
Calculator  POST /api/embeddings/similar   (clusterintern, NICHT öffentlich)
   │  embeddet title+body live (Infomaniak) → Cosine gegen app_embeddings
   ▼
Postgres / pgvector   (gefiltert: ballot + stance + lang, >= Schwelle, ORDER BY <=>)
   ▲
   └── Ergebnis als Check-Bündel zurück → Composer „Prüfung"-Schritt
```

## Was angezeigt wird

- **Top-1**: das *eine* ähnlichste gleichgesinnte Argument über der Schwelle (Titel, PRO/CONTRA-Badge, Ähnlichkeit %). Empirisch deckt Top-1 ~99 % ab (siehe Kalibrierung).
- **Keine Treffer** → grüner „keine Duplikate"-Hinweis.
- **Prüfung nicht verfügbar** (Calculator nicht erreichbar/fehlerhaft) → grauer Hinweis „du kannst trotzdem einreichen". Nicht-blockierend.

## Komponenten

| Service | Datei | Rolle |
|---------|-------|-------|
| Frontend | [components/add-argument-modal.tsx](../services/frontend/src/components/add-argument-modal.tsx) | Zwei-Schritt-Composer (Schreiben → Prüfung → Einreichen), Karten-Container |
| Frontend | [lib/agent.ts](../services/frontend/src/lib/agent.ts) | `precheckArgument()` → XRPC, graceful |
| Frontend | `messages/*.json` (`feed`) | i18n: `dupTitle` („Mögliches Duplikat"), `dupHint`, `dupNone`, `dupUnavailable`, `similarityLabel`, `checkArgument`, `reviewTitle`, `backToEdit`, `submit` |
| AppView | [routes/deliberation/precheck.py](../services/appview/src/routes/deliberation/precheck.py) | XRPC `app.ch.poltr.argument.precheck` → erweiterbares Check-Bündel, proxyt zum Calculator |
| Calculator | [embedding/similarity.py](../services/calculator/src/embedding/similarity.py) | `similar_arguments()` + `_SIMILAR_SQL` (Cosine, Filter, Schwelle) |
| Calculator | [embedding/router.py](../services/calculator/src/embedding/router.py) | `POST /api/embeddings/similar` |

Datenbasis: `app_embeddings` (ein Vektor je `(argument, lang)`, `Qwen/Qwen3-Embedding-8B` @ 1024, befüllt vom Backfill-Cron). Siehe [LM_PEER_REVIEW.md](LM_PEER_REVIEW.md).

## Antwort-Form (erweiterbar)

`precheck` liefert ein **Check-Bündel**; jeder Check hat einen `status`, damit „echt keine Treffer" von „Prüfung fehlgeschlagen" unterscheidbar ist:

```json
{
  "lang": "de-CH",
  "duplicates": { "status": "ok", "items": [ {uri, title, body, type, similarity} ] }
}
```
`status: "unavailable"` bei Calculator-Fehler. Spätere Checks (Stance-Stimmigkeit, Verständlichkeit, Thematik, Formulierungstipps) kommen als **zusätzliche Top-Level-Felder** dazu — additiv, ohne Bruch.

## Fehlerhandling

Zweistufig graceful, damit ein Ausfall der Prüfung das Einreichen **nie** blockiert:
- **AppView**: Calculator nicht erreichbar / non-200 / non-JSON → `{status:"unavailable"}`, Ursache wird server-seitig geloggt (`precheck: calculator unreachable` / `returned <code>: <text>`).
- **Frontend**: HTTP-/Netzwerkfehler → `{status:"unavailable", items:[]}`.

> Hinweis fürs Debugging: Der graceful Fallback macht Fehler im UI unsichtbar (zeigt „nicht verfügbar"). Die genaue Ursache steht in den **AppView-Logs** (`precheck:`-Zeile).

## Konfiguration

| Env-Var | Default | Wirkung |
|---------|---------|---------|
| `CALCULATOR_DEDUP_SIM_THRESHOLD` (Calculator) | **0.66** | Anzeige-Schwelle. Darunter → „keine Duplikate". |
| `CALCULATOR_INTERNAL_URL` (AppView) | `http://calculator.poltr.svc.cluster.local` | Calculator-Adresse. Prod = Code-Default; **lokal** den Calculator-Port setzen (z.B. `http://localhost:3005`). |
| `CALCULATOR_EMBEDDING_API_KEY` / `_PRODUCT_ID` (Calculator) | — | Infomaniak-Creds zum Embedden des Entwurfs. Fehlen sie → 502 → „nicht verfügbar". |

`limit` (Top-N) ist auf **1** defaultet (calculator `SimilarRequest`/`similar_arguments`, appview precheck).

## Empirische Kalibrierung (Ballot 663.1, de-CH, same-stance)

- Echte Near-Dupes liegen bei **0.66–0.82**; Rauschen darunter. Schwelle **0.66** fängt auch knappe Fälle („Weniger ist mehr", „ÖV"); recall-orientiert (weicher Hinweis, Fehltreffer = ein Klick).
- Von 111 Argumenten haben **21** (~19 %) mind. einen gleichgesinnten Treffer ≥ 0.66, nur **4** (~3.6 %) mehr als einen.
- **Top-1 vs Top-2:** Das Szenario „Top-1 kein Duplikat, Top-2 schon" kann nur bei diesen 4 auftreten und ist dort die unwahrscheinlichere Konstellation → **Restrisiko ~1 %**. Top-2 wäre praktisch gratis (gleiche Query) als Absicherung.

## Sicherheit

`/api/embeddings/*` ist **clusterintern** — der Calculator-Ingress ist auf `/api/topdown` beschränkt (sonst lägen Compute + Infomaniak-Kosten offen). Siehe [CALCULATOR_EXPOSURE.md](CALCULATOR_EXPOSURE.md).

## Lokale Entwicklung — Stolpersteine

1. `CALCULATOR_PORT`-Default (3000) **kollidiert** mit der lokalen AppView (auch 3000) → Calculator auf anderem Port starten (z.B. 3005) und `CALCULATOR_INTERNAL_URL` in der AppView-`.env` darauf zeigen lassen.
2. Infomaniak-Creds in `services/calculator/.env` **nicht auskommentiert** lassen (führendes `#` → „not configured" → 502).
3. Calculator muss auf die DB mit `app_embeddings` zeigen (Cluster-DB via Port-Forward), sonst leere Ergebnisse.

## Offen / später

- **Stance-aware LLM-Check** (Infomaniak Gemma, JSON-Prompt wie Translator): erlaubt niedrigere Schwelle bei sauberer Präzision; der harte Stance-Filter deckt den Hauptfall heute schon ab.
- Schwellenwert ggf. pro Sprache nachjustieren.
- „Ansehen"-Link auf das Duplikat (Overlay-Navigation).
