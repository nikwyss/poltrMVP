"""
LLM-Auswahl: echter Anthropic-Client. Ohne ANTHROPIC_API_KEY schlägt der
Service bewusst fehl (statt still wertlose Ergebnisse zu liefern).
"""

import logging

from fastapi import HTTPException

from src import config
from src.llm.base import LLMClient

logger = logging.getLogger("calculator.llm")


def get_llm() -> LLMClient:
    if not config.ANTHROPIC_API_KEY:
        logger.error("ANTHROPIC_API_KEY not set — refusing to run LLM operation.")
        raise HTTPException(
            status_code=503,
            detail="LLM not configured: ANTHROPIC_API_KEY fehlt.",
        )
    from src.llm.anthropic_client import AnthropicLLM

    logger.info("Using AnthropicLLM (model=%s)", config.LLM_MODEL)
    return AnthropicLLM()


def get_open_coder() -> LLMClient:
    """Open-Coding-Backend. Infomaniak-Gemma wenn konfiguriert (mengenintensiver
    Schritt), sonst Fallback auf Anthropic (`get_llm`). Liefert ein Objekt mit
    `open_code` + `open_code_signature`."""
    from src.llm.infomaniak_chat import InfomaniakOpenCoder, is_configured

    if is_configured():
        coder = InfomaniakOpenCoder()
        logger.info("Open coding via Infomaniak (model=%s)", coder.model)
        return coder
    logger.info("Infomaniak not configured — open coding falls back to Anthropic.")
    return get_llm()
