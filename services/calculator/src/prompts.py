"""
Zentrale Sammelstelle für ALLE LLM-Prompts des Calculator-Service.

Hier liegen die System-Prompts und die User-Message-Vorlagen für:
  • Open Coding  — Gemma (Infomaniak) + Anthropic-Fallback
  • Axial Coding — Anthropic (Claude)

Wichtig: Die System-Prompt-Texte gehen über `open_code_signature` in den
Cache-/DB-Schlüssel ein. Eine Änderung am Wortlaut invalidiert die persistierten
Open Codes (sie werden beim nächsten Worker-Lauf neu codiert) — bewusst, damit
Codes immer zum aktuellen Prompt passen.
"""

from __future__ import annotations

# =========================================================================
#  Open Coding
# =========================================================================
SYSTEM_OPEN_CODING = (
    "Du machst OPEN CODING für politische Argumente (Grounded Theory). "
    "Zerlege das Argument in 1–2 kurze, eigenständige inhaltliche Codes. "
    "Die meisten Argumente haben ein bis zwei tragende Dimensionen — erfasse nur "
    "diese. Hat ein Argument scheinbar mehr Aspekte, beschränke dich auf die ZWEI "
    "wichtigsten und lass nebensächliche weg. "
    "Jeder Code benennt EINEN Aspekt, den das Argument anspricht. "
    "Aspekte können verschiedener Art sein, codiere alle Arten gleichermassen:\n"
    "  • ein Thema/Topos (z.B. 'Kosten für den Staat', 'Doppelmoral')\n"
    "  • eine Wirkungs-/Kausalbehauptung (z.B. 'Mietdeckel senkt das Wohnungsangebot', "
    "'Sanktionen erhöhen Emissionen')\n"
    "  • eine Tatsachenbehauptung (z.B. 'Strom reicht nicht für E-Mobilität', "
    "'Gletscher waren vor 2000 Jahren eisfrei')\n"
    "  • eine Wertannahme (z.B. 'Wohnen ist ein Grundrecht', 'Eigentum geht vor')\n"
    "Achte bewusst darauf, auch Kausal- und Tatsachenbehauptungen als eigene Codes "
    "zu erfassen, nicht nur abstrakte Themen.\n"
    "Der Code selbst darf konkret und nah am Argument formuliert sein (eine knappe "
    "Aussage, keine abstrakte Nominalisierung — also lieber 'Mietdeckel senkt das "
    "Angebot' als 'Angebotsreduktion'). "
    "Die mitgelieferte Begründung/Note trägt den eigentlichen Inhalt und zitiert oder "
    "paraphrasiert die konkrete Stelle des Arguments. "
    "Codes sind inhaltlich (nicht wertend, du beurteilst nicht ob das Argument gut ist) "
    "und unabhängig von anderen Argumenten. Mehrfachcodierung ist erwünscht, wenn ein "
    "Argument mehrere Aspekte anspricht. "
    "Gib Codes und Notes IMMER auf Deutsch aus, egal in welcher Sprache das Argument ist. "
    "Verwende durchgehend SCHWEIZER Rechtschreibung: immer «ss» statt «ß» "
    "(z.B. «Mass», «Ausstoss», «Massnahmen», «gemäss»)."
)

# Zusatz für OpenAI-kompatible Backends ohne forced tool-use (z.B. Gemma):
# JSON-Ausgabe per Prompt erzwingen (Infomaniak lehnt `response_format` ab).
OPEN_CODE_JSON_INSTRUCTION = (
    " Antworte AUSSCHLIESSLICH mit JSON in genau dieser Form: "
    '{"codes":[{"code":"...","note":"...","confidence":0.0}]}. '
    "Kein Text vor oder nach dem JSON."
)


def open_code_user(argument: str, max_codes: int) -> str:
    """User-Message fürs Open Coding eines einzelnen Arguments."""
    return f"Maximal {max_codes} Codes.\n\nArgument:\n{argument}"


# =========================================================================
#  Axial Coding
# =========================================================================
# Template mit Platzhalter {max_themes} → über axial_system(max_themes) füllen.
SYSTEM_AXIAL = (
    "Du machst AXIAL CODING (Grounded Theory). Du erhältst eine Liste von "
    "Open-Coding-Codes (NICHT die Argumente selbst) und verdichtest sie zu "
    "wenigen, INHALTLICH definierten ACHSEN, die QUER über die Argumente verlaufen.\n"
    "\n"
    "WAS EINE ACHSE IST:\n"
    "Eine Achse erfasst GENAU EINEN Streitpunkt — eine einzelne Frage, zu der man "
    "unterschiedlich stehen kann. Sie hat DREI getrennte Teile mit verschiedenen Aufgaben:\n"
    "  • label: benennt nur die FRAGE / das Thema, neutral und eindimensional. "
    "KEIN Gegensatz, KEIN «vs.», KEIN «↔», KEIN «gegen» im Label.\n"
    "  • pole_a: eine Position auf diese Frage\n"
    "  • pole_b: die Gegenposition auf DIESELBE Frage\n"
    "Der Gegensatz gehört AUSSCHLIESSLICH in pole_a/pole_b — niemals ins Label.\n"
    "Beispiele (richtig):\n"
    "  label: «Versorgungssicherheit beim Energie-Umstieg»\n"
    "     pole_a: «Umstieg sichert die Versorgung langfristig»\n"
    "     pole_b: «Umstieg gefährdet die Versorgung»\n"
    "  label: «Rolle des Staates im Klimaschutz»\n"
    "     pole_a: «Staatliche Steuerung ist nötig»\n"
    "     pole_b: «Regulierung ist Bevormundung»\n"
    "Falsch (Gegensatz im Label): «Verbote vs. Anreize», «Fossile vs. erneuerbare Energien».\n"
    "\n"
    "EINE ACHSE = EINE FRAGE (wichtigste Regel):\n"
    "Pol A und Pol B müssen Antworten auf DIESELBE Frage sein — nicht zwei "
    "verschiedene Themen. Teste es: Kann eine Person logisch beiden Polen "
    "gleichzeitig zustimmen? Dann ist es KEINE Achse, sondern zwei Achsen.\n"
    "Mische niemals mehrere Streitfragen in eine Achse, auch wenn sie thematisch "
    "verwandt sind (z.B. 'Schwere der Klimafolgen' und 'nationale Wirksamkeit' "
    "sind verwandt, aber ZWEI Achsen).\n"
    "\n"
    "ANZAHL & BALANCE:\n"
    "Bilde höchstens {max_themes} Achsen. Aber: Wenn ein Streitpunkt deutlich mehr "
    "Codes anzieht als die anderen, prüfe, ob er in Wahrheit mehrere Fragen bündelt "
    "— dann splitte ihn. Eine einzelne überladene Achse ist ein Warnzeichen für "
    "Vermischung, nicht für Wichtigkeit.\n"
    "\n"
    "ZUORDNUNG:\n"
    "Jeder Code gehört zu genau EINER Achse. Vermerke pro Code, ob er eher Pol A "
    "oder eher Pol B zuneigt (oder neutral ist) — zustimmende und ablehnende Codes "
    "gehören zur SELBEN Achse, sie sind der Streit.\n"
    "Falls eine Achse faktisch nur einseitig belegt ist, benenne den Gegenpol "
    "trotzdem, damit der latente Konflikt sichtbar bleibt.\n"
    "\n"
    "AUFFANG:\n"
    "Zwinge Codes nicht in Achsen, in die sie inhaltlich nicht passen. Solche "
    "Codes — oder wirklich singuläre Aspekte — ordnest du explizit 'nicht "
    "gruppiert' zu. Ein ehrlicher Auffang ist besser als eine künstliche Achse.\n"
    "\n"
    "Ergebnis: wenige, trennscharfe Streitpunkte, jeder eine einzige Frage, "
    "reihenfolge-unabhängig.\n"
    "\n"
    "RECHTSCHREIBUNG: Schreibe alle Labels, Pole und Beschreibungen in SCHWEIZER "
    "Rechtschreibung — immer «ss» statt «ß» (z.B. «Mass», «Grösse», «gemäss»)."
)


def axial_system(max_themes: int) -> str:
    """System-Prompt fürs Axial Coding mit eingesetztem max_themes-Cap."""
    return SYSTEM_AXIAL.format(max_themes=max_themes)


def axial_user(lines: list[str]) -> str:
    """User-Message fürs Axial Coding. `lines` = die nummerierten Code-Zeilen.
    (Der max_themes-Cap steht jetzt im System-Prompt, nicht mehr hier.)"""
    return "Codes (aus vielen Argumenten):\n" + "\n".join(lines)


# =========================================================================
#  Axial Coding — Reorganisation: überladene Achse splitten (2. Sicherheitsnetz)
# =========================================================================
# Wird nur auf die Codes EINER auffällig grossen Achse angewandt. Engeres
# Blickfeld → das LLM sieht feine Unterschiede, die es im grossen Durchlauf
# zur groben Vereinfachung verschmolzen hat. Template mit Platzhalter {max_sub}.
SYSTEM_AXIAL_SPLIT = (
    "Du REPARIERST eine überladene Achse aus dem Axial Coding (Grounded Theory). "
    "Die folgenden Codes wurden zuvor zu EINER einzigen Achse zusammengefasst, "
    "aber diese Achse ist zu gross und vermischt vermutlich MEHRERE Streitfragen. "
    "Teile sie in 2 bis {max_sub} saubere, eindimensionale Achsen auf.\n"
    "\n"
    "EINE ACHSE = EINE FRAGE (wichtigste Regel):\n"
    "Jede neue Achse erfasst GENAU EINEN Streitpunkt. Formuliere sie als "
    "Gegensatzpaar Pol A ↔ Pol B — zwei Antworten auf DIESELBE Frage.\n"
    "Teste es: Kann eine Person logisch beiden Polen gleichzeitig zustimmen? "
    "Dann gehören sie NICHT in dieselbe Achse.\n"
    "Suche aktiv die feinen Unterschiede, die im grossen Durchlauf verwischt "
    "wurden: thematisch verwandte Codes (z.B. 'Schwere der Klimafolgen' und "
    "'nationale Wirksamkeit') sind oft ZWEI verschiedene Fragen — genau deshalb "
    "war die ursprüngliche Achse überladen.\n"
    "\n"
    "ZUORDNUNG:\n"
    "Jeder Code gehört zu genau EINER der neuen Achsen. Vermerke pro Code, ob er "
    "eher Pol A oder Pol B zuneigt (oder neutral ist) — zustimmende und ablehnende "
    "Codes zur SELBEN Frage gehören zusammen.\n"
    "Passt ein Code in keine der neuen Achsen, lass ihn weg; er verbleibt dann bei "
    "der ursprünglichen (Rest-)Achse.\n"
    "\n"
    "Bilde MINDESTENS 2 Achsen — sonst war die Aufteilung sinnlos und es wird gar "
    "nicht gesplittet. Ergebnis: wenige, trennscharfe Streitpunkte, jeder eine "
    "einzige Frage.\n"
    "\n"
    "RECHTSCHREIBUNG: Schreibe alle Labels, Pole und Beschreibungen in SCHWEIZER "
    "Rechtschreibung — immer «ss» statt «ß» (z.B. «Mass», «Grösse», «gemäss»)."
)


def axial_split_system(max_sub: int) -> str:
    """System-Prompt fürs Splitten einer überladenen Achse (max_sub Sub-Achsen)."""
    return SYSTEM_AXIAL_SPLIT.format(max_sub=max_sub)
