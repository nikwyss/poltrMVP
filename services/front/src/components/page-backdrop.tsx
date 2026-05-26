/**
 * Dekoratives Hintergrundbild für eine Seite (z. B. die Arkaden-Grafik).
 *
 * Liegt als `fixed`, `-z-10`-Ebene hinter dem Inhalt — der Seiteninhalt bleibt
 * voll bedienbar (`pointer-events-none`). Funktioniert nur, wenn kein Vorfahre
 * einen deckenden Hintergrund über die negative z-Ebene legt: Das `(app)`-Layout
 * ist deshalb transparent, die Seitenfarbe kommt vom `body` (`globals.css`).
 *
 * Gedacht als kleiner „Template"-Baustein: einzelne Seiten klinken sich per
 * `<PageBackdrop />` ein (Login + Home), andere bleiben schlicht.
 */
export function PageBackdrop({
  src = "/images/arcades_fine.svg",
  opacity = 0.18,
}: {
  /** Bildpfad in `public/` (Default: feine Arkaden-Grafik). */
  src?: string;
  /** Deckkraft 0–1 (Default 0.18 — dezentes Wasserzeichen). */
  opacity?: number;
} = {}) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      style={{ opacity }}
      className="pointer-events-none fixed bottom-0 left-0 -z-10 h-[60vh] w-auto select-none"
    />
  );
}
