"""
Open Coding über Infomaniak AI Tools (OpenAI-kompatible Chat Completions).

Open Coding ist der mengenintensive Schritt (N Calls/Batch) → läuft auf einer
Infomaniak-Gemma (`CALCULATOR_OPENCODING_MODEL`, Default `google/gemma-4-31B-it`)
statt auf Claude. Axial Coding & Co. bleiben bei Anthropic.

  POST {base}/2/ai/{product_id}/openai/v1/chat/completions
  Header: Authorization: Bearer <token>   (gleiche Creds wie Embeddings)

Hinweis: Infomaniak lehnt `response_format` ab (HTTP 400). Wir fordern JSON per
Prompt an und parsen robust (Gemma verpackt es oft in ```json-Fences).
"""

from __future__ import annotations
import hashlib
import json
import logging
import re

import httpx

from src import config
from src.llm.base import LLMClient, OPEN_CODE_ERROR_NOTE, OPEN_CODE_EMPTY_NOTE
from src.prompts import (SYSTEM_OPEN_CODING, OPEN_CODE_JSON_INSTRUCTION,
                         open_code_user)

logger = logging.getLogger("calculator.infomaniak")

# Open-Coding-Prompt + JSON-Anweisung (zentral in src/prompts.py).
_SYSTEM = SYSTEM_OPEN_CODING + OPEN_CODE_JSON_INSTRUCTION

# Fence-/Whitespace-Reste entfernen, dann das erste JSON-Objekt herausziehen.
_FENCE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)


def is_configured() -> bool:
    return bool(config.EMBEDDING_PRODUCT_ID and config.EMBEDDING_API_KEY)


def _url() -> str:
    base = config.EMBEDDING_BASE_URL.rstrip("/")
    return f"{base}/2/ai/{config.EMBEDDING_PRODUCT_ID}/openai/v1/chat/completions"


def _parse_codes(content: str) -> list[dict]:
    """JSON aus der Modellantwort holen. Wirft ValueError bei Unparsbarkeit."""
    txt = _FENCE.sub("", content).strip()
    start, end = txt.find("{"), txt.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"keine JSON-Struktur in Antwort: {content[:120]!r}")
    obj = json.loads(txt[start:end + 1])
    codes = obj.get("codes", [])
    if not isinstance(codes, list):
        raise ValueError("'codes' ist keine Liste")
    return codes


class InfomaniakOpenCoder(LLMClient):
    """Implementiert nur open_code (Gemma). Andere Methoden bleiben bei Anthropic."""

    name = "infomaniak"

    def __init__(self, model: str | None = None, max_tokens: int = 600):
        self.model = model or config.OPENCODING_MODEL
        self.max_tokens = max_tokens
        prompt_hash = hashlib.sha256(_SYSTEM.encode("utf-8")).hexdigest()[:8]
        self.open_code_signature = f"infomaniak:{self.model}:{prompt_hash}"

    def open_code(self, argument: str, max_codes: int = 3,
                  raise_on_error: bool = False) -> list[dict]:
        user = open_code_user(argument, max_codes)
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": _SYSTEM},
                         {"role": "user", "content": user}],
            "max_tokens": self.max_tokens,
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {config.EMBEDDING_API_KEY}",
            "Content-Type": "application/json",
        }
        try:
            resp = httpx.post(_url(), json=body, headers=headers, timeout=60.0)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            codes = _parse_codes(content)
        except Exception as err:
            logger.error("Infomaniak open_code failed: %s", err)
            if raise_on_error:
                raise
            return [{"code": "Sonstiges", "note": OPEN_CODE_ERROR_NOTE, "confidence": 0.3}]
        return codes[:max_codes] if codes else [
            {"code": "Sonstiges", "note": OPEN_CODE_EMPTY_NOTE, "confidence": 0.3}]
