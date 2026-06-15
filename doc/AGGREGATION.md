# Aggregierung der Argument-Bewertungen zu einer Themen-Haltung

> Status: aktuell **Noisy-OR (γ=1)** auf einem **unipolaren** Bewertungs-Modell.
> Zentral implementiert in [`services/front/src/lib/aggregate.ts`](../services/front/src/lib/aggregate.ts)
> (Schalter `AGG_METHOD`, Dämpfung `AGG_NOISY_GAMMA`).

## Worum geht es?

**Unipolares Modell:** Die Frage an den User lautet *„Wie stark spricht dieses
Argument für ein Ja [bzw. Nein] zur Vorlage?"* — die Richtung kommt aus dem
Argument-Typ (Pro → Ja, Contra → Nein), der Regler misst nur die **Stärke**
`preference ∈ [0,100]`. Daraus der Beitrag

```
c = (PRO ? +1 : −1) · preference / 100   ∈ [−1, 1]
```

(Pro: +[0,1] Richtung Ja, Contra: −[0,1] Richtung Nein; `preference = 0` =
„spricht gar nicht dafür" = **kein Beitrag**). Eine Stimme kippt also nie auf die
Gegenseite — Pro-Argumente sind ausschliesslich die positive, Contra die negative
Seite.

Pro Thema (Teilbaum) müssen viele solche Beiträge zu **einer** Haltung ∈ [−1, 1]
verdichtet werden. Diese Zahl färbt das **Meinungsrad** (Sunburst), steht als
Kennzahl/Sortierung in der **Verteilung je Thema** (Likert) und treibt die
**ThemeCard-Insight**. Es lohnt sich also, die Aggregierung bewusst zu wählen —
sie ist nicht „nur ein Durchschnitt".

> **Historie:** Früher bipolar (`c = Vorzeichen·(pref−50)/50`, 50 = neutral) — ein
> schwach bewertetes Pro-Argument zählte da als Schub Richtung Nein. Das unipolare
> Modell vermeidet diese heikle Inferenz und macht die Pro/Kontra-Trennung exakt.

## Warum der arithmetische Mittelwert die schlechteste Wahl ist

Der Mittelwert hat genau die beiden Eigenschaften, die wir hier **nicht** wollen:

1. Er **gewichtet jedes Argument gleich**.
2. Er lässt sich von **schwachen Argumenten nach unten ziehen** (Verdünnung).

Beispiel: ein Argument mit 100 plus drei mit je 10 → Mittel **32,5**, obwohl das
starke Argument den Fall vielleicht alleine trägt.

`Max` löst das, ist aber das andere Extrem: ignoriert, ob es **ein oder fünf**
starke Argumente gibt (keine Akkumulation), und ist **fragil** — ein einziges
Fehlrating (versehentlich eine 100) dominiert alles.

## Die eigentliche Designfrage: Soll Akkumulation zählen?

> Sind drei Argumente à 80 stärker als ein einzelnes à 80?

Davon hängt die Methodenwahl ab.

### Nein — Dominanz des Stärksten, Schwache verschwinden, kein Aufsummieren

| Methode | Formel | Charakter |
|---------|--------|-----------|
| **Potenzmittel (Hölder)** | `Mₚ = ((1/n)·Σxᵢᵖ)^(1/p)` | `p=1` = Mittel, `p→∞` = Max. `p=3…4` = stufenloser Regler; Starke dominieren, ein einzelner Ausreißer kippt aber nicht alles. Der praktischste „Knopf". |
| **Lehmer-Mittel** | `Σxᵢ² / Σxᵢ` | Jedes Argument gewichtet sich selbst; Starke zählen automatisch mehr. Für das Beispiel oben **79,2** (vs. 32,5 Mittel, 100 Max). |
| **Top-k / OWA** | Nimm die k stärksten / gewichte sortierte Ränge | „Bestes Argument zählt am meisten, zweitbestes etwas, Rest egal." Gut erklärbar, robuster als Max. |

### Ja — mehrere Starke verstärken sich (mit abnehmendem Grenznutzen)

| Methode | Formel | Charakter |
|---------|--------|-----------|
| **Noisy-OR / Evidenzkombination** | `P = 1 − Π(1 − pᵢ)` | `rating/100` = „Grad, zu dem dieses Argument die These stützt". Eine 100 setzt das Ergebnis auf 100 (nicht verwässerbar); schwache (≈0) tragen über Faktor ≈1 fast nichts bei; mehrere Mittelstarke bauen sich auf, **sättigen** bei 100. |
| **Log-Sum-Exp (weiches Max)** | `(1/β)·ln Σ exp(β·xᵢ)` | Wie Max, mit kleinem Bonus, je mehr Werte nahe am Maximum. `β` regelt die Max-Artigkeit. (Muss reskaliert/gekappt werden, da > 100 möglich.) |

## Entscheidung (aktuell): Noisy-OR (γ)

`AGG_METHOD = "noisy-or"`, Dämpfung `AGG_NOISY_GAMMA` (Default **1**):
`P = 1 − Π(1 − γ·pᵢ)`, je Seite (Pro, Kontra) separat. Begründung — die **Frage und
die Aggregierung sprechen dieselbe Sprache**:

- Die Frage *„Wie stark spricht dieses Argument für ein Ja?"* elizitiert die
  **eigenständige Stützkraft** jedes Arguments — genau der Input, den eine
  t-Konorm (Evidenz-Kombination) kombiniert. Hätte die Frage „Wie sehr stimmen Sie
  zu?" / „Übereinstimmung mit Ihrer Position" gelautet, wäre der **Mittelwert**
  verteidigbar (man mittelt Haltungen). Sie fragt aber nach **Beitrag** zur Vorlage.
- **0 = neutrales Element**: „spricht gar nicht dafür" multipliziert mit (1−0)=1,
  ändert den Score also nicht. Schwache Argumente helfen ein bisschen, **ziehen
  aber nie runter** — die Eigenschaft, die ein Mittelwert prinzipiell nicht hat.
- Beiträge **addieren** sich statt zu mitteln („Lücke zu 100 schliessen": ein 95er
  plus ein 5er → 95 + 5 % der Restlücke = **95,25**; der Zuwachs schrumpft, 100
  wird nie überschritten).
- **Parallelstruktur:** „für Ja" / „für Nein" sind zwei einseitige Stützrichtungen
  — je ein Eimer, je per Oder kombiniert (steckt schon in der Pro/Kontra-Trennung).

**Kehrseite (bewusst): Redundanz.** Weil jeder das Argument isoliert bewertet,
nimmt niemand eine Überlappungs-Korrektur vor — zwei Rater, die denselben Punkt
meinen, zählen bei `γ=1` als zwei unabhängige Evidenzen. Genau dagegen schützt
**`γ<1`** (oder Top-k): die Dämpfung ist die *logische Ergänzung* zu dieser Frage,
kein Notbehelf. Heute `γ=1`; als nächster Kalibrier-Schritt `γ` senken (z. B. 0.7–0.8),
falls Duplikate die Themen zu schnell auf 100 treiben.

**Lehmer (p=2)** bleibt als Alternative verfügbar (`AGG_METHOD = "lehmer"`,
`AGG_LEHMER_P`) — sanftere Akkumulation ohne harte Sättigung, falls Noisy-OR auch
mit γ-Dämpfung zu aggressiv wirkt.

## Pro/Kontra-Verrechnung

Wir aggregieren **jede Seite für sich** (Pro-Score, Kontra-Score, gleiche Methode)
und verrechnen dann zur Netto-Richtung `Pro − Kontra`. Bewusst getrennt, weil:

- „starke Pros UND starke Kontras" (kontroverses Thema) ist informativ etwas
  anderes als „schwache Pros UND schwache Kontras" (irrelevantes Thema);
- eine einfache Differenz wirft beides in denselben Topf.

→ **Netto-Richtung** (`aggregateLeaning`) und **Kontroversität** (`aggregateDissent`)
sind getrennte Signale. Die Kontroversität (Amber-Blitz im Meinungsrad) ist
`2·min(Pro,Kontra)/(Pro+Kontra)` und liegt ebenfalls zentral in `aggregate.ts` —
unabhängig von `AGG_METHOD` (Richtung vs. Streit sind verschiedene Dinge).

## Wo es implementiert ist

- **Zentral:** [`services/front/src/lib/aggregate.ts`](../services/front/src/lib/aggregate.ts)
  - `AGG_METHOD` (+ `AGG_LEHMER_P` / `AGG_POWER_P`) — die einzigen Schalter.
  - `aggregateLeaning(contribs)` / `nodeLeaning(node)` — Haltung ∈ [−1,1] | `null`.
  - `aggregateDissent(contribs)` / `nodeDissent(node)` — Kontroversität ∈ [0,1].
  - `collectLeaningContribs(node)` — distinct Beiträge eines Teilbaums.
- **Verbraucher (alle ziehen automatisch nach):**
  - `components/position-cloud.tsx` — Badge + Sortierung (Haltung).
  - `components/taxonomy-sunburst.tsx` — Segment-Farbe + Hover-Kennzahl (Haltung),
    Amber-Blitz (Kontroversität).
  - `components/taxonomy-view.tsx` — ThemeCard-Insight (Haltung + Kontroversität).

### Daten / Konsistenz

- **Datenmodell-Wechsel:** Die `preference`-Werte (0–100) bedeuten jetzt *Stärke*
  (unipolar), nicht mehr *zentrierte Zustimmung* (50 = neutral). Alt erfasste
  Test-Ratings werden umgedeutet — als sauberer Schnitt behandelt, keine Migration.
  Kein Schema-Eingriff (`app_likes.preference` bleibt Integer 0–100).
- Die UI rechnet Haltung/Kontroversität **selbst** aus den Beiträgen (zentral).
  Das serverseitige `proLeaning`/`dissent` (`taxonomy.py`) und das Live-Patch-Pendant
  (`taxonomy.ts`) nutzen dieselbe unipolare Formel, werden von der UI aber nicht
  mehr gelesen — der **Aggregierungs-Schalter wirkt nur frontend-zentral**.
- Ein Thema ohne bewertete Argumente liefert `null` (= unbewertet/weiß); ein Thema
  mit lauter 0-Bewertungen liefert `0` (= bewertet, kein Schub).

## Kalibrieren (Empfehlung)

5–10 Themen nehmen, bei denen das „richtige" Gesamturteil aus dem Bauch klar ist,
und prüfen, welche Methode + Parameter (`p`, `β`, `k`) diese Urteile am besten
reproduziert. So wird der Regler **datengetrieben** gewählt statt geraten.
