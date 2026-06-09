// ─── Return-to-origin nach Login ─────────────────────────────────────────────
// Wenn ein nicht eingeloggter Nutzer einen Deep-Link (z. B.
// /ballot/663/arguments/taxonomy?ov=argument%3A…) öffnet, leitet der Guard in
// app/(app)/layout.tsx auf die Login-Seite um. Damit der Nutzer NACH der
// Authentifizierung wieder am Ursprungs-Link landet, merken wir uns dessen Pfad
// (inkl. Query-String, also auch `?ov=…`) in localStorage.
//
// Warum localStorage (nicht sessionStorage):
//  - Short-Code-Flow: bleibt im selben Tab → beides würde reichen.
//  - Magic-Link-Flow: der E-Mail-Link öffnet i. d. R. einen NEUEN Tab desselben
//    Browsers. localStorage ist über Tabs derselben Origin geteilt, sessionStorage
//    NICHT. Daher localStorage.
//  - Grenze: Klick auf einem ANDEREN Gerät/Browser teilt den Storage nicht — dort
//    landet man nach Login auf dem Fallback (/home). Für denselben Browser (der
//    gemeldete Fall) funktioniert es.

const RETURN_TO_KEY = "poltr_return_to";

// Nur same-origin-relative Pfade zulassen (Schutz vor Open-Redirect) und die
// Auth-/Root-Seiten ausschliessen — dorthin zurückzuspringen ergäbe eine Schleife.
function isUsableReturnTo(path: string): boolean {
  if (!path.startsWith("/")) return false; // absolute URLs / Protokoll verbieten
  if (path.startsWith("//") || path.startsWith("/\\")) return false; // //evil.com
  if (path === "/" || path.startsWith("/auth/")) return false;
  return true;
}

/** Merkt sich den Zielpfad (pathname + search), den der Nutzer ursprünglich wollte. */
export function stashReturnTo(path: string): void {
  if (typeof window === "undefined") return;
  if (!isUsableReturnTo(path)) return;
  try {
    localStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // Storage nicht verfügbar (Private Mode o. ä.) → ohne Return-to fortfahren.
  }
}

/**
 * Liest den gemerkten Zielpfad EINMALIG aus (und löscht ihn). Liefert `fallback`
 * (Default `/home`), wenn nichts Brauchbares gespeichert ist.
 */
export function consumeReturnTo(fallback = "/home"): string {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(RETURN_TO_KEY);
    localStorage.removeItem(RETURN_TO_KEY);
    if (v && isUsableReturnTo(v)) return v;
  } catch {
    // ignore
  }
  return fallback;
}
