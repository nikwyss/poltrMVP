# _archive

Stillgelegte Komponenten/Experimente. **Nicht** in die App eingebunden und vom
Build ausgeschlossen (`tsconfig.json` → `exclude: ["_archive"]`), damit sie weder
gebündelt noch typgeprüft werden. Hier liegen Sachen, die wir nicht mehr zeigen,
aber zum Nachschlagen/Reaktivieren aufheben.

| Datei | War | Archiviert |
|-------|-----|------------|
| `components/topic-panorama.tsx` | Themen-Panorama (überlagerte „Bergketten" je Thema) | 2026-06-15 |
| `components/taxonomy-icicle.tsx` | Meinungsband (Eiszapfen / ausgerollte Hierarchie nach Haltung) | 2026-06-15 |
| `components/position-band.tsx` | „Deine Position je Thema" (divergierendes Balkendiagramm) | 2026-06-15 |

Alle lagen auf der Taxonomie-Analyse-Seite
(`src/app/(app)/ballot/[id]/arguments/taxonomy/page.tsx`).

Reaktivieren: Datei zurück nach `src/components/` schieben und auf der
Taxonomie-Seite wieder importieren/rendern. Die zugehörigen i18n-Keys sind in
`messages/*.json` weiterhin vorhanden (`panorama*`, `icircleTitle`, `band*`).
Achtung: `panoramaNo`/`panoramaYes` werden noch von `position-cloud.tsx` genutzt
— nicht entfernen.
