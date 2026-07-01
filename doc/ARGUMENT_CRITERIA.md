# Die fünf Kriterien für neue Argumente

Neue, von Nutzern verfasste Argumente (`source: sourceUser`) werden an **fünf offiziellen Kriterien** gemessen. Diese fünf sind die **einzige** Messlatte und gelten in **zwei Stufen** (gleiche Kriterien, anderer Prüfer):

| # | Kriterium | Frage |
|---|-----------|-------|
| 1 | **Stimmigkeit** | Ist es ein nachvollziehbares Argument (Aussage + Begründung) und passt der Text zur gewählten Position (PRO/CONTRA)? |
| 2 | **Umgangston** | Sachlich/respektvoll — keine Beschimpfungen/Vulgaritäten? (Harte *Sach*kritik ist ausdrücklich ok.) |
| 3 | **Thematik** | Bezieht es sich auf die Vorlage, und zu welchem Hauptthema passt es (sonst „Anderes")? |
| 4 | **Fokus** *(Unity of Thought)* | Trägt der Text **genau einen** zusammenhängenden Gedanken vor — und nicht ein Sammelsurium mehrerer Argumente, die besser einzeln eingereicht würden? |
| 5 | **Kein Duplikat** | Existiert nicht bereits ein (nahezu) gleiches Argument **gleicher Position**? |

> **Faktische Richtigkeit ist bewusst KEIN Kriterium.** Weder die KI noch die Reviewer bewerten die politische „Richtigkeit" einer Meinung (Civic-Speech). Geprüft wird Form/Qualität/Redundanz, nicht der Standpunkt.

## Stufe 1 — Automatische Vorprüfung (beim Einreichen)

Im Composer („**Einreichung vorbereiten**") laufen alle fünf Kriterien automatisch, **bevor** das Argument eingereicht wird:

- **Stimmigkeit, Umgangston, Thematik, Fokus:** ein **LLM**-Call (Infomaniak Gemma, JSON-Prompt) — [services/calculator/src/review/stance.py](../services/calculator/src/review/stance.py). Fokus (`single_thought`) ist eine **formale/strukturelle** Eigenschaft (ein Gedanke vs. Sammelsurium), kein Inhaltsurteil — dasselbe wie Stimmigkeit/Thematik. Ist gar **kein Argument erkennbar** (`is_argument=false`, z.B. Kauderwelsch), ist Fokus *unbeurteilbar* → `single_thought=null`, es wird **keine** Fokus-Empfehlung gezeigt; der Hinweis „kein erkennbares Argument" kommt über die **Stimmigkeit** (sonst gäbe die Maschine für Buchstabensalat die irreführende Begründung „bündelt mehrere Argumente").
- **Kein Duplikat:** **Embedding**-Cosine gegen bestehende Argumente gleicher Position — [services/calculator/src/embedding/similarity.py](../services/calculator/src/embedding/similarity.py). Technik-Detail: [DUPLICATE_CHECK.md](DUPLICATE_CHECK.md).
- Orchestrierung/Bündel: AppView [precheck.py](../services/appview/src/routes/deliberation/precheck.py) → `app.ch.poltr.argument.precheck` (Felder `duplicates`, `stance`, `topic`, `tone`, `unity`).

**Zusätzliche Composer-Empfehlung (nur Stufe 1): Länge.** Rein **clientseitiger Zeichen-Count** (kein LLM, kein Backend) im [add-argument-modal.tsx](../services/frontend/src/components/add-argument-modal.tsx) — flaggt **zu kurze** (`MIN_ARGUMENT_CHARS = 120`) *und* **zu lange** Texte (`MAX_ARGUMENT_CHARS = 800`) mit je eigener Empfehlung. Datenbasis (99 Bestands-Argumente 663.1, Median 334): unten liegt kein akzeptiertes unter 92 Zeichen, nur ~4 % unter 120; oben ist p95 ≈ 819, > 800 sind die obersten ~6 % (rambling / mehrere Punkte gebündelt → „kürzen oder aufteilen"). Bewusst **kein** offizielles Peer-Review-Kriterium (Stufe 2 sieht das ganze Argument und bewertet Länge nicht separat) — nur ein Verfasser-Nudge.

**Verhalten:** Die Prüfstufe ist als **Empfehlung** gerahmt, nicht als Test — der Verfasser entscheidet, das letzte Wort haben die GutachterInnen. Nach dem Vorbereiten zeigt der Composer eine **Zusammenfassung in drei Zuständen** und darunter **nur die beanstandeten** Kriterien:
- nichts beanstandet & alle Checks gelaufen → ✓ „gute Chancen, aufgenommen zu werden";
- etwas beanstandet → 💡 „Empfehlungen …" + die betroffenen Kriterien-Kästchen (⚠);
- nichts beanstandet, aber ein Check `unavailable` → neutrale Zeile (kein „gute Chancen"-Versprechen), Einreichen bleibt möglich.
**Nicht-blockierend**; Beanstandungen müssen beim Einreichen aktiv bestätigt werden. Der Themenvorschlag / „Anderes"-Hinweis ist rein informativ und wird in dieser fokussierten Ansicht nicht mehr gezeigt (kein Membership-Write — die Taxonomie-Zuordnung bleibt Snapshot-owned). Gesamtkonzept: [LM_PEER_REVIEW.md](LM_PEER_REVIEW.md).

## Stufe 2 — Menschliches Peer-Review (nach dem Einreichen)

Nach dem Einreichen ist das Argument „preliminary". Zufällig ausgewählte Community-Mitglieder begutachten es und geben **ein Gesamturteil** ab: *Soll dieses Argument in den Argumentenkatalog aufgenommen werden — ja/nein?* (= `vote` APPROVE/REJECT; die Mehrheit entscheidet über `approved`/`rejected`). Mechanik (Einladung, Quorum, Eligibility, Schliessung): [PEER_REVIEW.md](PEER_REVIEW.md).

**Bewertungs-Modus (Entscheid 2026-06-30):**
- **Gesamturteil ja/nein** ist verbindlich und wird ausgezählt. Im Reviewer-Formular ist es als **übergeordnete, hervorgehobene Karte** von den Kriterien abgesetzt (visuell klar: das ist die massgebliche Entscheidung).
- **Pro Kriterium** gibt der Gutachter ein leichtes Flag **ok / beanstandet** (kein 1–5-Rating) — als strukturiertes Signal, nicht als Stimmenzählung. Der UI-**Default ist „nichts gewählt"** (✓/✗-Toggle, erneuter Klick deselektiert), aber die Beurteilung ist **Pflicht**: das Gesamturteil (Ja/Nein) ist erst wählbar, wenn **alle** Kriterien beurteilt sind (Backend verlangt eine nicht-leere Kriterien-Liste). Verbindlich für die Aufnahme bleibt das Gesamturteil.
- **Kein Duplikat ist konditional:** Die Duplikat-Frage erscheint dem Gutachter **nur, wenn ein Live-Embedding-Check ein konkretes ähnliches Argument gleicher Position findet** (same-stance, Schwelle 0.66, Argument selbst ausgeschlossen). Begründung: ab ~10 Argumenten kann ein Mensch Duplikate nicht mehr zuverlässig selbst entdecken — er kann nur einen *vorgelegten* Kandidaten bestätigen/verwerfen; das Kriterium ist technisch (nicht ethisch-politisch); und ein Duplikat zu viel ist tolerierbar. Der Mensch wird damit zum *Bestätiger*, nicht *Entdecker* (Recall an die Schwelle gebunden). Bestätigt der Gutachter das Duplikat → Vorauswahl „nein" (überschreibbar).
- **Kein Freitext/Begründung** (Entscheid 2026-07-01): Das Gutachten kennt bewusst *kein* Begründungsfeld mehr — es zählt allein das Gesamturteil (+ optionale Kriterien-Flags). Frühere „Begründung bei Ablehnung"-Pflicht ist entfallen (Frontend, AppView-Guard, Community-Writer-Gate und Lexikon `justification` gestrichen).
- **Keine KI-Bewertung wird dem Gutachter gezeigt** (Stimmigkeit/Umgangston/Thematik aus Stufe 1): er urteilt frisch → kein Anchoring. Einzig der faktische, selbst nachprüfbare Duplikat-Kandidat wird vorgelegt.
- Kriterien-Endpoint: `app.ch.poltr.peerreview.criteria` ([reviews.py](../services/appview/src/routes/deliberation/reviews.py)), Default über `APPVIEW_PEER_REVIEW_CRITERIA`: `coherence` (Stimmigkeit), `tone` (Umgangston), `topic` (Thematik), `unity` (Fokus), `non_duplication` (Kein Duplikat). Der Gutachter gibt zu **Fokus** ein einfaches ok/beanstandet ab (frisches Urteil, keine Stufe-1-KI-Bewertung sichtbar) — ebenso wie zu Stimmigkeit/Umgangston/Thematik.

## Verhältnis der zwei Stufen

Stufe 1 ist **assistierend** (hilft dem Verfasser, sauber einzureichen — schnell, automatisch, unverbindlich). Stufe 2 ist **autoritativ** (entscheidet community-seitig über Aufnahme). Beide an denselben fünf Kriterien — der Nutzer weiss beim Verfassen schon, woran sein Argument später gemessen wird.

Curated content (`sourceOfficial`, `sourceOrganization`) ist von beiden Stufen ausgenommen (upstream freigegeben).

## Empirische Auswertung

Retrospektive Anwendung der Kriterien auf die 99 Bestands-Argumente von Ballot 2 (663.1): **[ARGUMENT_CRITERIA_ANALYSIS.md](ARGUMENT_CRITERIA_ANALYSIS.md)** (Rohdaten + Reproduktions-Skripte unter [analysis/](analysis/)). Kurz: 70 % liefen ohne Beanstandung durch, häufigstes ⚠ ist das Duplikat-Kriterium (19 %). *(Die Auswertung entstand vor Einführung des Fokus-Kriteriums und deckt die ersten vier ab.)*
