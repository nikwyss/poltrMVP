# Mehrsprachigkeit für ATProto-Records (manuell + KI)

> **Verwandt:** [TRANSLATIONS.md](TRANSLATIONS.md) beschreibt die Übersetzung der **Frontend-UI-Strings** (next-intl, `messages/*.json`). Dieses Dokument behandelt die Übersetzung der **Record-Inhalte** (Argument-Title/Body, Comment-Text), die in PDS-ATProto-Records gespeichert sind. Beide Initiativen ergänzen sich.

## Context

POLTR ist heute weitgehend einsprachig (Deutsch). Frontend hat zwar `next-intl` mit `de`/`en` für UI-Strings, **die eigentlichen ATProto-Inhalte** (Argumente, Kommentare, Ballot-Texte) liegen jedoch nur in **einer** Sprache pro Record vor:

- **Offizielle Argumente** (CMS `OfficialArguments`) haben in der Bundeskanzlei-Quelle bereits Übersetzungen (DE/FR/IT) — diese gehen aktuell beim Import verloren.
- **Community-Argumente** und **Kommentare** entstehen in der Sprache des Autors; nicht-DE-Sprecher sehen sie roh.
- Das Lexicon `app.ch.poltr.ballot.argument` hat **kein** Sprach- oder `translations`-Feld; die DB-Tabellen `app_arguments`/`app_comments` ebenfalls nicht.
- TypeScript-Stub `language?: 'de-CH'|'fr-CH'|'it-CH'|'rm-CH'` existiert in [services/frontend/src/types/ballots.ts](../services/frontend/src/types/ballots.ts) — wird aber nirgends genutzt.

**Ziel:** Jeder textuelle ATProto-Record führt die Originalsprache + Übersetzungen für **DE/FR/IT/RM/EN** mit sich. Offizielle Argumente werden **manuell** im Payload CMS gepflegt (Payload Localization). Community-Arguments + Comments werden **automatisch via KI** im Hintergrund übersetzt — der KI-Call selbst kommt in einer zweiten Iteration; jetzt nur die Architektur.

**Datenmodell-Entscheidung:** Variante A — Übersetzungen leben **inline im ATProto-Record** (reindex-fest, dezentral, portabel). Background-Worker schreibt KI-Ergebnisse per `putRecord` zurück.

**ATProto-Kompatibilität:** Für die Sprach-Deklaration des Original-Records verwenden wir das offizielle Bluesky-Feld `langs: string[]` (BCP-47, max. 3 Einträge — identisch zu [`app.bsky.feed.post`](https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json)). So bleiben Records mit dem Rest des ATProto-Ökosystems kompatibel (z.B. Bluesky-Crossposting, sprachfilternde Feeds). Das `translations`-Array selbst ist eine POLTR-spezifische Erweiterung im eigenen Namespace `app.ch.poltr.*` — derzeit existiert kein ATProto-Standard für inline gespeicherte Übersetzungen, der Bluesky-Client nutzt clientseitiges On-the-fly-Übersetzen (Google Translate), was für POLTRs auditierbare/redaktionelle Übersetzungen nicht ausreicht.

---

## Architekturüberblick

```
┌──────────────┐    putRecord (alle 5 Sprachen)    ┌───────┐    firehose    ┌─────────┐
│ CMS Hook     │ ─────────────────────────────────►│  PDS  │───────────────►│ Indexer │
│ (manuell)    │                                    └───────┘                 └────┬────┘
└──────────────┘                                                                   │
                                                                                   ▼
┌──────────────────┐  create/putRecord  ┌───────┐                              ┌──────┐
│ AppView API      │ ──────────────────►│  PDS  │                              │  DB  │
│ (User-Input)     │                    └───────┘                              │      │
└──────────────────┘                                                            │ lang │
                                                                                │ tx[] │
┌──────────────────┐                                                            └──┬───┘
│ Translation-     │      SELECT (untranslated)                                    │
│ Worker (asyncio) │◄──────────────────────────────────────────────────────────────┘
│ APPVIEW_         │
│ TRANSLATE_       │      putRecord (Record mit translations[…])
│ ENABLED          │──────────────────────────────────► PDS ──► firehose ──► Indexer
└──────────────────┘
```

---

## Sprachen-Konstanten — eine Quelle, mehrere Konsumenten

Start mit **5 Sprachen**: `de`, `fr`, `it`, `rm`, `en`. Default/Fallback: `de`.

**Zentrale Konfiguration via Env-Var** (Helm-/Kubernetes-ConfigMap):
```yaml
POLTR_LANGUAGES: "de,fr,it,rm,en"
POLTR_DEFAULT_LANGUAGE: "de"
NEXT_PUBLIC_POLTR_LANGUAGES: "de,fr,it,rm,en"   # für Frontend (build-time)
```

Jeder Service liest beim Start daraus und stellt eine getypte Liste bereit:

- **AppView** [services/appview/src/core/languages.py](../services/appview/src/core/languages.py) (NEU):
  ```python
  SUPPORTED_LANGUAGES = os.getenv("POLTR_LANGUAGES", "de,fr,it,rm,en").split(",")
  DEFAULT_LANGUAGE = os.getenv("POLTR_DEFAULT_LANGUAGE", "de")
  ```
- **Indexer** [services/indexer/src/languages.js](../services/indexer/src/languages.js) (NEU):
  ```js
  export const SUPPORTED_LANGUAGES = (process.env.POLTR_LANGUAGES || "de,fr,it,rm,en").split(",");
  ```
- **Frontend** [services/frontend/src/i18n/config.ts](../services/frontend/src/i18n/config.ts):
  ```ts
  export const locales = (process.env.NEXT_PUBLIC_POLTR_LANGUAGES || "de,fr,it,rm,en").split(",") as Locale[];
  ```
  Übersetzungsdateien `services/frontend/messages/fr.json`, `it.json`, `rm.json` als Skelett anlegen (Inhalte folgen — kein Scope dieses Plans).
- **CMS** [services/cms/src/payload.config.ts](../services/cms/src/payload.config.ts) — Payload erwartet die Locales statisch im Config-Block (siehe §2). Hier kann man `POLTR_LANGUAGES` lesen und zu Locale-Objekten mappen, **aber** jede neue Locale erzeugt eine DB-Migration in Payload (siehe "Sprache hinzufügen"-Sektion am Ende).

**Niemals** Sprach-Listen in Routen-Handlern, Worker-Logik oder Komponenten hartcodieren — immer aus der zentralen Konstante des jeweiligen Service.

---

## 1. Lexicon-Erweiterung

[lexicons/app/ch/poltr/ballot/argument.json](../lexicons/app/ch/poltr/ballot/argument.json): füge zwei optionale Top-Level-Properties hinzu:

```json
"langs": {
  "type": "array",
  "maxLength": 3,
  "items": { "type": "string", "format": "language" },
  "description": "Sprachen des Original-Inhalts (BCP-47, z.B. 'de'). Folgt dem Bluesky-Standard app.bsky.feed.post. Default ['de'] wenn fehlend."
},
"translations": {
  "type": "array",
  "maxLength": 10,
  "items": { "type": "ref", "ref": "#translation" },
  "description": "POLTR-spezifische Übersetzungen des Original-Inhalts (nicht-Bluesky-Standard). maxLength bewusst über aktuell 5 unterstützten Sprachen, damit künftige Sprach-Erweiterungen ohne Lexicon-Versions-Bump möglich sind."
}
```

Neuer `#translation` Subdef (eine Übersetzung ist immer in genau einer Zielsprache → `lang` hier Single String):

```json
"translation": {
  "type": "object",
  "required": ["lang", "title", "body", "source"],
  "properties": {
    "lang":   { "type": "string", "format": "language" },
    "title":  { "type": "string", "maxLength": 300 },
    "body":   { "type": "string", "maxLength": 10000 },
    "source": { "type": "string", "knownValues": ["manual","ai"] },
    "model":  { "type": "string", "description": "Modellkennung wenn source='ai', z.B. 'claude-haiku-4-5'." },
    "translatedAt": { "type": "string", "format": "datetime" }
  }
}
```

Hinweis: Originalsprach-Inhalt bleibt im Top-Level `title`/`body`. Das `translations`-Array enthält **nur die Übersetzungen** (nicht das Original) — das verhindert Inkonsistenzen. Application-seitig wird `langs` auf die in `POLTR_LANGUAGES` konfigurierten Codes eingeschränkt; das Lexicon selbst akzeptiert aber jeden BCP-47-Code (Forward-Kompatibilität — eine zusätzliche Sprache braucht **keinen** Lexicon-Change).

### 1b. Comments: Sidecar-Records statt Inline (Repo-Topologie!)

**Warum anders als Arguments:** Arguments leben im Community-Account des Ballots — POLTR kontrolliert die Credentials, kann den ganzen Record mit `putRecord` überschreiben. **Comments leben jedoch in User-Repos** (interne Comments) bzw. **fremden Bluesky-Repos** (externe Replies via crosspost-poller). Dort darf der Worker **niemals** schreiben.

Lösung: Übersetzungen sind **eigenständige Sidecar-Records** im community-Account des Ballots, die per `subject.uri` auf den Original-Comment zeigen. Original-Comment bleibt unverändert; nur `langs` (Original-Sprachdeklaration) wird in `app.ch.poltr.comment` ergänzt.

**Neues Lexicon `app.ch.poltr.comment.translation`** (eine Übersetzung pro Record — kein Array; composed rkey = idempotent + einzeln moderierbar):

```json
{
  "lexicon": 1,
  "id": "app.ch.poltr.comment.translation",
  "defs": {
    "main": {
      "type": "record",
      "key": "any",
      "record": {
        "type": "object",
        "required": ["subject", "lang", "body", "source", "translatedAt"],
        "properties": {
          "subject": {
            "type": "object",
            "required": ["uri"],
            "properties": {
              "uri": { "type": "string", "format": "at-uri" },
              "cid": { "type": "string", "format": "cid" }
            }
          },
          "ballot":       { "type": "string", "description": "Ballot rkey, denormalisiert für Filterung." },
          "lang":         { "type": "string", "format": "language" },
          "body":         { "type": "string", "maxLength": 10000 },
          "source":       { "type": "string", "knownValues": ["manual", "ai"] },
          "model":        { "type": "string" },
          "translatedAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

**rkey-Schema:** `{commentRkey}-{lang}` (z.B. `3kj4f2x9-fr`) — composed key = re-runs nach Teilausfällen idempotent.

**Bestehender `app.ch.poltr.comment`** bekommt **nur** `langs` (kein `translations[]`):

```json
"langs": {
  "type": "array",
  "maxLength": 3,
  "items": { "type": "string", "format": "language" }
}
```

(Kein Lexicon-File im Repo bisher — Schema bleibt implizit, Indexer liest `record.langs ?? [DEFAULT_LANGUAGE]`.)

**Externe Bluesky-Replies funktionieren transparent:** `subject.uri` zeigt einfach auf den fremden `at://did:plc:.../app.bsky.feed.post/...` URI; POLTR schreibt nichts in fremde Repos, nur in den eigenen Community-Account.

---

## 2. CMS — Payload Localization für Ballots und Official Arguments

### 2a. Localization aktivieren

[services/cms/src/payload.config.ts](../services/cms/src/payload.config.ts):

```ts
localization: {
  locales: [
    { code: 'de', label: 'Deutsch' },
    { code: 'fr', label: 'Français' },
    { code: 'it', label: 'Italiano' },
    { code: 'rm', label: 'Rumantsch' },
    { code: 'en', label: 'English' },
  ],
  defaultLocale: 'de',
  fallback: true,
},
```

Was Payload daraus baut (automatisch, ohne weiteres Zutun):

- **Sprach-Switcher oben rechts** in jeder Edit-Maske eines Documents mit localized Feldern.
- **Per-Locale-Spalten/Rows in der Payload-DB** für jedes `localized: true` Feld.
- **REST/GraphQL API** mit `?locale=fr&fallback-locale=de` — direkt von AppView nutzbar.
- **Fallback** auf `defaultLocale` wenn ein Locale-Slot leer ist.

### 2b. [Ballots.ts](../services/cms/src/collections/Ballots.ts) — Multi-Locale

Aktuelles Modell (`language`-Select-Feld + monolinguale Texte) ist konzeptionell broken, weil `rkey` `unique: true` ist (eine BK-Nummer = eine Vorlage) und schließt 4 sprachspezifische Ballot-Duplikate aus. Umbau:

| Feld | Heute | Nach Umbau |
|---|---|---|
| `rkey`, `voteDate`, `ballotType`, `officialRef`, `status`, `communityDid`, `communityHandle` | — | unverändert (Metadaten, nicht localized) |
| `title` | monolingual | `localized: true` |
| `description` | monolingual richText | `localized: true` |
| `topic` | monolingual | `localized: true` |
| `language` (select de/fr/it/en) | sidebar | **entfernen** — durch Sprach-Switcher abgelöst |
| **NEU `originLanguage`** | — | sidebar select, default `de`. Markiert die Quellsprache (siehe §2d) |

Ballots werden **nicht** auf den PDS publiziert und werden im Zuge dieses Plans auch in der API-Antwort nicht mehr als Pseudo-ATProto-Record verkleidet — sie sind Basis-App-Inhalt und werden über eine ehrliche REST-Route `/api/ballots*` ausgeliefert. AppView liest sie über die Payload-REST-API mit `?locale=<lang>`. Konkrete Änderungen am AppView- und Frontend-Lese-Pfad: siehe §5b.

### 2c. [OfficialArguments.ts](../services/cms/src/collections/OfficialArguments.ts) — Multi-Locale

| Feld | Heute | Nach Umbau |
|---|---|---|
| `type` (PRO/CONTRA), `sourceType`, `documentRef`, `section`, `status`, `pdsUri`, `pdsCid`, `ballot` | — | unverändert (Metadaten + Quellverweis-Strings; bewusst nicht localized) |
| `title` | monolingual text | `localized: true` |
| `body` | monolingual textarea | `localized: true` |
| **NEU `originLanguage`** | — | sidebar select, default `de`. Markiert die Quellsprache des Arguments (siehe §2d) |

### 2d. `originLanguage` — wer ist Quelle, wer Übersetzung?

Standardannahme "DE = Original" ist falsch für FR-Originale (Romandie-Inhalte) oder IT-Originale (Tessin). Ein `originLanguage`-Select pro Document löst das sauber:

- Im Admin sichtbar in der Sidebar.
- Der Sprach-Switcher zeigt zusätzlich einen kleinen Hinweis "Quelltext" am Tab der `originLanguage`.
- Beim Publish weiß der Hook, **welche Locale ins `langs`-Array und in `title`/`body` (Top-Level) des ATProto-Records geht**, und welche Locales als `translations[]` mitgeschrieben werden.

### 2e. Publish-Hook erweitern

[services/cms/src/lib/atproto-publish.ts](../services/cms/src/lib/atproto-publish.ts) — `buildArgumentRecord()` (Zeilen 341–354) wird dynamisch:

```ts
async function buildArgumentRecord(payload, doc, ballotRkey) {
  const origin = doc.originLanguage || 'de'
  const originDoc = await payload.findByID({
    collection: 'imported-arguments', id: doc.id, locale: origin,
  })

  const translations = (await Promise.all(
    SUPPORTED_LANGUAGES.filter(l => l !== origin).map(async (lang) => {
      const localized = await payload.findByID({
        collection: 'imported-arguments', id: doc.id, locale: lang,
        fallbackLocale: false,  // wichtig: keine Origin-Fallbacks ins translations[]
      })
      if (!localized.title || !localized.body) return null
      if (localized.title === originDoc.title && localized.body === originDoc.body) return null
      return {
        lang, title: localized.title, body: localized.body,
        source: 'manual', translatedAt: new Date().toISOString(),
      }
    })
  )).filter(Boolean)

  return {
    $type: ARGUMENT_NSID,
    title: originDoc.title,
    body:  originDoc.body,
    langs: [origin],
    type: doc.type,
    ballot: ballotRkey,
    createdAt: doc.createdAt || new Date().toISOString(),
    source: buildArgumentSource(doc),
    ...(translations.length && { translations }),
  }
}
```

`publishImportedArgument()` und `updateImportedArgument()` brauchen den `payload`-Client als zusätzlichen Parameter (haben ihn bereits über `req.payload` via Hook).

**Wichtig:** Der `afterChange`-Hook feuert bereits korrekt mit `skipPublishHook`-Context-Flag gegen Self-Deadlock. Hier nichts ändern.

### 2f. Übersetzungs-Status-Indikator (UI-Component)

Neuer UI-Component analog zu [BallotRowActions.tsx](../services/cms/src/components/BallotRowActions.tsx):

- **Spalte in der List-View** und **Sidebar-Widget in der Edit-View**: `DE ✓ FR ✓ IT ✗ RM ✗ EN ✓`
- Lädt per Payload-API die Locale-Befüllung des Documents und zeigt sie kompakt.
- Klickbar: Klick auf eine fehlende Sprache → Switcher springt direkt in den entsprechenden Tab.
- Pfad: `services/cms/src/components/TranslationStatus.tsx`. Wird in Ballots + OfficialArguments-Collections referenziert via `admin.components.Cell` (Liste) und `admin.components.Field` (Edit-Sidebar).

### 2g. Migration bestehender Ballot-Daten

Beim Aktivieren von `localized: true` auf einem Feld migriert Payload **nicht automatisch** existierende Werte in den `defaultLocale`-Slot. Eine einmalige Migration:

```ts
// services/cms/src/migrations/<timestamp>_ballots_localized.ts
export async function up({ payload, req }) {
  const ballots = await payload.find({ collection: 'ballots', limit: 0, req })
  for (const b of ballots.docs) {
    const origin = b.language || 'de'  // bestehendes language-Feld als Hinweis nutzen
    await payload.update({
      collection: 'ballots', id: b.id, locale: origin, req,
      data: { title: b.title, description: b.description, topic: b.topic },
    })
    // originLanguage als Neuvalue setzen
    await payload.update({
      collection: 'ballots', id: b.id, req,
      data: { originLanguage: origin },
    })
  }
}
```

Danach das `language`-Select-Feld aus dem Schema entfernen. Für `OfficialArguments` analoge Migration (Origin = `de`).

### 2h. CMS Edit-Flow (UX-Walkthrough)

1. Admin öffnet `/admin/collections/ballots/<id>`.
2. Sprach-Switcher steht auf `originLanguage` (z.B. `de`). Felder zeigen Quelltext.
3. Sidebar: `TranslationStatus` zeigt `DE ✓ FR ✗ IT ✗ RM ✗ EN ✗` — leuchtet "fehlt da noch was".
4. Admin klickt im Switcher auf `fr` → Formular reloads, FR-Slots leer. Inhalt eintragen → speichern. Payload schreibt nur den FR-Slot.
5. Wiederholen für `it`, `rm`, `en`.
6. Status auf `published`:
   - **Ballot:** Hook erstellt nur den Community-Account (kein PDS-Record für Ballots).
   - **OfficialArgument:** Hook liest `originLanguage`-Locale + alle anderen befüllten Locales, baut den ATProto-Record mit `langs: [origin]` + `translations[]`, schreibt auf PDS.

---

## 3. DB-Schema

Migration in [scripts/postgres/db-setup.sql](../scripts/postgres/db-setup.sql) und neue Migrationsdatei unter [infra/scripts/postgres/](../infra/scripts/postgres/):

```sql
ALTER TABLE app_arguments
  ADD COLUMN langs TEXT[] NOT NULL DEFAULT ARRAY['de'],
  ADD COLUMN translations JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'pending';
  -- 'pending' | 'partial' | 'complete' | 'manual_only'

ALTER TABLE app_comments
  ADD COLUMN langs TEXT[] NOT NULL DEFAULT ARRAY['de'],
  ADD COLUMN translation_status TEXT NOT NULL DEFAULT 'pending';
-- NB: KEIN translations JSONB auf app_comments — Übersetzungen kommen als
-- Sidecar-Records via app_comment_translations (siehe unten).

CREATE TABLE app_comment_translations (
  uri           TEXT PRIMARY KEY,    -- AT-URI des Sidecar-Records
  cid           TEXT NOT NULL,
  subject_uri   TEXT NOT NULL,        -- AT-URI des Comments (kann fremder bsky-URI sein)
  ballot_rkey   TEXT,                  -- denormalisiert, schneller Filter
  lang          TEXT NOT NULL,
  body          TEXT NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('manual', 'ai')),
  model         TEXT,
  translated_at TIMESTAMPTZ NOT NULL,
  indexed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted       BOOLEAN NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX app_comment_translations_subject_lang_uniq
  ON app_comment_translations (subject_uri, lang) WHERE NOT deleted;
CREATE INDEX app_comment_translations_subject_idx
  ON app_comment_translations (subject_uri) WHERE NOT deleted;

CREATE INDEX app_arguments_translation_status_idx
  ON app_arguments (translation_status)
  WHERE NOT deleted AND translation_status IN ('pending','partial');
CREATE INDEX app_comments_translation_status_idx
  ON app_comments (translation_status)
  WHERE NOT deleted AND translation_status IN ('pending','partial');

CREATE INDEX app_arguments_langs_idx ON app_arguments USING GIN (langs);
CREATE INDEX app_comments_langs_idx  ON app_comments  USING GIN (langs);
```

Das `translation_status`-Feld + Partial-Index ist die **Queue** für den Background-Worker — kein extra Queue-System nötig.

---

## 4. Indexer

[services/indexer/src/db.js](../services/indexer/src/db.js) und [services/indexer/src/record_handler.js](../services/indexer/src/record_handler.js):

**Arguments (inline-Variante, unverändert):** `upsertArgumentDb` schreibt `langs`, `translations` (JSONB), `translation_status` direkt in `app_arguments` — Status dynamisch gegen `SUPPORTED_LANGUAGES`.

**Comments (Sidecar-Variante, NEU):**

- `upsertCommentDb` schreibt nur `langs` + `translation_status` in `app_comments` (kein `translations` JSONB).
- **Neuer Collection-Handler** in `record_handler.js`: `app.ch.poltr.comment.translation` →
  - `upsertCommentTranslationDb` schreibt in die separate Tabelle `app_comment_translations`
  - Trigger anschließend `recomputeCommentTranslationStatus(subject_uri)` für den Parent-Comment.
- **`upsertCommentDb`** ruft am Ende ebenfalls `recomputeCommentTranslationStatus(uri)` auf, falls Sidecars schon eingelaufen sind bevor der Comment indexiert ist (Out-of-Order-Firehose-Safety).
- `recomputeCommentTranslationStatus(commentUri)`:
  ```js
  const covered = new Set([
    ...(row.langs || [DEFAULT_LANGUAGE]),
    ...(await db.query(
      "SELECT lang FROM app_comment_translations WHERE subject_uri = $1 AND NOT deleted",
      [commentUri]
    )).rows.map(r => r.lang),
  ]);
  const status = SUPPORTED_LANGUAGES.every(l => covered.has(l)) ? "complete" : (covered.size > (row.langs?.length || 1) ? "partial" : "pending");
  await db.query("UPDATE app_comments SET translation_status = $1 WHERE uri = $2", [status, commentUri]);
  ```
- Sidecar-Delete-Events markieren `app_comment_translations.deleted=true` und rechnen den Parent-Status neu (zurück auf `partial`/`pending`).

[services/indexer/src/record_handler.js](../services/indexer/src/record_handler.js) — keine Änderung der Routing-Logik nötig; nur das `record`-Objekt enthält neue Felder, die `upsertArgumentDb`/`upsertCommentDb` verwerten.

---

## 5. AppView — Read-API

### 5a. Arguments (inline-Variante)

In `routes/deliberation/arguments.py`: `_serialize_argument_row` mit `?lang=` + `Accept-Language`.

- Falls die gewünschte Sprache in `langs` (Original): gib `title`/`body` direkt zurück.
- Falls in `translations` (JSONB-Array auf `app_arguments`): gib übersetzten `title`/`body` zurück und füge `translatedFrom: <ersteOriginalsprache>`, `translationSource: 'manual'|'ai'` hinzu.
- Fallback: requested → DEFAULT_LANGUAGE → `langs[0]`. Niemals leer.

Antwort-Shape erweitert um `langs: string[]`, `availableLangs: string[]`, `translationSource`.

### 5a-bis. Comments (Sidecar-Variante via LEFT JOIN)

In `routes/deliberation/comments.py`: SQL nimmt einen LEFT JOIN auf `app_comment_translations`. Ein einziger Roundtrip pro Comment-Liste — kein N+1.

```sql
SELECT
  c.uri, c.cid, c.did, c.text, c.langs, c.translation_status,
  ct.lang  AS t_lang,
  ct.body  AS t_body,
  ct.source AS t_source,
  (SELECT array_agg(DISTINCT x.lang)
     FROM app_comment_translations x
     WHERE x.subject_uri = c.uri AND NOT x.deleted) AS translation_langs,
  ...
FROM app_comments c
LEFT JOIN app_comment_translations ct
  ON ct.subject_uri = c.uri AND ct.lang = $requested_lang AND NOT ct.deleted
WHERE ...
```

Serializer-Logik pro Row:
1. Falls `$requested_lang ∈ c.langs` → `body = c.text` (Original).
2. Sonst falls `ct.body` (LEFT JOIN traf) → `body = ct.body`, `translationSource = ct.source`, `translatedFrom = c.langs[0]`.
3. Sonst Fallback auf Original.
4. `availableLangs = c.langs ∪ translation_langs`.

### 5b. Ballots — ehrliche REST-API (kein ATProto-Verkleiden mehr)

**Architektur-Entscheidung:** Ballots sind Basis-App-Inhalt, leben nur im CMS, werden niemals ATProto-Records. Das aktuelle `$type: 'app.ch.poltr.ballot.entry'` + `uri: 'cms://ballots/<rkey>'` + `cid: ''` Pseudo-Record-Pattern wird durch eine ehrliche REST-API ersetzt. Schichten-Trennung in POLTR:

- **ATProto-frei:** Ballots, Auth, Profile (CMS + AppView REST)
- **ATProto-basiert:** Arguments, Comments, Reviews, Likes (PDS + Firehose + Indexer)

### 5b-1. AppView — neuer Endpoint

Ersetze die XRPC-Pseudo-Endpoints durch klar nicht-ATProto-Routen:

| Alt (Pseudo-XRPC) | Neu (ehrliche REST) |
|---|---|
| `GET /xrpc/app.ch.poltr.ballot.list` | `GET /api/ballots?lang=de` |
| `GET /xrpc/app.ch.poltr.ballot.get?rkey=<rkey>` | `GET /api/ballots/<rkey>?lang=de` |

Konkret in [services/appview/src/routes/ballots/ballots.py](../services/appview/src/routes/ballots/ballots.py):

- **Router-Pfad** von `/xrpc/app.ch.poltr.ballot.*` auf `/api/ballots*` umstellen (eigener Router oder Pfad-Mapping; Schichten-Trennung explizit machen).
- **`_fetch_cms_ballots()` / `_fetch_cms_ballot()`**: URL um `&locale=<lang>&fallback-locale=de` erweitern. Locale aus `?lang=`-Query oder `Accept-Language`-Header.
- **Zusätzlich `availableLangs`** ermitteln: zweiter CMS-Call mit `?locale=all` → Liste der Locales mit non-empty `title`.
- **`_serialize_cms_ballot()`** komplett neu schreiben: kein `$type`, kein `record`-Wrapper, kein `uri`, kein `cid`. Flache Response:

```python
def _serialize_cms_ballot(doc, counts=None, viewer_like=None) -> dict:
    rkey = doc.get("rkey", str(doc.get("id", "")))
    return {
        "rkey": rkey,                                       # statt uri
        "title": doc.get("title", ""),
        "description": _extract_text(doc.get("description")),
        "topic": doc.get("topic"),
        "ballotType": doc.get("ballotType"),
        "voteDate": doc.get("voteDate", ""),
        "officialRef": doc.get("officialRef"),
        "originLanguage": doc.get("originLanguage", "de"),
        "availableLangs": doc.get("_availableLangs", ["de"]),  # vom locale=all-Call befüllt
        "createdAt": doc.get("createdAt"),
        "updatedAt": doc.get("updatedAt"),
        "communityDid": doc.get("communityDid"),
        "argumentCount": (counts or {}).get("argument_count", 0),
        "commentCount": (counts or {}).get("comment_count", 0),
        "likeCount": (counts or {}).get("like_count", 0),
        "viewer": {"like": viewer_like} if viewer_like else None,
    }
```

`communityDid` bleibt drin — die Frontend braucht das, um die zugehörigen ATProto-Argumente zu finden (Brücke zwischen Schichten).

### 5b-2. Frontend — Refactoring-Inventar

**Typen** [services/frontend/src/types/ballots.ts](../services/frontend/src/types/ballots.ts):

- `BallotRecord` löschen.
- `BallotWithMetadata` umbenennen zu `Ballot` und flach machen:
  ```ts
  export interface Ballot {
    rkey: string;
    title: string;
    description?: string;          // schon als Plain-Text vom Backend
    topic?: string;
    ballotType?: BallotType;
    voteDate: string;
    officialRef?: string;
    originLanguage: string;
    availableLangs: string[];
    createdAt?: string;
    updatedAt?: string;
    communityDid?: string;        // Bridge zur Deliberation
    argumentCount?: number;
    commentCount?: number;
    likeCount?: number;
    viewer?: { like?: string };
  }
  ```
- `ArgumentRecord`, `CommentRecord`, `ArgumentWithMetadata`, `CommentWithMetadata` bleiben unverändert — die sind echte ATProto-Records.

**Agent-Calls** [services/frontend/src/lib/agent.ts](../services/frontend/src/lib/agent.ts) Zeilen 28-46:

- `getBallot(rkey)` ruft `/api/ballots/<rkey>?lang=<currentLocale>` statt `/api/xrpc/app.ch.poltr.ballot.get?rkey=...`
- `listBallots()` ruft `/api/ballots?lang=<currentLocale>` statt `/api/xrpc/app.ch.poltr.ballot.list`
- Beide bekommen `lang` als Parameter (Default: aktuelle Locale via `useLocale()`/`getLocale()`).

**Komponenten** — überall wo heute `ballot.record.*` oder `ballot.uri` steht, einfacher zugreifen:

| Datei | Was zu tun |
|---|---|
| [services/frontend/src/app/(app)/home/page.tsx](../services/frontend/src/app/(app)/home/page.tsx) (Zeilen 31, 34, 38, 45, 80, 83) | `ballot.record.title` → `ballot.title`; `ballot.uri.split("/").pop()` → `ballot.rkey`; `key={ballot.uri}` → `key={ballot.rkey}` |
| [services/frontend/src/app/(app)/ballots/page.tsx](../services/frontend/src/app/(app)/ballots/page.tsx) (Zeilen 30, 33, 37, 44, 79, 82) | analog |
| [services/frontend/src/app/(app)/ballot/[id]/arguments/feed/page.tsx](../services/frontend/src/app/(app)/ballot/[id]/arguments/feed/page.tsx) (Zeilen 816-846, 956) | `ballot.record.title` → `ballot.title`; `ballot.record.text` → `ballot.description`; das `ballot.record.language`-Badge (Zeilen 818-820) durch UI für `availableLangs` ersetzen (siehe §8); `ballotUri={ballot.uri}` (Zeile 956) → entweder `ballotRkey={ballot.rkey}` oder weiterhin URI bauen falls argument-create endpoint das so erwartet (= AT-URI des community accounts, nicht der Ballot selbst!) |
| [services/frontend/src/app/(app)/ballot/[id]/arguments/booklet/page.tsx](../services/frontend/src/app/(app)/ballot/[id]/arguments/booklet/page.tsx) (Zeilen 652-672, 698) | analog: `ballot.record.*` → `ballot.*`; `ExpandableText text={ballot.record.text}` → `text={ballot.description}` |

**Wichtig**: Zeile 956 in `feed/page.tsx` (`ballotUri={ballot.uri}`) bezieht sich auf den Argument-Create-Endpoint. Heute steht in `ballot.uri` der `cms://`-Pseudo-URI. Bei der Argumentcreation wird intern aber der **rkey** zur Auflösung des Community-Accounts verwendet. Den Aufruf auf `ballotRkey={ballot.rkey}` umstellen; Backend `create_argument()` entsprechend anpassen (statt URI-Parsing direkt `rkey` entgegennehmen).

### 5b-3. Migration in zwei Phasen (atomar nicht möglich, da Frontend + Backend zusammenhängen)

1. **Backend-Step:** Neue `/api/ballots*`-Endpoints **zusätzlich** zu den alten XRPC-Pseudo-Endpoints ausliefern. Beide Pfade aktiv.
2. **Frontend-Step:** Types, Agent-Calls, Komponenten auf neues Shape umstellen. Deployen.
3. **Cleanup:** Alte XRPC-Pseudo-Endpoints aus `ballots.py` entfernen.

So bleibt das System während des Refactors funktionsfähig (keine Big-Bang-Deployment).

### 5b-4. Was unverändert bleibt

- `auth.community_accounts`-Tabelle (Bridge: `ballot_rkey` → `did`) — unverändert, wird weiter von Argument-Endpoints genutzt.
- Argument/Comment-Routes (`/xrpc/app.ch.poltr.argument.*`, `/xrpc/app.ch.poltr.comment.*`) — bleiben **echtes** XRPC, da Arguments/Comments tatsächlich ATProto-Records sind.
- Indexer — kennt Ballots nicht und braucht das auch nicht.

### 5b-5. AppView-Folder-Restrukturierung (Schichten in der Struktur sichtbar machen)

Heute liegt unter [services/appview/src/routes/ballots/ballots.py](../services/appview/src/routes/ballots/ballots.py) gemäß Header **"ballots, arguments, comments, likes, activity"** — fünf Verantwortlichkeiten in einer Datei, davon nur eine (Ballots) Basis-App. Die Folder-Trennung sollte die Schichten widerspiegeln:

**Neu:**

```
services/appview/src/routes/
├── ballots/                 # Basis-App — REST, kein XRPC
│   └── ballots.py           # NUR Ballot-Endpoints: /api/ballots*
├── deliberation/            # NEU — alles ATProto, XRPC
│   ├── __init__.py
│   ├── arguments.py         # aus ballots.py rausgezogen: argument.list, .get, .create
│   ├── comments.py          # aus ballots.py rausgezogen: comment.list, .create
│   ├── likes.py             # aus ballots.py rausgezogen: content.rating
│   ├── activity.py          # aus ballots.py rausgezogen: activity feed
│   └── reviews.py           # hierher verschoben aus routes/arguments/reviews.py
├── atproto/                 # bleibt — ATProto-protokollarisch (wellknown, feed, actor, ozone)
└── auth/                    # bleibt
```

`routes/arguments/` wird aufgelöst. FastAPI-Router-Registrierung in `src/__init__.py` (oder wo auch immer Router eingebunden werden) entsprechend anpassen. Imports aus `src/atproto/`, `src/core/`, `src/arguments/peer_review.py` bleiben unberührt.

### 5b-6. Frontend-Proxy-Erweiterung

[services/frontend/src/app/api/](../services/frontend/src/app/api/) hat heute nur den XRPC-Catch-all-Proxy `xrpc/[...path]`. Für die neuen `/api/ballots*`-REST-Routen kommt eine zweite Proxy-Route dazu:

```
services/frontend/src/app/api/
├── auth/                    # bleibt
├── xrpc/[...path]/          # bleibt — proxiet zu AppView XRPC (Deliberation)
└── poltr/[...path]/         # NEU — proxiet zu AppView REST (Basis-App)
```

`poltr/[...path]/route.ts` ist eine 1:1-Kopie des bestehenden xrpc-Proxies, nur mit anderem Target-Pfad. Auch in `app/api/poltr` müssen Auth-Cookies durchgereicht werden (das Pattern ist identisch).

Die Trennung ist im URL-Pfad sichtbar:
- `/api/xrpc/app.ch.poltr.argument.list` — Deliberation
- `/api/poltr/ballots?lang=de` — Basis-App

---

## 6. AppView — Write-API (Community-Arguments)

[services/appview/src/routes/ballots/ballots.py](../services/appview/src/routes/ballots/ballots.py) `create_argument()` (~Zeilen 817–877):

- Akzeptiere optionales `langs`-Feld im Request (Array; Default: `[<aktuelle UI-Locale des Users>]`).
- Schreibe `langs` mit in den ATProto-Record (Bluesky-Standard); `translations` bleibt leer (wird vom Worker gefüllt).
- DB-Status: `translation_status = 'pending'` (gesetzt durch Indexer beim Firehose-Event).

Analog für Comment-Erstellung (separate Datei je nach aktueller Struktur).

---

## 7. Background-Worker (Architektur, KI-Call später)

Neue Datei [services/appview/src/translation/translator.py](../services/appview/src/translation/translator.py) — Pattern wie [services/appview/src/arguments/peer_review.py](../services/appview/src/arguments/peer_review.py):

```python
# Skelett
async def _poll_loop():
    while True:
        interval = int(os.getenv("APPVIEW_TRANSLATE_POLL_INTERVAL_SECONDS", "30"))
        if os.getenv("APPVIEW_TRANSLATE_ENABLED", "false").lower() != "true":
            await asyncio.sleep(interval); continue
        await _process_batch()
        await asyncio.sleep(interval)

async def _process_batch():
    await _process_arguments_batch()    # inline-Variante (Arguments)

    # DISABLED: due to 
    # await _process_comments_batch()     # Sidecar-Variante (Comments)

async def _process_arguments_batch():
    # 1. SELECT … FROM app_arguments WHERE translation_status IN ('pending','partial')
    # 2. fehlende Sprachen = SUPPORTED_LANGUAGES - (langs ∪ translations[].lang)
    # 3. _translate_via_llm → Infomaniak Apertus (OpenAI-kompatibel, JSON-Prompt)
    # 4. putRecord mit erweitertem translations[] auf den Argument-Record selbst
    #    (community-Account hat Schreibrecht).
    # 5. KEIN direktes DB-Update — Firehose → Indexer macht das.
    pass

async def _process_comments_batch():
    # 1. SELECT c.uri, c.rkey, c.ballot_rkey, c.text, c.langs
    #      FROM app_comments c WHERE c.translation_status IN ('pending','partial')
    # 2. Pro Comment: missing = SUPPORTED_LANGUAGES - (c.langs ∪ existing sidecar langs)
    # 3. Für jede fehlende Sprache:
    #      - LLM-Call (_translate_via_llm → Infomaniak Apertus)
    #      - createRecord/putRecord auf collection 'app.ch.poltr.comment.translation'
    #        im community-Account des Ballots — composed rkey = f"{commentRkey}-{lang}"
    #      - Record-Body: { subject: {uri: c.uri}, ballot: ballot_rkey, lang, body, source:'ai', model, translatedAt }
    # 4. KEIN direktes DB-Update — Firehose → Indexer macht das.
    pass

def start_translation_loop(): …
def stop_translation_loop(): …
```

Start/Stop einbinden wo `peer_review` heute schon startet (Suche `start_peer_review_loop` im AppView). Env-Vars:

| Var | Default | Beschreibung |
|---|---|---|
| `APPVIEW_TRANSLATE_ENABLED` | `false` | Schalter |
| `APPVIEW_TRANSLATE_POLL_INTERVAL_SECONDS` | `30` | Poll-Intervall |
| `APPVIEW_TRANSLATE_BATCH_SIZE` | `20` | Max Records pro Lauf |
| `APPVIEW_TRANSLATE_BASE_URL` | `https://api.infomaniak.com` | Infomaniak AI Tools Basis-URL |
| `APPVIEW_TRANSLATE_PRODUCT_ID` | — | Infomaniak AI-Product-ID (`GET /1/ai`) |
| `APPVIEW_TRANSLATE_API_KEY` | — | Infomaniak Bearer-Token |
| `APPVIEW_TRANSLATE_MODEL` | `swiss-ai/Apertus-70B-Instruct-2509` | Chat-Modell (Apertus, CH-hosted) |

Der LLM-Call ist seit der Apertus-Integration **angeschlossen**: `_translate_via_llm`
ruft die OpenAI-kompatiblen Chat-Completions von Infomaniak AI Tools (Schweizer
Hosting, Datensouveränität — derselbe Provider wie die Calculator-Embeddings) mit
dem Schweizer Open-Modell **Apertus** auf. Strukturierte Ausgabe wird per
JSON-Prompt erzwungen (Infomaniak unterstützt kein forced tool-use, siehe
[doc/infomaniak.md](infomaniak.md)); transiente Gateway-Fehler (429/5xx) werden
mit 1/2/4 s Backoff wiederholt, permanente (400/401) sofort durchgereicht. Die
ganze Pipeline (DB → Worker → PDS → Indexer → DB) bleibt unverändert; geschrieben
wird ausschliesslich über `putRecord` auf den Community-Account.

---

## 8. Frontend

[services/frontend/src/i18n/config.ts](../services/frontend/src/i18n/config.ts): `locales` aus `NEXT_PUBLIC_POLTR_LANGUAGES` ableiten (siehe Sprachen-Konstanten-Sektion oben); `localeLabels` für `de`, `fr`, `it`, `rm`, `en` befüllen.

Argument-Komponenten ([services/frontend/src/app/(app)/ballot/[id]/arguments/feed/page.tsx](../services/frontend/src/app/(app)/ballot/[id]/arguments/feed/page.tsx), `booklet/page.tsx`, `[argRkey]/page.tsx`):

- Beim Fetch der Argument-Liste die Cookie-Locale als `?lang=`-Query mitgeben.
- AppView liefert bereits das passende `title`/`body`. Wenn `translationSource === 'ai'` oder `translatedFrom !== lang`: kleines Badge "Automatisch übersetzt aus DE" anzeigen (Übersetzungs-String für das Badge selbst in `messages/*.json`).
- Argument-Create-Form: Sprache standardmäßig aus aktueller Locale ableiten, kein zusätzliches UI nötig.

TypeScript-Typen in [services/frontend/src/types/ballots.ts](../services/frontend/src/types/ballots.ts) anpassen: bestehender `language`-Stub durch `langs: string[]`, `availableLangs: string[]`, `translationSource?: 'manual'|'ai'` ersetzen.

---

## Kritische Dateien (Zusammenfassung)

| Datei | Änderung |
|---|---|
| [lexicons/app/ch/poltr/ballot/argument.json](../lexicons/app/ch/poltr/ballot/argument.json) | `langs` (Bluesky-Standard) + `translations[]` + `#translation` def |
| lexicons/app/ch/poltr/comment/translation.json | **NEU** — Sidecar-Lexicon `app.ch.poltr.comment.translation` (single-lang-pro-record + subject-ref) |
| `app.ch.poltr.comment` (implizit, kein File) | Indexer liest neu `record.langs ?? ['de']`; kein `translations[]` |
| [services/cms/src/payload.config.ts](../services/cms/src/payload.config.ts) | `localization`-Block (5 Locales) |
| [services/cms/src/collections/Ballots.ts](../services/cms/src/collections/Ballots.ts) | `title`/`description`/`topic` `localized: true`, neues `originLanguage`-Feld, altes `language`-Feld entfernen |
| [services/cms/src/collections/OfficialArguments.ts](../services/cms/src/collections/OfficialArguments.ts) | `title`/`body` `localized: true`, neues `originLanguage`-Feld |
| [services/cms/src/lib/atproto-publish.ts](../services/cms/src/lib/atproto-publish.ts) | `buildArgumentRecord` dynamisch nach `originLanguage`, alle Locales laden |
| services/cms/src/components/TranslationStatus.tsx | **NEU** — Status-Indikator (DE ✓ FR ✗ …) für Liste + Sidebar |
| services/cms/src/migrations/`<ts>`_ballots_localized.ts | **NEU** — bestehende Ballot-Werte in `originLanguage`-Slot kopieren |
| [scripts/postgres/db-setup.sql](../infra/scripts/postgres/db-setup.sql) | `langs TEXT[]` + `translation_status` Spalten auf `app_arguments` und `app_comments`; `translations JSONB` **nur** auf `app_arguments`; **neue Tabelle `app_comment_translations`** für Sidecars |
| [services/indexer/src/db.js](../services/indexer/src/db.js) | `upsertArgumentDb` (inline), `upsertCommentDb` (nur langs + status), `upsertCommentTranslationDb` (Sidecar-Tabelle), `recomputeCommentTranslationStatus` (Helper) |
| [services/indexer/src/record_handler.js](../services/indexer/src/record_handler.js) | Neuer Handler für `app.ch.poltr.comment.translation` |
| [services/indexer/src/languages.js](../services/indexer/src/languages.js) | **NEU** — `SUPPORTED_LANGUAGES` aus `POLTR_LANGUAGES` Env-Var |
| [services/appview/src/core/languages.py](../services/appview/src/core/languages.py) | **NEU** — `SUPPORTED_LANGUAGES`, `DEFAULT_LANGUAGE` aus Env |
| [services/appview/src/routes/ballots/ballots.py](../services/appview/src/routes/ballots/ballots.py) | Schrumpft auf NUR Ballot-Endpoints, neue `/api/ballots*`-REST-Routen, flacher Serializer, `?lang=`+`?locale=all` an CMS |
| services/appview/src/routes/deliberation/{arguments,comments,likes,activity,reviews}.py | **NEU** — Splits aus ballots.py; XRPC-Routen für Deliberation; Arguments lang-aware (siehe §5a), Create akzeptiert `langs` |
| services/frontend/src/app/api/poltr/[...path]/route.ts | **NEU** — Proxy-Route für REST-Pfad (zu AppViews `/api/ballots*`); Pattern identisch zu `xrpc/[...path]` |
| [services/frontend/src/types/ballots.ts](../services/frontend/src/types/ballots.ts) | `BallotRecord` löschen, `BallotWithMetadata` → flacher `Ballot`-Type (mit `rkey`, `originLanguage`, `availableLangs`); Argument/Comment-Types unverändert |
| [services/frontend/src/lib/agent.ts](../services/frontend/src/lib/agent.ts) | `getBallot`/`listBallots` auf `/api/ballots*` umstellen, `lang`-Parameter |
| services/frontend/src/app/(app)/home/page.tsx, ballots/page.tsx, ballot/[id]/arguments/feed/page.tsx, ballot/[id]/arguments/booklet/page.tsx | `ballot.record.*` → `ballot.*`; `ballot.uri.split("/").pop()` → `ballot.rkey`; `ballot.record.text` → `ballot.description`; `ballot.record.language`-Badge durch `availableLangs`-UI ersetzen |
| [services/appview/src/translation/translator.py](../services/appview/src/translation/translator.py) | **NEU** — Background-Worker Skelett |
| [services/frontend/src/i18n/config.ts](../services/frontend/src/i18n/config.ts) | 5 Sprachen, neue `Locale`-Type |
| [services/frontend/src/types/ballots.ts](../services/frontend/src/types/ballots.ts) | Neue Response-Felder |
| Frontend Argument-Seiten | `?lang=` Query + Badge für AI-Übersetzung |

---

## Wiederverwendete bestehende Bausteine

- **`create_community_record` / `put_community_record`** in [services/appview/src/atproto/community.py](../services/appview/src/atproto/community.py) — Worker nutzt diese Funktionen für PDS-Writes mit community-Credentials.
- **Asyncio-Poll-Pattern** aus [services/appview/src/arguments/peer_review.py](../services/appview/src/arguments/peer_review.py) — Worker-Skelett 1:1 übernehmbar.
- **NaCl-SecretBox-Verschlüsselung** der community passwords → kein neuer Auth-Code nötig.
- **next-intl Cookie-basierter Locale-Resolver** in [services/frontend/src/i18n/request.ts](../services/frontend/src/i18n/request.ts) — liefert die Sprache, mit der Frontend AppView ruft.

---

## Verifikation (End-to-End)

1. **Migration**: `psql -f scripts/postgres/db-setup.sql` gegen leere DB; bestätige neue Spalten & Index.
2. **CMS-Manuelle Übersetzung**:
   - In Payload-UI ein bestehendes Official Argument öffnen, Locale-Switcher auf "fr" → französischen Title/Body eintragen → speichern.
   - Status auf `published` setzen.
   - `goat record list --collection app.ch.poltr.ballot.argument ballot-<id>.id.poltr.ch` → Record sollte `langs: ['de']` + `translations: [{lang: 'fr', source: 'manual', …}]` enthalten.
   - DB-Check: `SELECT langs, jsonb_array_length(translations), translation_status FROM app_arguments WHERE uri = '…'` → `translations` mit 1 Eintrag, Status `partial`.
3. **API-Read mit Sprachwahl**:
   - `curl 'https://app.poltr.info/xrpc/app.ch.poltr.argument.get?uri=…&lang=fr'` → französischer Titel im Response, `translationSource: 'manual'`, `langs: ['de']`, `availableLangs: ['de','fr']`.
   - `…&lang=it` → Fallback auf `de`-Original, `availableLangs: ['de','fr']` unverändert.
4. **Frontend**:
   - Locale-Cookie auf `fr` setzen, Ballot-Seite öffnen → französische Variante des Arguments sichtbar; Badge "Original auf Deutsch" bei jenen ohne FR-Übersetzung.
5. **Worker (ohne KI)**:
   - `APPVIEW_TRANSLATE_ENABLED=true` setzen, ein neues Community-Argument auf `de` erstellen → DB-Status `pending` → Worker pickt es auf → loggt "TODO: KI noch nicht angeschlossen", setzt Status nicht auf `complete` (idle).
   - Bestätigt dass Such-Query, Batching, community-Session, putRecord-Pfad funktionieren.
6. **Worker (mit KI, Phase 2)**: nach Anthropic-Integration: derselbe Test → nach max. 2 Poll-Zyklen erscheinen 4 Übersetzungen im Record, DB-Status `complete`, Frontend zeigt alle Sprachen.

---

## Sprache hinzufügen — Erweiterungs-Checkliste

Wenn künftig eine 6. Sprache (z.B. `pt`) ergänzt werden soll:

1. **Helm/ConfigMap:** `POLTR_LANGUAGES=de,fr,it,rm,en,pt` (+ `NEXT_PUBLIC_POLTR_LANGUAGES`).
2. **CMS [payload.config.ts](../services/cms/src/payload.config.ts):** neue Locale-Definition in `localization.locales`; Payload-Migration laufen lassen (legt `title_pt`, `body_pt` Spalten in den Payload-DB-Tabellen an).
3. **Frontend:** Datei `services/frontend/messages/pt.json` anlegen + Inhalte übersetzen.
4. **Rolling-Restart:** CMS, AppView, Indexer, Frontend ziehen die neuen Env-Vars.
5. **Backfill (automatisch):** Der Indexer setzt bei nächstem Firehose-Event für bestehende Records `translation_status` von `'complete'` → `'partial'` (eine Sprache fehlt jetzt). Worker pickt sie auf und ergänzt `pt`-Übersetzungen via KI.
   - Falls Backfill sofort getriggert werden soll (statt auf nächsten Edit zu warten):
     ```sql
     UPDATE app_arguments SET translation_status = 'partial'
     WHERE translation_status = 'complete' AND NOT 'pt' = ANY(SELECT t->>'lang' FROM jsonb_array_elements(translations) t);
     ```

**Was NICHT zu tun ist:**
- ❌ Lexicon-JSON anfassen (`format: "language"` akzeptiert jeden BCP-47-Code).
- ❌ DB-Schema-Migration für `app_arguments`/`app_comments` (TEXT[] + JSONB sind offen).
- ❌ Indexer-Status-Logik anpassen (liest aus `SUPPORTED_LANGUAGES`).
- ❌ Worker-Batch-Logik anpassen (liest aus `SUPPORTED_LANGUAGES`).
- ❌ ATProto-Records re-schreiben (vorhandene Übersetzungen bleiben gültig).

**Einzig unvermeidlich manuell:** Payload-Locales-Block + Migration, neue `messages/<lang>.json`-Datei mit Inhalten. Das ist Payload-/next-intl-Standard, nicht POLTR-Limitierung.

---

## Out of Scope

- Eigentlicher Anthropic-API-Call im Worker (Stub bleibt).
- Übersetzung der `messages/*.json` UI-Strings für FR/IT/RM (separate Aufgabe — siehe [TRANSLATIONS.md](TRANSLATIONS.md)).
- Migration der bestehenden `Ballots.language`-1:1-Struktur auf Payload Localization.
- Rumantsch-Sonderbehandlung (Idiomwahl, Modell-Qualität) — beim KI-Schritt klären.
- Retry/Backoff/Rate-Limit-Handling für KI-Calls.
- Moderation/Qualitätssicherung von KI-Übersetzungen.
