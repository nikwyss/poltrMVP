"""
LLM-Schnittstelle (Variante B — Grounded-Theory-Stil):
  • open_code   — ein Argument unabhängig in mehrere kurze Codes zerlegen
  • axial_group — alle Codes gemeinsam zu wenigen Achsen gruppieren

Implementierungen: AnthropicLLM (axial + Open-Coding-Fallback),
InfomaniakOpenCoder (Open Coding produktiv via Gemma).
"""

from __future__ import annotations


# Sentinel-Notiz bei LLM-Fehler im Open Coding — solche (transienten) Fallbacks
# werden NICHT persistiert, damit ein API-Fehler nicht festgeschrieben wird.
OPEN_CODE_ERROR_NOTE = "Fallback (LLM-Fehler)."
# Sentinel-Notiz, wenn das Modell für ein Argument KEINEN Code erzeugt hat
# (z.B. inhaltsleerer Text / „lorem ipsum"). Erfolgreich verarbeitet, aber leer.
OPEN_CODE_EMPTY_NOTE = "Kein Code erzeugt."

# Prompts liegen zentral in src/prompts.py.


class LLMClient:
    """Basisklasse. Konkrete Clients überschreiben die Methoden."""

    name: str = "base"
    # Signatur des Open-Coding-Verhaltens (Modell + Prompt). Geht in den
    # Cache-Key ein, damit ein Modell-/Prompt-Wechsel den Cache invalidiert.
    open_code_signature: str = "base"

    def open_code(self, argument: str, max_codes: int = 3,
                  raise_on_error: bool = False) -> list[dict]:
        """Open Coding: ein Argument unabhängig in 1..max_codes kurze Codes
        zerlegen. Rückgabe: [{code, note, confidence}]. Mit `raise_on_error=True`
        werden API-Fehler propagiert (statt Fallback) — für den Worker, der
        transiente vs. permanente Fehler unterscheiden muss."""
        raise NotImplementedError

    def axial_group(self, codes: list[dict], max_themes: int = 6) -> list[dict]:
        """Axial Coding: alle Codes gemeinsam zu wenigen Streitachsen gruppieren.
        `max_themes` ist ein weicher Cap. Eingabe: [{code, note}]. Rückgabe:
        [{label, description, pole_a, pole_b, codes:[{code, pole}]}] —
        `pole` ∈ {a, b, neutral}."""
        raise NotImplementedError

    def split_axis(self, codes: list[dict], max_sub: int = 3) -> list[dict]:
        """Reorganisation: die Codes EINER überladenen Achse in 2..max_sub
        schärfere Achsen aufteilen (fokussierter zweiter Durchlauf). Gleiche
        Ein-/Ausgabe wie `axial_group`; ein leeres oder einelementiges Ergebnis
        bedeutet «nicht splitten»."""
        raise NotImplementedError
