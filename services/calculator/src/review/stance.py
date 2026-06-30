"""
Stance- & Kohärenz-Check (konservativ) für einen Argument-Entwurf — via Infomaniak
Gemma (JSON-Prompt). Beurteilt rein formal:
  1. liest sich der Text als die gewählte Position (PRO = für die Vorlage, CONTRA = gegen),
  2. ist es ein nachvollziehbares Argument (Aussage + Begründung),
  3. bezieht es sich auf die Vorlage.

Bewusst ZURÜCKHALTEND und ohne Inhalts-/Meinungsurteil (Civic-Speech): im Zweifel
„ok". Weich/beratend — der Aufrufer (AppView/Frontend) blockiert nie. Severity wird
deterministisch im Code aus den Flags abgeleitet, nicht vom LLM gesetzt.
"""

from __future__ import annotations

import logging

from src import config
from src.core import db
from src.core.languages import DEFAULT_LANGUAGE, normalize_lang
from src.review import infomaniak_chat as chat

logger = logging.getLogger("calculator.review.stance")

_LANG_NAMES = {
    "de-CH": "Deutsch (Schweizer Hochdeutsch, kein ß)",
    "en-GB": "British English",
    "fr-CH": "Französisch",
    "it-CH": "Italienisch",
    "rm": "Rätoromanisch",
}

_SYSTEM = (
    "Du hilfst Bürgerinnen und Bürgern, klare Argumente zu einer Schweizer "
    "Abstimmungsvorlage zu verfassen. Beurteile NUR formal: "
    "(1) liest sich der Text als die GEWÄHLTE Position (PRO = für die Vorlage, "
    "CONTRA = gegen die Vorlage), "
    "(2) ist es ein nachvollziehbares Argument (eine Aussage mit Begründung), "
    "(3) bezieht es sich auf diese Vorlage. "
    "Sei ZURÜCKHALTEND: im Zweifel ist alles in Ordnung; flagge nur klare Fälle. "
    "Bewerte NICHT die politische Meinung, die Richtigkeit oder die Qualität des "
    "Inhalts — du bist kein Zensor. "
    "Antworte AUSSCHLIESSLICH mit JSON, ohne Code-Fences, genau in dieser Form:\n"
    '{"reads_as":"pro|contra|unclear","is_argument":true,"on_topic":true,'
    '"feedback":"<1-2 Sätze, konstruktiv, in der Sprache des Textes>"}'
)


def _user_prompt(ballot_ctx: str | None, declared: str, title: str, body: str,
                 lang_name: str) -> str:
    ctx = f"VORLAGE (Kontext):\n{ballot_ctx.strip()}\n\n" if ballot_ctx else ""
    return (
        f"{ctx}GEWÄHLTE POSITION: {declared}\n\n"
        f"ARGUMENT\nTitel: {title}\nText: {body}\n\n"
        f"Schreibe das feedback auf {lang_name}."
    )


async def check_stance(ballot_rkey: str, title: str, body: str,
                       declared_type: str | None, *, lang: str | None = None) -> dict:
    lang = normalize_lang(lang) or DEFAULT_LANGUAGE
    declared = (declared_type or "").strip().upper()
    if declared not in ("PRO", "CONTRA"):
        declared = None
    has_text = bool((title or "").strip() or (body or "").strip())
    if not has_text or declared is None:
        return {"status": "ok", "severity": "ok"}  # nichts zu prüfen

    try:
        ballot_ctx = await db.fetch_ballot_description(ballot_rkey)
    except Exception as err:  # CMS-Kontext optional — nie blockierend
        logger.warning("stance: ballot context unavailable: %s", err)
        ballot_ctx = None

    lang_name = _LANG_NAMES.get(lang, "Deutsch")
    obj = await chat.chat_json(
        _SYSTEM,
        _user_prompt(ballot_ctx, declared, (title or "").strip(), (body or "").strip(), lang_name),
        model=config.REVIEW_MODEL,
    )

    reads_as = str(obj.get("reads_as", "")).strip().lower()
    if reads_as not in ("pro", "contra", "unclear"):
        reads_as = "unclear"
    is_argument = obj.get("is_argument", True) is not False
    on_topic = obj.get("on_topic", True) is not False
    feedback = str(obj.get("feedback", "")).strip()

    # Severity konservativ ableiten: nur ein KLARER Gegensatz ist eine Warnung.
    mismatch = reads_as in ("pro", "contra") and reads_as != declared.lower()
    if mismatch:
        severity = "warn"
    elif not is_argument or not on_topic:
        severity = "hint"
    else:
        severity = "ok"

    return {
        "status": "ok",
        "severity": severity,
        "reads_as": reads_as,
        "matches_selected": not mismatch,
        "is_argument": is_argument,
        "on_topic": on_topic,
        "feedback": feedback,
    }
