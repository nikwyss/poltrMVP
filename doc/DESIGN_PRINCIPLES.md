# Design Principles — POLTR Frontend

Leitlinien für das visuelle Erscheinungsbild des Frontends (`services/frontend`).
Sie beschreiben das *Warum* hinter den Entscheidungen, damit neue Seiten und
Komponenten konsistent bleiben, ohne dass jede Regel neu verhandelt werden muss.

Referenz-Implementierung: die **Booklet-Ansicht** einer Vorlage
(`src/app/(app)/ballot/[id]/arguments/booklet/page.tsx`). Tokens leben in
`src/app/globals.css`, die Serif-Font (Lora) wird in `src/app/layout.tsx` als
`--font-serif` gebunden.

---

## 1. Typografie: drei klare Ebenen

Die Schrift trägt die Hierarchie. Es gibt genau **zwei Ebenen**:

| Ebene | Schrift | Beispiele |
|-------|---------|-----------|
| **Titel** (groß) | **Serif** (Lora) | Seitentitel (`<h1>` der Hero-Card), Argument-Titel (`.na-card-title`) |
| **Alles andere** | **Sans** (Default-Body-Font) | Lede/Beschreibung, Labels, Badges, Meta, Buttons, Zähler, Score-Zahlen |

**Warum Serif nur für die großen Titel?** Die Serif gibt dem Inhalt — dem
eigentlichen politischen Argument — Würde und Dossier-Charakter. Sie ist das
Signal „hier steht etwas Bedeutsames" und bleibt deshalb bewusst den großen
Titeln vorbehalten. Würde man die Titel auf Sans umstellen, ginge dieser
Charakter verloren; streut man die Serif dagegen zu breit (z. B. über Fließtext),
verliert sie ihre Signalwirkung.

**Warum Lede in Sans?** Der Lede ist Fließtext zum Lesen, nicht Schlagzeile —
Sans hält ihn ruhig und ordnet ihn klar unter den Serif-Titel.

**Warum Sans für den Rest?** Sans ist die neutrale Arbeitsebene: scanbar,
funktional, zurückgenommen. Zahlen, Labels und Bedienelemente sollen *nicht* mit
dem Inhalt um Aufmerksamkeit konkurrieren.

### Konkrete Konsequenzen

- **Zahlen sind Sans, nicht Serif.** Der persönliche Relevanz-Score auf einer
  Argument-Karte (`.na-card-index`, „39/100") nutzt `font-family: inherit`
  (= Sans), damit er zu den Zählern der Hero-Card („111 Argumente / 159
  Kommentare") passt. Den *Charakter* der Score-Zahl trägt die **Farbe**
  (grün = Pro, rot = Contra) — nicht die Schriftart. Schrift und Farbe sollen
  nicht beide gleichzeitig „Charakter" machen.
- **Serif wird per Inline-Style gesetzt** (`fontFamily: 'var(--font-serif),
  Georgia, "Times New Roman", serif'`), da es bewusst keine globale
  `font-serif`-Utility gibt — Serif ist die Ausnahme, nicht der Default.

---

## 2. Farbe als Bedeutungsträger

Farbe wird sparsam und semantisch eingesetzt, nicht dekorativ.

- **Pro / Contra:** `var(--pro)` (grün) / `var(--contra)` (rot). Linker
  Kartenrand, Badge und Score-Zahl.
- **Offiziell:** Bernstein/Gold (`#8a6b2b`) — die Farbe der „autoritativen"
  Inhalte (offizielle Argumente der Bundeskanzlei, ★-Sektion).
- **Brand:** `var(--brand)` (Orange) für den Abstimmungstyp im Eyebrow und
  primäre Akzente.
- **Text-Abstufungen:** `--text` (Titel/Inhalt), `--text-mid` (Lede/Fließtext),
  `--text-faint` (Meta, Labels, Status).

Wenn ein Element bereits über Farbe spricht (z. B. Pro/Contra), braucht es keine
zweite Auszeichnung über Schrift oder Rahmen.

---

## 3. Status & Meta: nur wenn relevant

- **Status-Labels erscheinen nur kontextabhängig.** Der Gutachtungsstatus und
  das „Offiziell"-Label auf Argument-Karten werden **nur auf bereits bewerteten
  Karten** angezeigt — unbewertete Karten bleiben status-frei und ruhig, damit
  „noch offen" von selbst heraussticht.
- **Eyebrow = Datum · Typ**, als schlichter Text, keine Pille. Die
  Abstimmungstyp-Bezeichnung steht in Brand-Farbe, gemischte Schreibweise.
- **Zähler stehen als Zahl über Label** (große Sans-Zahl, gedämpftes Label
  darunter), nicht als Tag-Pille — das gibt den Kennzahlen Gewicht.

---

## 4. Text kürzen, nicht abschneiden

Lange Inhalte werden geklappt, nicht hart beschnitten:

- Der Lede der Vorlage wird auf **5 Zeilen** (`line-clamp-5`) begrenzt, mit
  „Mehr/Weniger anzeigen"-Toggle.
- Der Toggle erscheint **nur**, wenn der Text tatsächlich überläuft
  (Overflow-Messung via `scrollHeight > clientHeight`) — kein Button bei kurzen
  Texten.

---

## 5. Dezente Tiefe, voller Inhalt

- **Hintergrund-Grafik** (`PageBackdrop`) liegt als fixe, `-z-10`-Ebene mit
  niedriger Deckkraft (Default 0.18) hinter dem Inhalt; `pointer-events-none`,
  damit nichts blockiert wird. Verschiedene Seiten nutzen verschiedene Motive
  (`src`-Prop) für sanfte Wiedererkennung (Booklet / Feed / Profil).
- **Karten** sind weiß auf ruhigem Body-Hintergrund, mit feinem Rahmen und
  minimalem Schatten. Unbewertete Argumente bekommen einen warmen
  Pergament-Ton, um offene Aufgaben hervorzuheben.

---

## Checkliste für neue UI

- [ ] Ist es ein **großer Titel**? → Serif. Sonst (inkl. Lede) → Sans.
- [ ] Trägt **Farbe** bereits die Bedeutung? Dann keine zweite Auszeichnung.
- [ ] Wird ein **Status** angezeigt, der nur in bestimmten Zuständen sinnvoll
      ist? Dann konditional rendern.
- [ ] Kann der Text **lang** werden? Dann klappen statt abschneiden.
- [ ] Sind neue Strings in `messages/de.json` **und** `messages/en.json`?
