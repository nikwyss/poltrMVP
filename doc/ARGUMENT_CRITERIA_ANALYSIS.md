# Analyse: Die vier Argument-Kriterien auf Ballot 2 (663.1)

> Retrospektive Auswertung — *wie viele bestehende Argumente hätten die [vier offiziellen Kriterien](../ARGUMENT_CRITERIA.md) bei der automatischen Vorprüfung beanstandet bekommen?* Stand: 2026-06-30. Rohdaten: [`ballot2_llm.json`](analysis/ballot2_llm.json), [`ballot2_dup.tsv`](analysis/ballot2_dup.tsv) (liegen neben diesem File).

## Datenbasis & Methode

- **Ballot:** CMS-ID 2 = `ballot_rkey 663.1` (Klima-/Stromvorlage).
- **Korpus:** 99 von Nutzern verfasste Argumente (`source_type='user'`, nicht gelöscht), 51 PRO / 48 CONTRA, alle `de-CH`.
- **Kein Duplikat:** deterministisch über die gespeicherten `app_embeddings` (de-CH). Für jedes Argument die maximale Cosine-Ähnlichkeit zu einem *anderen* Argument **gleicher Position** derselben Vorlage (Vergleichspool = alle Argumente der Vorlage inkl. amtliche; sich selbst ausgeschlossen). Schwelle **0.66** (Produktions-Default `CALCULATOR_DEDUP_SIM_THRESHOLD`).
- **Stimmigkeit / Umgangston / Thematik:** der echte LLM-Endpoint `POST /api/review/stance` (Infomaniak Gemma) je Argument, Severity-Ableitung wie in [`precheck.py`](../services/appview/src/routes/deliberation/precheck.py).
- **„Beanstandet“ = ⚠ (warn).** Die Checks sind bewusst **weich/nicht-blockierend** — ein „Durchfallen“ gibt es technisch nicht; gezählt wird, wann ein Kriterium gewarnt hätte.

## Ergebnis pro Kriterium

| Kriterium | beanstandet (⚠) | Anteil |
|---|---|---|
| Kein Duplikat | 19 | 19% |
| Thematik (off-topic) | 10 | 10% |
| Stimmigkeit (Position passt nicht) | 3 | 3% |
| Umgangston (harsch) | 1 | 1% |

Dazu **10** weiche Stimmigkeits-*Hinweise* (`sev=hint`: „liest sich nicht klar als eigenständiges Argument“ — nur Hinweis, kein ⚠).

## Verteilung: Anzahl beanstandeter Kriterien je Argument

| # Kriterien ⚠ | Argumente | Anteil |
|---|---|---|
| 0 | 69 | 70% |
| 1 | 27 | 27% |
| 2 | 3 | 3% |
| 3 | 0 | 0% |
| 4 | 0 | 0% |

**69/99 (70%) liefen ohne jede Beanstandung durch. 30 (30%) hätten mindestens eine** — fast immer genau eine, überwiegend das Duplikat-Kriterium. Kein Argument trifft 3 oder 4 Kriterien.

## Thematik-Zuordnung (Variante B)

| Hauptthema | Argumente |
|---|---|
| Klimaschutz & Umwelt | 49 |
| Kosten & finanzielle Auswirkungen | 14 |
| ANDERES | 11 |
| Staatliche Eingriffe & Regulierung | 9 |
| Versorgungssicherheit & Stromversorgung | 8 |
| Umsetzbarkeit & Planbarkeit des Umbaus | 8 |

`ANDERES` ist **kein** Fehler — das Argument ist on-topic, es passt nur kein bestehendes Hauptthema; es bliebe unplatziert (Snapshot bleibt Quelle). Die Thematik-Beanstandungen unten sind die *off-topic*-Fälle.

## Detail — beanstandete Argumente

### Kein Duplikat (19) — max. Ähnlichkeit zum nächsten gleichgesinnten Argument
| Titel | Position | max_sim |
|---|---|---|
| Förderung des innovativen Wirtschaftsstandorts Schweiz | PRO | 0.819 |
| Schweizer Innovationskraft nutzen | PRO | 0.819 |
| Global | CONTRA | 0.751 |
| Weltweit statt nur Schweizweit | CONTRA | 0.751 |
| Bevormundung | CONTRA | 0.731 |
| Bevormundung | CONTRA | 0.731 |
| Grösse des Landes ist kein Argument | PRO | 0.723 |
| Verantwortung übernehmen | PRO | 0.723 |
| ÖV | PRO | 0.685 |
| ÖV interessanter gestalten | PRO | 0.685 |
| Weniger ist mehr | CONTRA | 0.675 |
| Weniger ist mehr - Stromsparen ist besser als teure Klimaschutzmassnahmen treffen müssen. | CONTRA | 0.675 |
| Strom sparen.... | CONTRA | 0.673 |
| Sparen auf Kosten von uns | CONTRA | 0.673 |
| Fossile Energien | PRO | 0.672 |
| Sinnlos | CONTRA | 0.672 |
| Wo bleibt die Mithilfe unserer Nachbarn! | CONTRA | 0.672 |
| Ein Anfang muss gemacht werden | PRO | 0.660 |
| Es muss klein anfangen | PRO | 0.660 |

Erkennbare Paare: „Förderung des innovativen Wirtschaftsstandorts“ ↔ „Schweizer Innovationskraft nutzen“ (0.82); „Global“ ↔ „Weltweit statt nur Schweizweit“ (0.75); 2× „Bevormundung“ (0.73); „ÖV“ ↔ „ÖV interessanter gestalten“; mehrfach „Weniger ist mehr“.

### Thematik / off-topic (10)
| Titel | Position | LLM-Feedback |
|---|---|---|
| ÖV | PRO | Der Text befasst sich primär mit dem ÖV und allgemeinen Massnahmen, bezieht sich aber nicht konkret auf die vorliegende Gesetzesvorlage. |
| ÖV interessanter gestalten | PRO | Der Text befasst sich primär mit dem öffentlichen Verkehr und nicht mit den spezifischen Massnahmen der vorliegenden Energievorlage. Zudem ist nicht klar, ob dies als Argument für oder gegen die Vorlage dienen soll. |
| Weniger ist mehr | CONTRA | Der Text enthält allgemeine Tipps zum Energiesparen, bezieht sich aber nicht konkret auf die Abstimmungsvorlage und begründet nicht, warum man gegen das Gesetz stimmen sollte. |
| Greenwashing | CONTRA | Der Text befasst sich mit Fleischkonsum und Grossverteilern, stellt aber keinen Bezug zur konkreten Abstimmungsvorlage über das Klimaschutzgesetz her. |
| Junge Generation sensibilisieren | PRO | Der Text enthält keine Begründung, warum man die Vorlage annehmen sollte, sondern beschreibt eine allgemeine Beobachtung über junge Menschen. Bitte beziehe das Argument direkt auf die Massnahmen der Vorlage. |
| Einheitlich | PRO | Das Argument bezieht sich auf eine globale Lösung und nicht spezifisch auf die vorliegende Schweizer Vorlage. Es ist daher unklar, ob dies als Pro- oder Contra-Argument für dieses Gesetz gelten soll. |
| Nachhaltigkeit als Schulfach | PRO | Das Argument bezieht sich auf Bildung und Schulhausbau, nicht auf die spezifischen Massnahmen des Gesetzes zur Energiesicherheit und Klimaneutralität. |
| Weniger ist mehr | CONTRA | Das Argument bezieht sich auf die Zuwanderung und nicht auf die spezifischen Massnahmen der vorliegenden Energievorlage. |
| Zum | PRO | Der Text enthält kein Argument, sondern lediglich eine kurze Bewertung. Bitte formuliere eine konkrete Aussage mit einer Begründung. |
| vka | CONTRA | Der Text enthält keine erkennbaren Wörter oder Argumente. Bitte formulieren Sie eine konkrete Aussage mit Begründung. |

### Stimmigkeit / Position passt nicht (3)
| Titel | Position | Befund |
|---|---|---|
| Konsens wertschätzen | CONTRA | liest sich als pro, gewählt CONTRA |
| CO2 Preis | CONTRA | liest sich als pro, gewählt CONTRA |
| Mittelschicht | PRO | liest sich als contra, gewählt PRO |

### Umgangston / harsch (1)
**„Immer mehr Verbote und Gesetze“** (CONTRA)

> Wir werden ständig mit neuen Verboten und Gesetzen bevormundet. Irgendwann reicht es auch mal. Zumal häufig noch Forderungen nach noch mehr Abgaben und Gebühren, von Leuten kommen die selber noch nie gearbeitet haben und nicht wissen, was es heisst schwer erarbeiteten Geld ständig für wieder eine neue Abgabe/Gebühr zu verschleudern.

LLM (`tone: harsh`): *Das Argument ist nachvollziehbar, enthält jedoch persönliche Angriffe gegen bestimmte Personengruppen, was den Ton unangemessen macht.* — die pauschale Abwertung „von Leuten … die selber noch nie gearbeitet haben“. Harte Sachkritik wäre `ok`; hier ist es ein Angriff auf eine Personengruppe. Komplementär zu Ozone.

### Stimmigkeits-Hinweise (sev=hint, nicht-blockierend) — 10
„Weniger ist mehr“ (CONTRA), „Was ist machbar“ (CONTRA), „Greenwashing“ (CONTRA), „Alle zusammen“ (CONTRA), „Junge Generation sensibilisieren“ (PRO), „Strommangelage kontra E-Mobilität“ (CONTRA), „Erneuerbare Energie auf den Dächern der Schweiz“ (CONTRA), „PV-Anlagen“ (PRO), „Zum“ (PRO), „vka“ (CONTRA)

## Caveats

- Stimmigkeit/Umgangston/Thematik stammen vom LLM → leicht nicht-deterministisch; ein Re-Run kann um ±2–3 Fälle schwanken. Der Duplikat-Teil ist deterministisch.
- Zurückhaltende Kalibrierung (Civic-Speech): die niedrigen Stimmigkeit-/Ton-Quoten (3 %/1 %) sind gewollt, kein Erkennungsproblem.
- 5 Hauptthemen (≤ `TOPIC_MAX_INLINE`=7) → keine Embedding-Vorauswahl, alle Themen wurden dem LLM inline gegeben.

## Reproduktion

Port-forwards (Postgres `5432`, Calculator lokal `3005`), dann die Skripte aus dem Scratchpad: `analyze_ballot2.py` (LLM, concurrent/resumable), Duplikat-SQL über `app_embeddings`, `aggregate.py`. Siehe Rohdaten-Dateien in diesem Ordner.
