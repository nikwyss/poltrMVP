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
