# Top-down Taxonomy — TODO

Arbeitsliste für die Themen-Baum-Section (`services/calculator/src/topdown`,
`app_topic_node` / `app_topic_membership`). Siehe auch
[`argument_clustering.md` §3.1](argument_clustering.md) und das Memory
`project_topdown_taxonomy`.

## Workflow (gedacht)
`induce` läuft **einmal am Projektstart**, **nur auf offizielle Argumente** (`official_only:true`, Default) → flaches Skelett (die Hauptäste). Danach **nur noch inkrementell**: `classify` (Community-Argumente einhängen) + `grow` (Tiefe + neue Hauptäste, wo's überläuft). Manuelle Änderungen am Baum sind erlaubt — `classify` respektiert sie (klassifiziert gegen den *aktuellen* DB-Baum). Keys/Permalinks bleiben über `classify`/`grow`/manuelle Edits stabil; nur der seltene Full-Rebuild (`induce`) setzt sie zurück — was ok ist, weil er einmalig läuft.

## Stand (bereits gebaut)
- DB: `app_topic_node` (Adjazenzliste) + `app_topic_membership` (Code/Argument → Knoten, mit `confidence`/`stance`). Ein stabiler Baum pro Ballot, inkrementell.
- Endpoints: `POST /api/topdown/induce` (Neubau + persist/Replace), `POST /api/topdown/classify` (neue Argumente einhängen), `POST /api/topdown/grow` (Überlauf-Split: Unterthemen + neue Hauptäste), `GET /api/topdown/tree`.
- Seed der Wurzelthemen aus den offiziellen Argumenten; Codes (mono-thematisch) sind die Klassifikations-Einheit → Multi-Membership.

---

## 1. CMS-Admin: Ballot bekommt ein „Taxonomy"-Kapitel
Ziel: im Payload-Ballot-Editor (`services/cms`) ein Panel, das die Taxonomie-Pflege bedienbar macht. **v1 gebaut** (`components/TaxonomyPanel.tsx` + UI-Feld `taxonomy` in `Ballots.ts`), in der CMS-Dev-Umgebung noch zu verifizieren.

- [x] **Custom-UI-Komponente** (`TaxonomyPanel.tsx`, Muster wie `TranslationStatus`).
- [x] **Status quo + Vorschau nebeneinander** (`GET /api/topdown/tree`; induce mit `persist:false`).
- [x] **Buttons:** „Neu bauen (Vorschau)", „Vorschau übernehmen" (`POST /api/topdown/persist`), „Community einsortieren" (`/classify`), „Wachsen lassen" (`/grow`).
- [x] **Abdeckung:** `GET /api/topdown/status` (gebaut) → codierte/uncoded Argumente + „noch nicht im Baum".
- [ ] **CORS/Auth entscheiden (offen):** Panel ruft den Calculator direkt (`NEXT_PUBLIC_CALCULATOR_URL`, Default `calculator.poltr.info`). **Nötig:** den CMS-Admin-Origin in `CALCULATOR_ALLOW_ORIGINS` aufnehmen — *oder* (sauberer, später) ein **server-seitiger Payload-Proxy**, damit der Calculator intern bleibt und nur eingeloggte Admins teure LLM-Läufe auslösen können.
- [ ] In CMS-Dev verifizieren (Komponente lädt, Buttons funktionieren).

## 2. Langlebige Branch-IDs (Permalinks)
Problem: `app_topic_node.id` ist ein Serial, das bei jedem `/induce` (DELETE+INSERT) **neu vergeben** wird → Permalinks brechen beim Neubau.

**Entscheidung:** gefrorener Slug + inkrementell als Hauptpfad. **Gebaut** (Migration `key`-Spalte muss noch laufen).
- [x] **Spalte `key`** (Slug mit `-`; `_slugify`/`_unique_slug` in `db.py`, Unique-Index `(ballot_rkey, key)`). In `persist_topic_tree` + `split_node` gesetzt, in `fetch_topic_tree` ausgegeben.
- [x] **Split bewahrt Keys:** `split_node` lässt den Elternknoten (+ Key) bestehen, legt nur Kinder mit neuen Keys an (gegen bestehende deduped). Set-once.
- [ ] Migration `migrate-topics.sql` (key-Spalte) gegen die DB laufen lassen.
- [ ] Permalink-Form definieren (z.B. `/vorlage/663.1/thema/<key>`).
- [ ] **Inkrementell als Hauptpfad:** nach dem ersten `/induce` nur noch `classify`/`grow` (mutieren in-place → Knoten behalten ihren Key für immer → Permalinks stabil). Full-Rebuilds bewusst selten.
- [ ] **Knoten-Matching = zurückgestellt:** nur nötig, falls Full-Rebuilds doch vorkommen — dann neue Knoten den alten per Name-/Pfad-/Member-Überlappung zuordnen und Keys übertragen (heuristisch). Erst bauen, wenn wirklich gebraucht.
- [ ] Permalink-Form definieren (z.B. `/vorlage/663.1/thema/<key>`).

## 3. `note`-Feld einbeziehen (Kontext + DB)
Aktuell geht nur das Code-*Label* in die Klassifikation; die `note` (Paraphrase/Zitatstelle) liegt brach.

- [ ] **Klassifikation:** `note` als Kontext in die `classify`-User-Message mitgeben (`[id] code — note`).
- [ ] **DB:** Spalte `note` in `app_topic_membership` (Migration + `db-setup.sql`), damit Frontend/Analyse den Kontext hat.
- [ ] `load_inputs`/`entries` um `note` erweitern.

## 4. Qualitäts-Indikatoren in die DB (node-level + global)
Aktuell: `confidence` + `stance` je Membership.

**Entscheidung: Aggregate NICHT denormalisieren** (Baum mutiert inkrementell → sonst Grandchild-Kaskade: jede tiefe Änderung müsste alle Vorfahren hochaktualisieren). Stattdessen **on-read aggregieren**.
- [ ] `confidence`/`stance` bleiben **pro Membership** (die Wahrheit).
- [ ] **Node-Aggregate (code_count, argument_count, avg_confidence, pro_share, child_count) on-read** berechnen — rekursive CTE oder im Code nach dem flachen Laden (Baum ist klein → billig). Ggf. als View/Helper `fetch_topic_tree_with_stats`.
- [ ] **Wurzel (Node 0)** trägt nur **nicht-driftende Build-Metadaten:** Modell, `generated_at`, Prompt-Version. (Spalten auf `app_topic_node`, nur für die Wurzel gesetzt — ersetzt die „eigene Run-Tabelle".) Driftende Globals (Coverage, „andere") ebenfalls on-read.
- [ ] *(Kontrast: bei `app_taxonomy_*`/`app_arguments_axis` ist denormalisiert OK, weil pro-Lauf write-once. Der Themenbaum ist das Gegenteil.)*

## 5. Frontend-Übergabe + Darstellung
Noch offen / wenig spezifiziert.

- [ ] **Baum pro Vorlage** rendern (Navigation, einklappbar).
- [ ] **Argument → Themen-Pfad** an `argument.get` mitgeben (analog zum bestehenden `axes`-Feld, aber als Pfad `Energiekosten → Bezahlbarkeit → Abgaben`).
- [ ] Pro Knoten: pro/contra-Argumente darunter (die „Deliberations"-Sicht).
- [ ] Design klären (Detailansicht, Filter, Permalink-Sprünge auf Knoten).

---

## Später / bewusst zurückgestellt
- **Experiment „mit vs. ohne Open Codes":** ganze Argumente multi-label klassifizieren vs. Code-Pfad — Abdeckung + Sauberkeit vergleichen. (Vorerst nicht; Codes liefern Multi-Membership + mono-thematische Disambiguierung, siehe §3.1.)
- **Signierte ATProto-Snapshots** (öffentliche, zitierbare Diskurs-Struktur) — eingefrorener Snapshot pro Version unter dem Governance-Konto. Bewusst zurückgestellt.
- **Stance-Schicht je Knoten** (pro/contra-Aggregat, wie `app_arguments_axis`).
