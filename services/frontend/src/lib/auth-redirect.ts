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
//
// Cross-Device: localStorage wird über Geräte/Browser NICHT geteilt. Damit der
// Magic-Link auch auf einem anderen Gerät zurückführt, schickt der Begrüssungs-
// Screen den gemerkten Pfad zusätzlich an den Server (ch.poltr.auth.start →
// Spalte `return_url` in der Pending-Zeile). Die Verify-/Code-Pfade bevorzugen
// deshalb `data.returnUrl` aus der Antwort und fallen nur auf den localStorage-
// Wert zurück. `peekReturnTo` liest den Pfad fürs Mitschicken, OHNE ihn zu
// löschen — gelöscht wird erst beim finalen `consumeReturnTo`.

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
 * Liest den gemerkten Zielpfad, OHNE ihn zu löschen — zum Mitschicken an den
 * Server (sendMagicLink/register), damit der Cross-Device-Fall über `return_url`
 * funktioniert. Liefert `null`, wenn nichts Brauchbares gespeichert ist.
 */
export function peekReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(RETURN_TO_KEY);
    if (v && isUsableReturnTo(v)) return v;
  } catch {
    // ignore
  }
  return null;
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
