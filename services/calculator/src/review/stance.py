"""
Stimmigkeits- & Thematik-Check (konservativ) für einen Argument-Entwurf — via
Infomaniak Gemma (JSON-Prompt). Ein LLM-Call beurteilt:
  1. Position: liest sich der Text als die gewählte Seite (PRO/CONTRA)?
  2. Kohärenz: ist es ein nachvollziehbares Argument (Aussage + Begründung)?
  3. On-Topic: bezieht es sich auf die Vorlage?
  4. Thematik (Variante B): ordnet das Argument GENAU EINEM der Hauptthemen zu
     (exakter Name aus der übergebenen Liste) oder „ANDERES", wenn keines passt.
  5. Fokus (Unity of Thought): trägt der Text genau EINEN zusammenhängenden
     Gedanken vor — oder ist es ein Sammelsurium mehrerer Argumente?

Bis `TOPIC_MAX_INLINE` Themen werden alle Namen mitgegeben; bei mehr wählt das
Embedding die nächsten `TOPIC_PRESELECT_K` vor (einziger Themen-Embedding-Call).

Bewusst ZURÜCKHALTEND, kein Inhalts-/Meinungsurteil (Civic-Speech). Severity
(Position+Kohärenz) wird deterministisch im Code abgeleitet, nicht vom LLM.
"""

from __future__ import annotations

import logging

from src import config
from src.core import db
from src.core.languages import DEFAULT_LANGUAGE, normalize_lang
from src.embedding import similarity as sim
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
    "(3) bezieht es sich auf diese Vorlage (on_topic). "
    "(4) Wird eine HAUPTTHEMEN-Liste gegeben: ordne das Argument GENAU EINEM "
    "dieser Themen zu — gib den exakten Namen aus der Liste zurück. Passt "
    "inhaltlich KEINES, gib \"ANDERES\". Ohne Liste: \"topic\": null. "
    "(5) Tonalität: enthält der Text Beschimpfungen, Schimpf-/Fluchwörter oder "
    "persönliche Angriffe → \"harsh\", sonst \"ok\". HARTE SACHkritik an der "
    "Vorlage oder an Argumenten ist KEIN Problem (= ok); nur Beleidigungen/"
    "Vulgaritäten zählen als harsh. "
    "(6) Fokus (single_thought): true, wenn der Text genau EINEN "
    "zusammenhängenden Gedanken vorträgt (ein Kernargument, ggf. mit Begründung/"
    "Beispiel). false, wenn er MEHRERE eigenständige, thematisch getrennte "
    "Argumente in einem Text bündelt (Sammelsurium), die besser einzeln "
    "eingereicht würden. Ein Argument mit Begründung ist EIN Gedanke (= true). "
    "Sei ZURÜCKHALTEND: im Zweifel ist alles in Ordnung; flagge nur klare Fälle. "
    "Bewerte NICHT die politische Meinung, die Richtigkeit oder die Qualität des "
    "Inhalts — du bist kein Zensor. "
    "Antworte AUSSCHLIESSLICH mit JSON, ohne Code-Fences, genau in dieser Form:\n"
    '{"reads_as":"pro|contra|unclear","is_argument":true,"on_topic":true,'
    '"topic":"<exakter Themenname aus der Liste | ANDERES | null>",'
    '"tone":"ok|harsh","single_thought":true,'
    '"feedback":"<1-2 Sätze, konstruktiv, in der Sprache des Textes>"}'
)


def _user_prompt(ballot_ctx: str | None, declared: str, title: str, body: str,
                 lang_name: str, themes: list[str]) -> str:
    ctx = f"VORLAGE (Kontext):\n{ballot_ctx.strip()}\n\n" if ballot_ctx else ""
    themes_block = ""
    if themes:
        listing = "\n".join(f"- {t}" for t in themes)
        themes_block = (
            "HAUPTTHEMEN (wähle GENAU eines davon oder ANDERES):\n"
            f"{listing}\n\n"
        )
    return (
        f"{ctx}{themes_block}GEWÄHLTE POSITION: {declared}\n\n"
        f"ARGUMENT\nTitel: {title}\nText: {body}\n\n"
        f"Schreibe das feedback auf {lang_name}."
    )


def _resolve_topic(topic_raw, themes: list[str]) -> str | None:
    """LLM-Antwort auf die erlaubten Werte zwingen: exakter Themenname (case-
    insensitiv) → Original; sonst „ANDERES". Ohne Themenliste → None."""
    if not themes:
        return None
    if not isinstance(topic_raw, str):
        return "ANDERES"
    tr = topic_raw.strip()
    if tr.upper() == "ANDERES" or not tr:
        return "ANDERES"
    for t in themes:
        if t.strip().lower() == tr.lower():
            return t
    return "ANDERES"


async def check_stance(ballot_rkey: str, title: str, body: str,
                       declared_type: str | None, *, lang: str | None = None) -> dict:
    lang = normalize_lang(lang) or DEFAULT_LANGUAGE
    declared = (declared_type or "").strip().upper()
    if declared not in ("PRO", "CONTRA"):
        declared = None
    has_text = bool((title or "").strip() or (body or "").strip())
    if not has_text or declared is None:
        return {"status": "ok", "severity": "ok", "topic": None}  # nichts zu prüfen

    try:
        ballot_ctx = await db.fetch_ballot_description(ballot_rkey)
    except Exception as err:  # CMS-Kontext optional — nie blockierend
        logger.warning("stance: ballot context unavailable: %s", err)
        ballot_ctx = None

    # Hauptthemen für die Zuordnung. Bis MAX_INLINE alle; sonst Embedding-Vorauswahl.
    try:
        themes = await db.fetch_top_level_topics(ballot_rkey)
        if len(themes) > config.TOPIC_MAX_INLINE:
            try:
                themes = await sim.top_topic_names(
                    ballot_rkey, title, body, lang=lang, k=config.TOPIC_PRESELECT_K)
            except Exception as err:
                logger.warning("stance: topic preselect failed: %s", err)
                themes = themes[: config.TOPIC_PRESELECT_K]
    except Exception as err:
        logger.warning("stance: topics unavailable: %s", err)
        themes = []

    lang_name = _LANG_NAMES.get(lang, "Deutsch")
    obj = await chat.chat_json(
        _SYSTEM,
        _user_prompt(ballot_ctx, declared, (title or "").strip(),
                     (body or "").strip(), lang_name, themes),
        model=config.REVIEW_MODEL,
    )

    reads_as = str(obj.get("reads_as", "")).strip().lower()
    if reads_as not in ("pro", "contra", "unclear"):
        reads_as = "unclear"
    is_argument = obj.get("is_argument", True) is not False
    on_topic = obj.get("on_topic", True) is not False
    feedback = str(obj.get("feedback", "")).strip()
    topic = _resolve_topic(obj.get("topic"), themes)
    tone = "harsh" if str(obj.get("tone", "")).strip().lower() == "harsh" else "ok"
    # Fokus ist nur beurteilbar, wenn überhaupt ein Argument vorliegt. Bei
    # Kauderwelsch/Nicht-Argument ist „mehrere Argumente" sinnlos → None
    # (unbeurteilbar); die Vorprüfung zeigt dann keine Fokus-Empfehlung, der
    # Hinweis „kein erkennbares Argument" kommt bereits über die Stimmigkeit.
    single_thought = None if not is_argument else (obj.get("single_thought", True) is not False)

    # Severity nur aus Position + Kohärenz (Thematik ist ein eigenes Kästchen).
    mismatch = reads_as in ("pro", "contra") and reads_as != declared.lower()
    if mismatch:
        severity = "warn"
    elif not is_argument:
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
        "topic": topic,
        "tone": tone,
        "single_thought": single_thought,
        "feedback": feedback,
    }
