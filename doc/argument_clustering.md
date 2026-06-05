# Argument-Clustering / emergente Taxonomie

Dieses Dokument hält fest, **was** der Calculator-Service zur thematischen
Strukturierung von Argumenten tut, **warum** wir es so gebaut haben, und welche
**Alternativen** es gibt — insbesondere für das offene Problem „verlässlich
wenige, trennscharfe Themen-Achsen".

Code: [`services/calculator/src/tags/`](../services/calculator/src/tags/) und
[`services/calculator/src/llm/`](../services/calculator/src/llm/).

---

## 1. Ziel und Rahmenbedingungen

POLTR sammelt zu jeder Vorlage frei formulierte Argumente (ATProto-Records
`app.ch.poltr.ballot.argument`, im Governance-Repo der Vorlage). Wir wollen aus
diesem Strom **emergent** eine thematische Struktur gewinnen — ohne eine vorab
festgelegte Taxonomie, weil sich die relevanten Themen pro Vorlage unterscheiden
und sich im Verlauf der Debatte verschieben.

Für eine demokratische Plattform gelten zwei harte Anforderungen:

- **Transparenz / Nachvollziehbarkeit.** Jede Zuordnung muss erklärbar und
  versioniert sein. Wer wann unter welchem Taxonomie-Stand wie eingeordnet
  wurde, bleibt rekonstruierbar (Vertrauen).
- **Reihenfolge- und Manipulations-Robustheit.** Das Ergebnis soll nicht davon
  abhängen, in welcher Reihenfolge Argumente eintrudeln.

Der Service ist bewusst **zustandslos und ATProto-frei** in der Rechenlogik: er
liest Argumente, klassifiziert sie, gibt das Ergebnis zurück. Persistenz der
Records bleibt bei PDS/Indexer.

---

## 2. Zwei implementierte Varianten

Wir haben zwei Verfahren gebaut, die dasselbe Ziel auf unterschiedliche Weise
angehen. Beide sind über REST erreichbar und legen ihren Output in der
[DB-Persistenz](#7-persistenz-versionierte-taxonomie-in-der-db) ab.

### Variante A — inkrementelle Induktion (`POST /api/tags/induce`)

Order-dependent, „LLM trägt die Hauptlast". Für jedes Argument einzeln:

1. **classify-or-propose**: Das LLM sieht das Argument **und die bisher aktiven
   Tags** und entscheidet: in einen bestehenden Tag einordnen (`assign`) oder
   einen neuen vorschlagen (`propose`).
2. Ein `assign` wird nur akzeptiert, wenn die genannte `tag_id` real existiert
   **und** die Confidence über `assign_threshold` (Default 0.6) liegt — sonst
   wird ein neuer Tag erzeugt. Schutz gegen halluzinierte IDs und unsichere
   Zuordnungen.
3. **reorganize** (am Ende): zu kleine Tags (`< merge_when_smaller_than`, Default
   2) werden `retired`, zu große (`> split_when_bigger_than`, Default 12) per LLM
   in Untertags gesplittet. Nichts wird gelöscht; Tags wechseln nur den Status
   (`active`/`retired`/`split`) und tragen `derived_from`/`superseded_by` →
   Abstammungsgraph bleibt erhalten.

**Eigenschaften.** Einfach, gut nachvollziehbar (jeder Schritt liefert ein
`rationale`). Aber: **reihenfolge-abhängig** — frühe Argumente prägen die
Taxonomie, weil späte gegen einen schon gefüllten Tag-Bestand entscheiden.
Methodisch ist das eher „Klassifikation gegen eine wachsende Codeliste" als
echtes induktives Codieren.

Code: [`TagSystem.ingest` / `reorganize`](../services/calculator/src/tags/tag_system.py).

### Variante B — Batch / Grounded Theory (`POST /api/tags/induce-batch`)

Order-independent (strukturell), nach dem Grounded-Theory-Muster **Open Coding →
Axial Coding**. Drei Phasen:

1. **Open Coding** — jedes Argument wird **unabhängig** in 1–`max_codes` (Default
   3) kurze inhaltliche Codes zerlegt. Kein Taxonomie-State, keine anderen
   Argumente im Prompt → kein Reihenfolge-Effekt. Läuft parallel (bis zu
   `_OPEN_CODING_CONCURRENCY = 5` gleichzeitig) und ist **gecacht** (siehe §5).
2. **Axial Coding** — **alle** Codes werden *gemeinsam* zu wenigen übergeordneten
   Themen/Achsen gruppiert. Das LLM sieht den **Code-Pool** auf einmal, nicht die
   Argumente. Das ist der methodisch korrekte Punkt: *Axial Coding gruppiert
   Codes, nicht Fälle.*
3. **Zuordnung** — jedes Argument wird **allen** Themen seiner Codes zugeordnet
   (Mehrfach-Label möglich). Codes, die das Axial Coding keinem Theme zuwies,
   landen in einem expliziten Auffangknoten `Nicht gruppiert`.

**Eigenschaften.** Die *Struktur* ist reihenfolge-unabhängig (Phase 1 pro
Argument, Phase 2 holistisch). Multi-Label spiegelt wider, dass ein Argument
mehrere Topoi anspricht. Die *Label-Formulierung* variiert dennoch von Lauf zu
Lauf — das ist LLM-Nichtdeterminismus, kein Reihenfolge-Effekt (siehe §6).

Code: [`TagSystem.batch_induce`](../services/calculator/src/tags/tag_system.py),
[`AnthropicLLM.open_code` / `axial_group`](../services/calculator/src/llm/anthropic_client.py).

> **Entscheidung:** Wir setzen produktiv auf **Variante B**. Open Coding trennt
> Inhaltserfassung (pro Argument, cachebar) sauber von der Themenbildung (über
> den ganzen Bestand) und ist methodisch näher an dem, was wir eigentlich wollen.

---

## 3. Warum „Codes clustern, nicht Argumente"

Ein zentraler Designpunkt: Die axiale Phase operiert auf dem **Pool aller Open
Codes**, nicht auf den Argumenten.

```python
# tag_system.py – Phase 2
themes = self.llm.axial_group(
    [{"code": l, "note": code_note[l]} for l in all_codes])
```

Das ist nicht nur methodisch korrekt, sondern auch praktisch besser: Würde man
die *Argumente* gruppieren, fände man „Argument-Cluster". Indem man die *Codes*
gruppiert, findet man die **quer über die Argumente verlaufenden Achsen** — die
Finanzierungs-Achse, die Machbarkeits-Achse, die Gerechtigkeits-Achse —, und ein
einzelnes Argument kann auf mehreren Achsen liegen.

Wichtig: Das ist die **Grundarchitektur** von Variante B, kein Zusatzfeature.
Was sich in frühen Tests „argument-aligned" anfühlte (10 Themen für 10
Argumente), war **kein** Struktur-Defekt, sondern eine **zu granulare
Themenzahl** — siehe §8.

### 3.1 Bottom-up vs. Top-down: die Rolle der Codes hat sich verschoben

Der obige Ansatz (Variante B / Achsen) ist **bottom-up**: er verlangt, dass die
Codes **clustern** — und genau daran ist er gescheitert. Auf realen Daten
wiederholt sich praktisch kein Code (`freq = 0`, jeder Code ein Unikat), also gibt
es nichts zu verdichten; das Erzwingen auf wenige Bündel produziert Mega-Bündel
(Sammelbecken) bzw. einen riesigen Rand (§9, §9.1).

Im **top-down**-Ansatz (Themen-Baum, `services/calculator/src/topdown`) müssen die
Codes **nicht clustern**: das LLM **klassifiziert jeden Code in ein Thema**
(top-down in einen aus den offiziellen Argumenten geseedeten Baum). Damit ist das
„die Codes sind zu spezifisch"-Problem, das bottom-up gebrochen hat, **irrelevant
geworden** — die Codes müssen nur **sinnvolle Aspekte** sein, nicht wiederkehren.

Die Codes bleiben in beiden Welten die **atomare Einheit, die Multi-Thema-
Zuordnung ermöglicht** (ein Argument liegt über seine mehreren Codes auf mehreren
Achsen/in mehreren Themen). Aber ihr *Anspruch* ist ein anderer:

| | bottom-up (Achsen) | top-down (Themen-Baum) |
|---|---|---|
| Codes müssen … | **clustern** (Dubletten finden) | nur **sinnvolle Aspekte** sein |
| `freq = 0` ist … | **fatal** (nichts verdichtbar) | **egal** (es wird klassifiziert) |
| Code → Struktur via | Embedding-Bündelung | LLM-Klassifikation in den Baum |

---

## 4. Stabile Code-IDs für die axiale Zuordnung (gelernte Lektion)

Erste Implementierung der axialen Phase ließ das LLM pro Theme die zugehörigen
**Code-Strings** zurückgeben, und wir matchten diese gegen die Open-Coding-Labels.
Ergebnis im echten Lauf: **alle 36 Codes landeten in „Nicht gruppiert"**.

Ursache: Das LLM gibt Code-Strings beim Gruppieren **leicht umformuliert** zurück
(„Steuerbelastung" → „Steuerliche Belastung"). Exakter String-Abgleich scheitert,
alles fällt in den Auffangknoten.

**Fix:** Den Codes vor dem Axial-Call **stabile IDs** (`c01`, `c02`, …) geben und
die Gruppierung über IDs auflösen. Das LLM referenziert nur noch IDs, das Mapping
ist exakt. Die `TagSystem`-Schnittstelle blieb unverändert (sie bekommt weiterhin
Themen mit Original-Labels zurück; die Übersetzung ID→Label passiert im Client).

Lehre: **Niemals die freitextliche LLM-Ausgabe als Join-Key gegen einen früheren
LLM-Output verwenden.** IDs einführen.

Code: [`AnthropicLLM.axial_group`](../services/calculator/src/llm/anthropic_client.py).

---

## 5. Open-Coding-Cache

> **Stand der Umsetzung:** Open Coding läuft produktiv im **Cron-Worker**
> (`/opencoding`), der die Codes **persistent** in `app_argument_open_codes`
> ablegt (DB = Cache, key = `argument_cid` + `coder_signature`). `/induce-batch`
> **generiert keine Codes mehr**, sondern liest die persistierten und macht nur
> Axial Coding. Der unten beschriebene in-memory-Cache (`open_code_cache.py`) war
> die ursprüngliche Form und ist jetzt ungenutzt — das Prinzip (Schlüssel/
> Invalidierung) gilt aber 1:1 für die DB-Variante.

Open Coding ist **pro Argument unabhängig** → das Ergebnis hängt nur ab von
`(Text, max_codes, Modell, Prompt)`. Daraus folgt: man muss alte Argumente nie
neu codieren, egal wie viele neue dazukommen.

- **Schlüssel:** `sha256(coder_signature | max_codes | text)`.
  - `text` = Inhalt (Titel + Body) → ändert sich das Argument, ändert sich der
    Hash → der Cache invalidiert sich selbst (entspricht dem `cid` eines
    ATProto-Records).
  - `coder_signature` = `<backend>:<modell>:<hash(open-prompt)>` → Modell- oder
    Prompt-Wechsel invalidiert ebenfalls automatisch.

> **Modell-Aufteilung:** Open Coding läuft auf **Infomaniak `google/gemma-4-31B-it`**
> (mengenintensiver Schritt; OpenAI-kompatible Chat Completions, JSON per Prompt),
> Axial Coding auf **Anthropic Claude**. Wechsel des Open-Coding-Backends/-Modells
> ändert die `coder_signature` → bestehende Codes werden automatisch neu codiert.
- **Speicher:** prozess-lokal, in-memory, max. 5000 Einträge. Geht bei
  Pod-Restart verloren (bewusst simpel).
- **Transiente Fehler werden nicht gecacht:** ein LLM-Fehler-Fallback
  (`OPEN_CODE_ERROR_NOTE`) wird übersprungen, damit ein API-Aussetzer nicht
  festgeschrieben wird.
- Die Antwort meldet `open_coding_cache: {hits, misses, size}`.

Verifiziert: derselbe Argumentbestand → 2. Lauf 0 Open-Coding-Calls (nur der eine
Axial-Call); +3 neue Argumente → nur 3 neue Calls.

**Die axiale Phase wird bewusst NICHT gecacht.** Sie ist holistisch — kommen neue
Codes hinzu, kann sich die ganze Themenstruktur verschieben. Genau das ist die
Voraussetzung für die Reihenfolge-Unabhängigkeit. Der Cache spart die teure
N-Call-Phase 1, nicht den einen Axial-Call.

Code: [`open_code_cache.py`](../services/calculator/src/tags/open_code_cache.py).

> **Ausbaupfad:** Der Cache ist heute prozess-lokal. Für Persistenz über Restarts
> und Replicas hinweg wäre eine Postgres-Tabelle (`argument_open_codes`, key =
> `cid`) der nächste Schritt — betrifft nur dieses Modul.

---

## 6. Determinismus, Reproduzierbarkeit, Versionierung

- **Struktur vs. Wortlaut.** Variante B ist *strukturell* reihenfolge-unabhängig.
  Die Themen-*Labels* variieren trotzdem zwischen Läufen, weil das LLM
  nicht-deterministisch ist. Die Gruppierung (welche Codes zusammenfallen) ist
  stabiler als ihre Benennung.
- **Versionierung.** Jede Zuordnung trägt die `taxonomy_version` ihres
  Entstehungszeitpunkts; Tags wechseln nur den Status statt gelöscht zu werden.
  So bleibt jeder Stand auditierbar.
- **Snapshots.** Jeder Lauf wird abgelegt (§7), sodass sich zwei Läufe vergleichen
  lassen und ein einmal erzeugtes Ergebnis stabil referenzierbar ist.

---

## 7. Persistenz (versionierte Taxonomie in der DB)

Jeder `/induce-batch`-Lauf schreibt sein Ergebnis **versioniert** in vier
Tabellen (`app_taxonomy_run` / `axis` / `bundle` / `membership`) plus einen Rollup
`app_arguments_axis`. Ein Lauf = eine Version pro Ballot; die „aktuelle" Taxonomie
= der jüngste Run. Die Antwort trägt `taxonomy_run_id`. Damit ist die frühere
in-memory-Snapshot-Historie hinfällig und wurde entfernt.
Details: [`services/calculator`](../services/calculator/).

**`app_arguments_axis` (Argument → Achse, abgeleitet ohne LLM).** Analog zu
`app_argument_open_codes`, aber je Lauf: pro `(run, argument, axis)` steht der
**Pol** (spricht das Argument fürs a- oder b-Ende?). Hergeleitet aus der
Membership: Confidence-gewichtete Mehrheit der Code-Pole des Arguments auf dieser
Achse — kein zusätzlicher LLM-Call. `conflict=true`, wenn Codes desselben
Arguments auf *derselben* Achse auf a UND b ziehen (genau die Validierung aus
§10.2). Zusätzlich `stance` (pro/contra zur Vorlage), `code_count`, `confidence`.
Wird aktuell am Ende von `/induce-batch` geschrieben; später als eigenständige,
LLM-freie Funktion gedacht.

**Denormalisierte Qualitätsmetriken.** Beim Schreiben werden aus der
Faktentabelle Zähler abgeleitet und direkt an Achse/Bündel gehängt (kein Join für
die Auswertung nötig): `app_taxonomy_axis.bundle_count` / `argument_count` /
`code_count` (Bündel bzw. distinct Argumente/Codes je Achse) und
`app_taxonomy_bundle.code_count` (distinct Codes je Bündel). Nützlich für die
Qualitätsmessung — z.B. fällt eine Achse mit auffällig hohem `code_count`/
`argument_count` (Sammelbecken, §9.1) sofort auf, ohne die Memberships zu
aggregieren.

**Lauf-weite Indikatoren & Confidence/Kohäsion.** `app_taxonomy_run` speichert
die Stage-0/Stage-1-Kennzahlen des Laufs (`stage0_applied`/`_kept`/`_margin`,
`prebundle_backend`/`_target`/`_rounds`/`_final_floor`/`_capped`/`_max_size`/
`_max_bundle`) — damit ist jeder Lauf selbst-beschreibend und Qualität über Läufe
vergleichbar (z.B. `prebundle_final_floor` niedrig ⇒ stark erzwungene Bündel).
Dazu `arguments_total` und **`arguments_unassigned`** = codierte Argumente, die
auf KEINER echten Achse landeten (alle Codes nur in Rand/ungrouped) — ein direktes
Abdeckungs-/Qualitätsmerkmal (663.1: 3 von 58 ≈ 5%).
Pro Membership: `confidence` (Open-Coding-Confidence des Codes). Pro Bündel:
`avg_confidence` (Ø der Member) und **`cohesion`** = mittlere paarweise
Ähnlichkeit der Member (Cosinus bei embedding, Jaccard bei lexical; NULL bei
Singletons). Die Kohäsion ist der *granulare* Bruder von `final_floor`: ein
Bündel mit `cohesion ≥ floor` (≈ 0.72) bündelt echte Dubletten, eins darunter ist
ein erzwungenes Mini-Becken (§9, Größen-Cap) — direkt abfragbar statt nur global.

**Haltung (PRO/CONTRA).** Jede Membership trägt die Haltung des Arguments
(`app_taxonomy_membership.stance` ∈ `pro`/`contra`, aus `app_arguments.type`).
Daraus aggregiert: `app_taxonomy_axis.pro_share` = Anteil PRO unter den *distinct*
Argumenten der Achse (0..1; unbekannte Haltung zählt in den Nenner, nicht als PRO;
NULL bei leerer Achse). Zeigt, ob ein Streitpunkt eher von Befürwortern oder
Gegnern getragen wird — eine Achse nahe 0 oder 1 ist einseitig belegt, nahe 0.5
echt umstritten.

---

## 8. Das offene Problem: verlässlich wenige, trennscharfe Achsen

Auch nachdem die axiale Phase auf Codes operiert (§3) und der Prompt auf „wenige
Achsen" geschärft wurde, bleibt die **Themenzahl nicht deterministisch**: In Tests
ergaben 5 Argumente / 18 Codes → 7 Themen, 8 Argumente / ~24 Codes → 9 Themen.
Das Ziel ist eher „verlässlich ~5 echte Achsen".

### 8.1 Leitkriterium: inhaltlich definierte Trennlinien (nicht latent)

> **Kriterium.** Wir wollen *wirklich inhaltlich sauber getrennte Dimensionen,
> nicht latent* — die **Trennlinien selbst müssen inhaltlich definiert sein,
> nicht bloß nachträglich benannt.**

Das ist nicht dasselbe Ziel wie „verlässlich ~5 Achsen" (Mengen-Stabilität).
Es ist ein **strengeres** Ziel und es **ändert die Optimierung**. Entscheidend
ist die Richtung des Verfahrens:

- **Induktiv-latent (verworfen):** *erst* gruppieren — im Vektorraum oder
  LLM-intern —, *dann* labeln. Die Grenze entsteht latent (Dichte/Geometrie/
  Modell-Innenleben), das Label ist post-hoc. Man kann nicht angeben, *warum* die
  Grenze genau dort liegt, ausser „die Punkte lagen halt nah beieinander".
- **Deduktiv-explizit (gefordert):** *erst* die Dimensionen als inhaltliche
  Kriterien benennen (Name **+ Abgrenzungskriterium**: was fällt rein, was grenzt
  sie von den Nachbarachsen ab), *dann* die Codes danach zuordnen. Die Trennlinie
  **ist** das ausgesprochene Kriterium.

Nur das zweite erfüllt das Kriterium. Es passt zudem zur Transparenz-Anforderung
aus §1: ein **explizit ausformuliertes Achsen-Schema** ist menschlich prüf- und
begründbar (und versionierbar als Snapshot); eine latente Embedding-Partition ist
es nicht — sie lässt sich Bürger:innen nicht ehrlich rechtfertigen.

### 8.2 Optionen, gegen das Kriterium bewertet

| Option | Wie entstehen die Trennlinien? | Inhaltlich definiert? | Verdikt |
|--------|--------------------------------|-----------------------|---------|
| **3. Embedding-Clustering** (HDBSCAN/k-means → LLM labelt) | latent: Dichte/Geometrie im Vektorraum | **nein** (per Konstruktion latent + post-hoc benannt) | **entfernt** |
| **1. Einfacher Axial-Pass** (`max_themes`, cluster-then-describe) | LLM gruppiert implizit, Beschreibung danach | nur schwach (Kriterium bleibt im Modell) | nur als Guardrail (Anzahl), nicht als Mechanismus |
| **Explizites Achsen-Schema** (Dimensionen + Abgrenzungskriterien zuerst, dann zuordnen) | das ausgesprochene Kriterium IST die Grenze | **ja** | **Zielmechanismus** |

**Option 3 (Embedding-Clustering) — als Achsen-Definer entfernt.** Sie war der
frühere „Zielzustand", aber *für ein anderes Ziel*: Mengen-Stabilität (`k` fix
oder aus der Dichte). Genau ihr Hebel verletzt das neue Kriterium: die Trennlinien
sind latente Geometrie, das LLM benennt sie nur noch *nachträglich*. Als
**Mechanismus, der die Achsen definiert**, ist sie damit raus.

> **Wichtige Differenzierung (siehe §9):** Embedding-Clustering ist nur als
> *Achsen-Definer* verworfen. Als **gekapselte Vorbündelung** (Stage 1 des
> zweistufigen Pfads) ist es legitim — dort trifft es keine inhaltliche
> Endentscheidung, sondern sortiert nur Dubletten vor, die Stage 2 inhaltlich
> überprüft. Der Hook `reorganize_with_clustering` ist deshalb **nicht obsolet**,
> sondern für genau dieses Embedding-Pre-Bundling wiederbelebbar.

**Einfacher Axial-Pass / `max_themes`.** Das LLM gruppiert hier inhaltlich, aber
das Abgrenzungskriterium bleibt implizit im Modell und die Beschreibung wirkt
nachgereicht. Es erfüllt das Kriterium nur schwach. `max_themes` /
`min_codes_per_theme` bleiben als **Guardrails** für die Achsenzahl sinnvoll,
sind aber kein Ersatz für inhaltlich definierte Grenzen.

**Explizites Achsen-Schema (Zielmechanismus).** Methodisch das *Selective Coding*
der Grounded Theory, hier deduktiv gewendet: Das LLM formuliert in einem ersten
Schritt eine kleine Menge benannter Dimensionen **mit Abgrenzungskriterien**
(ein reviewbares „Achsen-Schema"), das persistiert/versioniert wird; danach werden
die Codes **deduktiv** gegen dieses Schema zugeordnet. Die Trennlinie ist das
formulierte Kriterium — content-defined und auditierbar. Die LLM-Nichtdeterminismus
betrifft dann nur noch das *Schema selbst*; ist es einmal gewählt und als Snapshot
festgehalten, ist die Zuordnung stabil und nachvollziehbar.

### Empfehlung / Roadmap (unter dem Leitkriterium)

- **Als Achsen-Definer entfernt: Embedding-Clustering (alt „Option 3").**
  Verletzt das Kriterium (latente Grenzen). Als gekapselte Vorbündelung (§9
  Stage 1) hingegen legitim — der Hook bleibt dafür reserviert.
- **Zielmechanismus: explizites, versioniertes Achsen-Schema** (Dimensionen +
  Abgrenzungskriterien zuerst, dann deduktive Zuordnung). Ersetzt das bisherige
  „cluster-then-describe" der axialen Phase.
- **Guardrails behalten:** `max_themes` / `min_codes_per_theme` /
  `Nicht gruppiert`-Auffangknoten — sie steuern die *Anzahl* und machen Reste
  ehrlich sichtbar, definieren aber nicht die Grenzen.

### Option 1 „plus" — die Determiniertheits-Lücke ehrlich machen

Statt nur `max_themes` ins Schema zu schreiben, zusätzlich:

- **`min_codes_per_theme` (≥ 2):** zwingt das Modell nicht, künstliche Singletons
  in echte Achsen zu pressen.
- **expliziter `Nicht gruppiert`-Auffangknoten:** die Reste landen **sichtbar** im
  Auffang, statt die Achsenzahl zu fälschen.

Damit wird die unvermeidbare Rest-Unschärfe **ehrlich sichtbar** statt kaschiert.
Das „1× Nicht gruppiert" aus dem 8-Argumente-Test ist insofern das **richtige
Verhalten, nicht der Makel** — ein Code, der (noch) zu keiner tragenden Achse
gehört, soll genau dort auftauchen.

Umsetzung wäre weiterhin ein Ein-Zeilen-Eingriff im Axial-Prompt plus drei Felder
in `BatchOptions` (`max_themes`, `min_codes_per_theme`, `allow_unclustered`).

> **Status:** Teilweise gebaut. Der Auffangknoten `Nicht gruppiert` und
> **`max_themes`** (Default 6, in `BatchOptions`) sind implementiert; der
> Axial-Prompt zielt explizit auf inhaltliche Achsen (idealerweise benannte
> Gegensätze). `min_codes_per_theme` noch nicht.
>
> *Empirisch bestätigt:* der weiche Cap ist nicht bindend — ein Lauf mit
> `max_themes=6` über 37 Codes lieferte 7 Achsen (inkl. einer Singleton-Achse).
> Genau die in §8.1 beschriebene Determiniertheits-Lücke.

---

## 9. Zweistufiges Axial Coding (Mengen-Skalierung)

Der direkte Axial-Pfad (§2/§8) skaliert nicht beliebig: bei hunderten Argumenten
entstehen hunderte Open Codes, und ein einziger Axial-Call über z.B. 700 Codes
hat einen absurden Verdichtungsfaktor (~120:1) und „lost in the middle". Darum
schaltet der Service ab einer Schwelle automatisch auf einen zweistufigen Pfad
um. Implementiert in [`TagSystem.batch_induce`](../services/calculator/src/tags/tag_system.py)
+ [`prebundle.py`](../services/calculator/src/tags/prebundle.py).

### Umschaltlogik (das Herzstück)

Nach dem Open Coding wird die Code-Zahl gezählt. Ein einziger Schwellwert
(`two_stage_threshold`, Default **40**) entscheidet den Pfad:

- **< 40 Codes → direkt** (wie §2): Axial über alle Codes, kein Vorbündel-Overhead.
- **≥ 40 Codes → zweistufig:** Stage 0 → 1 → 2.

Die Umschaltung passiert **automatisch** und wird im Output dokumentiert
(`mode: "direct" | "two-stage"`) — dieselbe Audit-Logik wie bei der Versionierung,
damit später nachvollziehbar ist, wie eine Taxonomie zustande kam.

### Stage 0 — Häufigkeitsfilter

Vor jeder Verdichtung werden Codes nach Häufigkeit getrennt. Ein Code, der in 200
Argumenten nur ein-/zweimal vorkommt, kann **definitionsgemäß keine Achse**
markieren — eine Streitachse braucht Masse auf beiden Seiten. Seltene Codes
(< `min_frequency`) wandern in einen **sichtbaren Rand-Topf** (Tag `Rand`, nicht
gelöscht). Effekt im Großen: 700 Rohcodes schrumpfen oft auf 100–150 relevante.
Inhaltlich ehrlich: der Long Tail verschwindet nicht, er ist als Randphänomen
markiert statt in eine Achse gepresst.

*Designentscheidung roh vs. semantisch:* roh gezählt (exakt gleicher String)
unterschätzt, weil dasselbe Argument verschieden formuliert wird — darum ist
Stage 1 nötig. *Guard:* wenn der Filter fast alles in den Rand schieben würde
(`kept < max(target_bundles, 10)`), wird er ausgesetzt (`stage0.applied=false`).

> **Beobachtung an echten Daten (663.1):** von 161 unikaten Codes hatte *keiner*
> `freq ≥ 2` — die Open-Codes wiederholen sich (als exakter String) praktisch
> nie, weil das Open Coding sehr spezifische Labels erzeugt. Der Häufigkeitsfilter
> greift dann nie (Guard setzt aus) und die ganze Verdichtungslast liegt bei
> Stage 1 (semantisch). Das ist ein Hinweis, dass der Hebel eher beim Open Coding
> liegt (etwas generischere, wiederkehrende Codes) als bei einem schärferen
> Häufigkeitsfilter.

### Stage 1 — Vorbündelung (mengen-robust, Latenz erlaubt)

**Hier — und nur hier — ist (latentes) Clustering legitim**, obwohl es latente
Trennungen erzeugt. Grund: diese Stufe trifft **keine inhaltlichen
Endentscheidungen**, sie sortiert nur nahe Dubletten zusammen („Fonds aus
Abgaben" ≈ „Abgaben-finanzierter Topf"). Dass die Trennlinie hier mathematisch
ist, stört nicht, weil sie in Stage 2 inhaltlich überprüft wird — **die Latenz
ist gekapselt und leckt nicht ins Endergebnis.** Das ist die Ausnahme zum
Leitkriterium §8.1, exakt weil keine Achse hier definiert wird.

Ergebnis: Zwischen-Bündel echter Nah-Dubletten (≥ `floor`), jedes mit einem
**Repräsentanten**. `target_bundles` (Default 40) ist dabei nur eine weiche Decke
— bei diversen Daten bleiben oft mehr Bündel übrig, und die nicht-clusternden
Codes gehen in den Rand (s. honest-Modus unten). Backend:

> **Honest-Modus statt Cap-Erzwingung (gelernte Lektion).** Ursprünglich wurde
> auf `target_bundles` *erzwungen*: reichte der Floor nicht, wurde er gelockert,
> bis der Cap stand. Das liess greedy Average-Link *ein* Cluster lawinenartig
> anwachsen (real: 161 unikate Codes → ein **37er-Mega-Bündel**, das 37
> heterogene Codes über *einen* Repräsentanten in *eine* Achse zog; der
> Reorg-Split §9.1 kann das nicht heilen, da er auf Repräsentanten arbeitet).
> **Konsequenz:** kein Floor-Lockern, kein Zwang mehr. Es werden NUR Paare ≥
> `floor` gemergt; `target_bundles` ist nur eine (meist nicht bindende) Decke.
> Grosse Bündel entstehen damit nur aus echter Nähe — kein Snowball, **kein
> Größen-Cap nötig** (`CALCULATOR_PREBUNDLE_MAX_BUNDLE_SIZE`, Default 0 = aus, nur
> Sicherheitsnetz bei sehr tiefem Floor). **Default-Floor 0.72** (nur echte
> Nah-Dubletten; tiefer = lockerere Bündel, real bei 0.60 ein 14er-Mini-Becken
> mit Kohäsion 0.63). Singleton-Codes (kein Partner ≥ Floor) werden gefiltert:
> stammt der Code von einem Argument, das schon einen Code in einem echten
> Cluster hat („abgedeckt"), wird er **verworfen** (idiosynkratische Nebenfacette);
> nur Singletons gar-nicht-clusternder Argumente gehen in den **Rand-Topf**
> (`kind='margin'`). So bleiben Bündel kohärent UND der Rand klein.
>
> **Grenze (663.1, ehrlich):** bei Floor 0.72 sind die Bündel sauber (Kohäsion
> 0.72–0.89), aber das Axial-LLM platziert nur einen Teil auf Achsen und lehnt
> ~60 Codes als „nicht gruppiert" ab (14/58 Argumente ohne Achse) — ein höheres
> `max_themes` ändert das NICHT (das LLM bildet trotzdem nur ~8 Achsen). Auf
> diesen Daten passt also ~24% schlicht in keine *gemeinsame* Achse. Floor 0.60
> versteckte das hinter einem Sammelbecken-„Pseudo-Achse"; 0.72 macht es ehrlich.

| Backend | Status | Eigenschaft |
|---------|--------|-------------|
| **lexikalisch** (Token-Jaccard, Greedy-Agglomeration) | **gebaut** (stdlib; opt-in Fallback) | erkennt Stichwort-Dubletten zuverlässig; **schwach bei reinen Paraphrasen** ohne Wortüberlappung |
| **Embedding** (Infomaniak AI Tools, Qwen3-Embedding-8B, OpenAI-kompatibel) | **gebaut** | erkennt auch Paraphrasen; Average-Link-Agglomeration über Cosinus mit Schwelle `PREBUNDLE_EMBED_FLOOR` (Default 0.72) — nur nahe Dubletten |

Backend-Wahl über `CALCULATOR_PREBUNDLE_BACKEND` (`auto` | `embedding` |
`lexical`): **auto** nutzt Embeddings, wenn `CALCULATOR_EMBEDDING_PRODUCT_ID` +
`CALCULATOR_EMBEDDING_API_KEY` gesetzt sind, sonst lexikalisch. **Kein stiller
Fallback bei Laufzeit-Fehlern:** ist Embedding die gewählte Methode und der
API-Call scheitert, bricht der Lauf hörbar ab (`502`) statt unbemerkt schlechtere
lexikalische Bündel zu liefern — ein Embedding-Ausfall (transient: 502/Timeout)
würde sonst leise die Qualität senken. Der alte Auto-Fallback lässt sich mit
`CALCULATOR_PREBUNDLE_EMBED_FALLBACK=true` reaktivieren (dann wieder
`prebundle.backend = "lexical(embedding-fallback)"` im Output). `auto` ohne Creds
bleibt regulär lexikalisch (das ist eine Konfigurations-, keine Fehler-Entscheidung).
Embeddings via [`embedding.py`](../services/calculator/src/tags/embedding.py) →
`POST {base}/2/ai/{product_id}/openai/v1/embeddings`.

**Harter Cap (Embedding-Backend).** Damit nie mehr als `target_bundles` Bündel
herauskommen, läuft die Agglomeration iterativ in bis zu **3 Runden**: Runde 1
mergt nur echte Dubletten (≥ Floor 0.72); reicht das nicht, wird der Floor
gelockert, und die letzte Runde **erzwingt** den Cap (Floor ignoriert). Der
Output meldet das transparent in `prebundle`: `rounds` (genutzte Runden),
`final_floor` (Floor der letzten Runde — niedrig = Qualität zugunsten des Caps
gelockert) und `capped` (true, wenn unter den reinen Dubletten-Floor gegangen
wurde). So bleibt sichtbar, ob der Cap „sauber" (nur Dubletten) oder erzwungen
erreicht wurde — statt die Verdichtung zu verstecken. *Live:* 36 Codes → Cap 5
ergab 5 Bündel in 2 Runden (`final_floor` 0.36).

> ⚠️ **Skalierungs-Vorbehalt (abzuklären).** Die Agglomeration ist `O(n²)`-Speicher
> (Sim-Matrix) und grob `O(n²·Merges)` Zeit — sie sucht je Merge das ähnlichste
> Paar neu. Bei ein paar hundert `kept`-Codes okay (Sekunden), aber Richtung
> **1000+ wird sie zäh**, zumal der harte Cap bis zu **3 Runden** re-clustert.
> Für echten Großbetrieb wäre ein richtiges Clustering (sklearn
> `AgglomerativeClustering` / HDBSCAN) der nächste Schritt. Für die aktuellen
> Mengen reicht es. (Stage 0 dünnt vorher aus, sodass real meist ~100–200 Codes
> in die Bündelung gehen, nicht 1000.)

> *Empirie (lexikalisch):* bei kleinem/divers formuliertem Material komprimiert
> die lexikalische Variante kaum — ein Test mit 37 Codes ergab nur 34 Bündel. Die
> echte Verdichtung (700→~100) leistet das Embedding-Backend.
>
> *Floor-Kalibrierung (Qwen3-Embedding-8B, 4096 dim, live gemessen):* Dublette
> 0.89, **Achsen-Gegenpole 0.63**, unverwandt 0.58. Qwen3 hat eine hohe
> Grundähnlichkeit (~0.58), deshalb sitzt der Default-Floor **0.72** richtig: über
> den Gegenpolen (die NICHT gemergt werden dürfen) und unter echten Dubletten.
> Der Wert ist modellspezifisch, **nicht** batch-größen-abhängig.

### Stage 2 — Achsen-Bildung (LLM, rein inhaltlich, mit Deckel)

Das LLM bekommt nur noch die ~40 Bündel-**Repräsentanten** statt 700 Rohcodes —
eine vollständig überblickbare Menge (gesunder Verdichtungsfaktor ~7:1 statt
120:1). Darauf läuft die Achsen-Logik aus §8.2: inhaltliche Streitachsen („X ↔ Y")
statt Sammelkategorien, `max_themes` als weicher Cap, expliziter `Nicht
gruppiert`-Auffang. Eine Achse erbt **alle** Codes ihrer Bündel.

### Hierarchie als Gratis-Nebenprodukt

Durch die Zwischenstufe entsteht die mehrstufige Tag-Hierarchie aus §10.1 **ohne
Extraschritt** und wird im Output (`hierarchy`) ausgegeben:

```
Achse (Stage 2, ~6) → Bündel (Stage 1, ~40) → Open Code (~700) → Argument
```

Jede Ebene ist inhaltlich gefüllt: die Achse beantwortet „worum wird gestritten",
das Bündel „in welcher konkreten Spielart", der Code „mit welchen genauen Worten".

### 9.1 Reorganisation — überladene Achsen splitten (zweites Sicherheitsnetz)

**Das Problem.** Gruppiert das LLM in der axialen Phase alle Codes auf einmal,
hat es eine Tendenz, die in echten Daten sichtbar wurde: *eine* Achse wird zum
**Sammelbecken**. In einem Lauf zog Achse 4 mit 41 Zuordnungen alles nur grob
Verwandte an (nationale Wirksamkeit, Klimafolgen, globale Gerechtigkeit — drei
verschiedene Streitfragen), während die anderen bei ~14–29 lagen. Genau die
Latenz, die wir vermeiden wollen: die Achse ist kein scharfer Streitpunkt mehr,
sondern ein vager Themenbereich.

**Größe als Warnsignal.** Eine Achse, die viel größer ist als die anderen, ist
verdächtig — nicht im Sinne von „wichtig", sondern „vermischt vielleicht mehrere
Fragen". Hat ein Streitpunkt wirklich nur *eine* Frage, gibt es eine natürliche
Obergrenze, wie viele verschiedene Codes dazu passen. Wächst eine Achse weit
darüber hinaus, ist die wahrscheinlichste Erklärung nicht „dieser Punkt ist
riesig", sondern „hier wurden mehrere Punkte zusammengeworfen". Die Größe ist ein
**messbarer Indikator** für ein Problem, das man sonst nur durch inhaltliches
Nachlesen fände.

**Der Mechanismus (in zwei Schritten).**
1. **Erkennen.** Nach der Achsenbildung wird je Achse die Größe (**Codes pro
   Achse**) bestimmt und gegen den Schnitt der **übrigen** Achsen verglichen
   (nicht den Gesamtschnitt — sonst bläht die überladene Achse den Maßstab
   selbst auf und das Kriterium greift bei wenigen Achsen nie). Überladen
   ab `split_factor ×` diesem Schnitt (Default `1.8`), und erst ab
   `split_min_reps` Repräsentanten (darunter lohnt sich kein Split).
2. **Aufteilen.** Nur die Codes (Repräsentanten) dieser *einen* Achse gehen
   erneut ans LLM — mit dem Auftrag: „diese Achse ist überladen und vermischt
   vermutlich mehrere Streitfragen, teile sie in 2–`split_max_sub` saubere,
   eindimensionale Achsen". Das LLM arbeitet auf einem kleinen, fokussierten
   Ausschnitt statt auf allem.

**Warum es funktioniert.** Ein LLM trifft feinere Unterscheidungen, wenn es
weniger gleichzeitig betrachten muss. Im großen Durchlauf (z.B. 98 Codes) macht
es grobe Schnitte — „alles Klima-Globale gehört irgendwie zusammen" ist eine
naheliegende Vereinfachung. Sieht es nur die 41 Codes von Achse 4, fällt auf:
„'die Schweiz ist zu klein' und 'die Klimafolgen sind dramatisch' sind gar nicht
dieselbe Frage." Die Verengung des Blickfelds erzwingt die Schärfe — dieselbe
Logik wie die zweistufige Verdichtung, nur umgekehrt: dort *vorher* gegen
Überladung, hier *nachträglich* reparierend.

**Zwei Sicherheitsnetze gegen dasselbe Problem.** Schicht 1 ist der geschärfte
Axial-Prompt („eine Achse = eine Frage", der „Kann man beiden Polen zustimmen?"-
Test) — er verhindert die meisten Überladungen schon bei der Entstehung. Schicht
2 ist dieser Split — er fängt, was trotz gutem Prompt durchrutscht (kein Prompt
ist perfekt; schwächere Modelle oder andere Datenlagen rutschen eher). *Prompt
verhindert vorab, Reorganisation korrigiert nachträglich.* Keine Schicht allein
ist zuverlässig genug; zusammen sind sie robust.

**Lineage & Persistenz.** Wird eine Achse restlos aufgeteilt, bekommt sie
`status='split'` mit `superseded_by` → sie erscheint **nicht** in der
DB-Persistenz; die Sub-Achsen tragen `derived_from`. Reps, die der Split keiner
Sub-Achse zuordnet (Leftover), bleiben auf der ursprünglichen (Rest-)Achse, die
dann aktiv weiterbesteht. Ein Pass (nicht rekursiv); der Output meldet `splits`.
Code: [`TagSystem._split_overloaded_axes`](../services/calculator/src/tags/tag_system.py).

### Steuerparameter (alle in `BatchOptions`)

| Parameter | Default | Bedeutung |
|-----------|---------|-----------|
| `min_frequency` | 2 | Stage 0: ab wann ein Code achsen-würdig ist |
| `target_bundles` | 40 | Stage 1: **harter Cap** auf die Bündelzahl (iterativ erzwungen, max. 3 Runden) |
| `max_themes` | 6 | Stage 2: weiche Achsen-Obergrenze |
| `reorganize` | true | §9.1: überladene Achsen splitten (an/aus) |
| `split_factor` | 1.8 | §9.1: überladen ab `× Schnitt der übrigen Achsen` |
| `split_min_reps` | 6 | §9.1: erst ab so vielen Repräsentanten splitten |
| `split_max_sub` | 3 | §9.1: max. Sub-Achsen je Split |

> **Status:** Orchestrierung + **beide Stage-1-Backends** (lexikalisch +
> Embedding via Infomaniak/Qwen3) **gebaut und getestet**. Offen: Tuning des
> Cosinus-Floors mit realen Daten und das harte „≥ 2 Bündel pro Achse"-Kriterium.

---

## 10. Geplante Features / Ausbaurichtungen (in Analyse)

> **Status: in Analyse.** Diese Features sind vom Team noch genauer zu
> spezifizieren und **noch nicht gebaut**.

Die inhaltliche Progression (§10.1–10.3) baut methodisch aufeinander auf und
trifft das Leitkriterium aus §8.1: **(10.1)** zwei inhaltliche Ebenen explizit als
Baum verknüpfen → **(10.2)** die Trennlinie als benannten Gegensatz herausziehen →
**(10.3)** diese Gegensätze meta-klassifizieren, *warum* gestritten wird.
Dazu kommt eine **operative** Dimension (§10.4): wie die Taxonomie sich über die
Zeit und über Datenmengen hinweg verhält.

### 10.1 Hierarchische Taxonomie-Induktion (Open Code → Kategorie → Kernkategorie)

> **Teil-Realisierung:** Der zweistufige Pfad (§9) liefert die Hierarchie
> *Achse → Bündel → Code → Argument* bereits als Nebenprodukt. Was hier noch
> offen ist: die Hierarchie auch im **direkten** Pfad und als first-class,
> persistierte/abfragbare Kantenstruktur (nicht nur im Batch-Output).


Im Output von Variante B liegen bereits **zwei Ebenen** vor — nur nicht als
Hierarchie ausgewiesen:

- **Open Codes** (z.B. ~37 Stück): die detailnahe Ebene, dicht am Wortlaut
  („Doppelmoral der Eliten", „Kunstschnee statt Verzicht").
- **Themes** (z.B. ~10 Stück): die übergreifende Ebene.

Was fehlt, ist die **explizite Verknüpfung als Baum**: jeder Code hängt unter
genau einem (oder mehreren) Theme, und diese Kante wird **gespeichert und
navigierbar**. Methodisch ist das exakt die Grounded-Theory-Treppe *Open Code →
Kategorie → Kernkategorie*; in der Taxonomie-Forschung heißt es **hierarchische
Taxonomie-Induktion**.

Passt zum Leitkriterium, weil **beide Ebenen inhaltlich** sind (anders als bei
latenten Faktoren): der detailnahe Tag bleibt am Inhalt, der übergreifende fasst
zusammen, und die Kante dazwischen ist eine inhaltliche **„ist-ein-Fall-von"**-
Beziehung.

*Umsetzungshinweis:* Das Datenmodell trägt bereits `derived_from` /
`superseded_by` (Tag) und das `code_to_tag`-Mapping (batch). Der Schritt wäre,
die Kante Code→Theme als first-class, persistierte und abfragbare Hierarchie
auszuweisen — und ggf. eine dritte (Kern-)Ebene zu ergänzen.

### 10.2 Achsen als benannte Gegensätze (named oppositions)

Der Kern aus §8: **eine Achse ist kein Sammelordner, sondern ein benannter
Gegensatz.** Beispiele:

- „Technologie löst es ↔ Verzicht löst es"
- „Mensch ist Hauptursache ↔ natürliche Schwankungen"

Das trifft das Leitkriterium **am direktesten**, weil die Trennlinie selbst eine
*inhaltliche Aussage* ist (ein Gegensatzpaar mit zwei Polen), nicht ein Label über
einer Ansammlung. Der Unterschied zur heutigen Theme-Gruppierung: Themes sind
Sammelordner („Soziale Verträglichkeit"); Achsen ordnen Argumente **als Positionen
auf einem Gegensatz** ein (welcher Pol). Das macht aus einem „worüber wird geredet"
ein „**wie stehen die Positionen zueinander**".

Der bisherige Output enthält solche Achsen schon **latent** (z.B. Argument
`9952` vs. `9926`; `9814` vs. der Rest) — sie sind nur noch nicht *als Achsen
herausgezogen*.

> **Validierung (Argument → Codes → Achsen).** Mit der Pol-Neigung je Code
> (`app_taxonomy_membership.pole`) lässt sich die Codier-/Achsen-Qualität prüfen:
> **Wirken mehrere Codes *eines* Arguments auf *derselben* Achse zu
> entgegengesetzten Polen (a *und* b), ist etwas faul** — entweder ein
> Mis-Coding, eine vermischte Achse (zwei Fragen in einer), oder ein tatsächlich
> in sich widersprüchliches Argument. Ein Argument soll auf *einer* Streitachse
> normalerweise *eine* Position beziehen. Diese Inkonsistenz ist ein billiges,
> automatisierbares Warnsignal (GROUP BY argument_uri, axis_id → > 1 distinct
> pole). Über *verschiedene* Achsen hinweg sind unterschiedliche Pole dagegen
> normal (ein Argument kann mehrere Streitpunkte ansprechen).

### 10.3 Dissens-Typisierung (Fakt / Kausal / Wert / Begriff)

Das **allererste Ziel** und noch offen: jede Achse klassifizieren nach der **Art
des Dissenses**:

- **Fakt** — empirisch klärbar. Bsp.: „Mensch ist Hauptursache ↔ natürliche
  Schwankungen".
- **Kausal** — Streit über Wirkungszusammenhänge.
- **Wert** — normativer Dissens, nicht durch Fakten auflösbar.
- **Begriff** — man meint Unterschiedliches mit denselben Wörtern.

(„Technologie ↔ Verzicht" ist z.B. teils Wert, teils Kausal.)

Das ist die Schicht, die aus reinen Achsen einen **Lerneffekt** macht: Sie sagt den
Leuten, **warum** sie streiten und **ob Fakten helfen** — ein Fakt-Dissens ist
durch Evidenz klärbar, ein Wert-Dissens nicht. Passt perfekt zum Leitkriterium
und **schließt den Kreis** zur ursprünglichen Ausgangsfrage des Projekts.

### 10.4 Theme-Stabilität über die Zeit & Regime-Wechsel

Die operativ unangenehmste Eigenschaft — und sie hängt direkt am Snapshot-Modell.

**Das Problem: springende Taxonomie.** Wenn das Verfahren täglich *vollständig neu*
gerechnet wird, sind die Themen bei jedem Lauf potenziell anders: andere Namen,
andere Grenzen, andere Anzahl (LLM-Nichtdeterminismus, §6). Bei 5 Argumenten egal.
Bei 300, wo User über *Wochen* mit den Themen gearbeitet haben, ist eine springende
Taxonomie ein echtes **UX- und Vertrauensproblem** („gestern gab es Theme X, heute
ist es weg"). Die Felder `derived_from` / `superseded_by` (§2) ahnen das voraus,
aber **Felder sind keine Strategie** — es braucht ein Verfahren.

**Die Strategie: inkrementelles statt vollständiges Re-Clustering.** Statt jeden Tag
bei null anzufangen, wird die etablierte Taxonomie *festgehalten* und nur die
**neuen** Argumente in bestehende Themen eingeordnet (das ist im Kern Variante A /
`classify_or_propose` gegen den fixierten Themenbestand). Ein **vollständiges**
Re-Clustering passiert dann seltener und **bewusst** — getriggert, nicht täglich.
Das gibt Usern Stabilität und erhält trotzdem Anpassungsfähigkeit.

**Der Trigger / das Frühwarnsystem: die Restkategorie.** `Nicht gruppiert` ist schon
bei 10 Argumenten auffällig groß (Größe 4 → 40 % der Argumente haben mindestens
einen ungruppierten Code). Bei 300 muss man **beobachten, ob diese Kategorie
mitwächst**: wächst sie überproportional, ist das das Signal, dass die bestehende
Taxonomie die neuen Argumente nicht mehr fasst → **Zeit für ein vollständiges
Re-Clustering**. Dasselbe gilt, wenn `Rand` (§9 Stage 0) anschwillt.

**Der konzeptionelle Kern: ein Verfahren mit Regime-Wechseln.** Man braucht *nicht*
ein Verfahren, das bei 5 und bei 300 gleich läuft, sondern eines, das je nach
Datenmenge (und Reifegrad der Taxonomie) **anders agiert**. Es gibt bereits einen
Mengen-Regimewechsel (§9: `two_stage_threshold`); hier kommt die *zeitliche*
Dimension dazu.

> ⚠️ **Offen:** Die konkreten drei Regime waren in der Quell-Notiz noch nicht
> ausformuliert (sie brach bei „Grob drei Regime:" ab). Folgender Entwurf ist
> **tentativ / zu bestätigen** und leitet sich aus dem bisherigen Design ab:
>
> | Regime | Datenlage | Verhalten |
> |--------|-----------|-----------|
> | **1 — klein** | wenige Codes (`< two_stage_threshold`), keine etablierte Taxonomie | direkter Pfad (§2), jedes Mal vollständig neu — billig, springende Themen unkritisch |
> | **2 — groß, neu** | viele Codes, aber noch keine über Zeit etablierte Taxonomie | zweistufiger Pfad (§9), noch vollständiges Re-Clustering je Lauf |
> | **3 — groß, etabliert** | viele Argumente, User arbeiten seit Wochen mit den Themen | **inkrementell**: feste Taxonomie, nur neue Argumente einordnen; vollständiges Re-Clustering nur bei Trigger (Restkategorie/`Rand` wächst, manueller Anstoß) |
>
> Zu klären: die genauen Schwellen, der Trigger-Schwellwert für die Restkategorie,
> und ob „etabliert" zeit- oder nutzungsbasiert definiert wird.

| Baustein | Status |
|----------|--------|
| Variante A (`/induce`, inkrementell) | gebaut |
| Variante B (`/induce-batch`, Open+Axial) | gebaut, produktiver Pfad |
| Codes-statt-Argumente clustern | gebaut (Grundarchitektur B) |
| Stabile Code-IDs für Axial-Mapping | gebaut |
| Open-Coding-Cache (in-memory) | gebaut |
| Taxonomie-Persistenz in der DB (versioniert: run/axis/bundle/membership, §7) | gebaut |
| `Nicht gruppiert`-Auffangknoten | gebaut |
| `max_themes` (weicher Cap, Default 6) + Axial-Prompt auf inhaltliche Achsen | gebaut |
| `min_codes_per_theme` (Guardrail) | vorgeschlagen |
| Explizites, versioniertes Achsen-Schema (Zielmechanismus) | vorgeschlagen |
| Zweistufiges Axial Coding (Umschaltlogik + Stage 0/1/2, §9) | gebaut |
| Vorbündelung — lexikalisches Backend (§9, Stage 1) | gebaut |
| Vorbündelung — Embedding-Backend (Infomaniak/Qwen3, §9, Stage 1) | gebaut (Floor noch zu tunen) |
| Hierarchie Achse → Bündel → Code (§9, Nebenprodukt) | gebaut (im Batch-Output) |
| Reorganisation: überladene Achsen splitten (2. Sicherheitsnetz, §9.1) | gebaut |
| Hierarchische Taxonomie-Induktion, first-class/persistiert (§10.1) | in Analyse |
| Achsen als benannte Gegensätze (§10.2) — `pole_a`/`pole_b` je Achse + Pol-Neigung je Code | gebaut |
| Dissens-Typisierung Fakt/Kausal/Wert/Begriff (§10.3) | in Analyse |
| Theme-Stabilität: inkrementelles Re-Clustering + Regime-Wechsel (§10.4) | in Analyse (3 Regime noch zu bestätigen) |
| Open-Coding-Worker (Cron) + Tabelle `app_argument_open_codes` (persistent, Re-Code, Fehler-Tracking, Tagescap) | gebaut |
| Pol-Neigung pro Code persistent (`membership.pole`, Validierung §10.2) | gebaut |
| `reorganize_with_clustering`-Hook | ungenutzt — Embedding-Vorbündelung wurde eigenständig in `embedding.py`/`prebundle.py` umgesetzt; Hook kann entfernt werden |
| Embedding-Clustering als **Achsen-Definer** | **verworfen** (latente Trennlinien, §8.1) |
