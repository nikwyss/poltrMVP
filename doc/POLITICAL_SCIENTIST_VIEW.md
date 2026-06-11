# Überlegungen zur Demokratischen Qualität der Plattform

## User Benefits
- Für sich selbst: Meinugnsbildung
- Partizipation (Argumente) fliesst in Meinungsbild für andere ein. (auch via KI-Chatbot) => Some Impact
- 

## Keine Engagement-Optimierung
- Kein Algorithmus, der auf Verweildauer/Empörung optimiert. Keine Dark Patterns.
- Non-Commercial (Lizenz) ist nicht nur Code-Ethik, sondern Geschäftsmodell-Ethik: keine Anreize zur Polarisierung.
- Statische Randomisierung statt personalisiertem Ranking = keine Filterblase.

## Inklusion & Barrierefreiheit
- CH-Mehrsprachigkeit (DE/FR/IT, ev. RM) — sonst strukturelle Exklusion.
- Barrierefreiheit (Sehschwäche bereits bei Farben bedacht — konsequent weiterdenken: Screenreader, Kontraste).
- Option: Leichte Sprache / Plain Language als Teil des "Light Path".

## One point of truth. 
- DER Ort um offizielle Argumente zu diskutieren. Dazu gehört auch die Argumente, die eben fehlen.

## Offizielle Argumente
- Achtete auf mögliche Gleichstellung
- Trotzdem: sie werden als erstes aufgelistet
- Und anhand deren wurde die thematisch Grobeinteilung gemacht

## cognitive overload:
-  Ein Versuch tief verschachtelte diskussion darzustellen, ohne die leute zu überfordern.
   -  Light path: user können einfach die offiziellen argumnete bewerten und diskutieren, ohne in die tiefe gehen zu müssen.
   -  Deep dive: User können die themen/argumnete in der tiefe durchstöbern.
- AI hilft dort wo möglich, um kognitive Anforderungen zu reduzieren. (Gegencheck, Thematische Einordnung, Redundanzen-Check)

## colors: pro/contra: blue vs. red. 
- Sehschwächen
- "Nein" ist nicht falsch (daher nicht rot)
- Technisch: grau als sauberer mittelpunkt.

## Anonymität
- Innere hürden sich zu beteiligen tief halten
  
## Pseudonyms e.g. L. Eiger: 
- ohne eigens gesetzte signals und Gender-neutral 
- Trotzdem mit Identifikationswert und auch utnerhaltungswert

## Randomisierung:
- randomisierung aber konstant: pro -user bleibt reihenfogle konstant
  

## KI und Diskussionsmoderation
- KI darf helfen, aber nie das letzte wort haben. (human approval)
- Nicht nur "human approval", sondern: KI-Eingriffe sind als solche gekennzeichnet (kein verdecktes Moderieren).
- Transparente Prompts/Modelle (Lizenz) → KI-Entscheide sind auditierbar, nicht Blackbox.
- Ziel: sie helfen cognitive load für user und moderationskosten tief zu halten.

## Moderation (Ozone)
- Öffentliche, nachvollziehbare Moderationslabels statt stiller Löschung.
- Community-Standards: Inhalt vs. Person — Argumente angreifbar, Personen geschützt (Pseudonymität stützt das).

## Schweizer & ethisches Hosting
- Datenhoheit: Betrieb auf CH-Infrastruktur (Infomaniak Public Cloud) — keine US-Cloud, kein CLOUD Act.
- Demokratische Debatte über CH-Vorlagen gehört unter CH-Jurisdiktion (DSG/revDSG).
- Ethischer Provider: Infomaniak (ökologisch, datenschutzorientiert, genossenschaftsnah) statt Hyperscaler.
- Souveränität auf allen Ebenen: eigenes PDS/AppView/Indexer statt Abhängigkeit von Big-Tech-Diensten.
- Konsistent mit ATProto-Idee: Selbst-Hosting der Diskussionsstruktur, kein Plattform-Lock-in.


## Atproto: 
- Signierte, öffentliche Transparenz des Ablaufs.
- Vision öffentliche, zentrale Diskussionstruktur für Abstimmungsdebatten 

## Lizenz Fair-Source:  PolyForm Noncommercial 1.0.0
Transparenzer Code, transparente Pompts, transparente Modelle

## Bottom-Up:
User können eigenen Argumente vorschlagen. Community prüft Vorschläge gegenseitig.

# Against Domination
- User dürfen nur beschränkte menge Kommentare und Argument-Vorschläge einbringen. (Tageslimit und Ballotlimite)

# NOT IMPLEMENTED

## Verifizierung & "One Person, One Voice" (ZUKUNFT)
- Swiss eID (Verifier) stellt sicher: echte Stimmberechtigte, keine Bots/Sockenpuppen.
- Trotzdem strikte Trennung: Verifikation ≠ Identität. Beteiligung bleibt anonym/pseudonym.
- Demokratische Qualität = Manipulationsresistenz OHNE Deanonymisierung.
- Zentrale Spannung: niedrige Hürde (Anonymität) vs. Integrität (Verifikation) — eID löst beides.


## Grauer hintergrund
"das durchgehende Sandstein-Beige inzwischen deine Identität. Es hat diese warme, papierne «Abstimmungsbüchlein»-Anmutung, die perfekt zum Dossier-Konzept passt und dich von jedem generischen weissen SaaS-Interface unterscheidet."


## Blockadenschutz vor DoS Attacken - Spoofing.
- Rate limits (per email und per IP)
- captcha noch nicht implementiert. aufgrund US-Abhängigkeit (Cloudflare Turnstile) oder Kosten (Friendly Captcha))