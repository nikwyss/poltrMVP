"""
Chat Completions über Infomaniak AI Tools (OpenAI-kompatibel) — async, JSON-Prompt.

Infomaniak kennt KEIN forced tool-use / `response_format` (HTTP 400) → strukturierte
Ausgabe per Prompt erzwingen und robust parsen (Gemma verpackt JSON oft in
```-Fences). Mechanik wie die frühere src/llm/infomaniak_chat.py; Retry-Muster wie
der Übersetzungs-Worker. Token + Product ID teilen sich Chat & Embeddings
(CALCULATOR_EMBEDDING_*). Siehe doc/infomaniak.md.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re

import httpx

from src import config

logger = logging.getLogger("calculator.review.chat")

_TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504})
_BACKOFFS = (1, 2, 4)
# Fence-/Whitespace-Reste entfernen, dann das erste {...} herausziehen.
_FENCE = re.compile(r"^```(?:json)?|```$", re.MULTILINE)


def is_configured() -> bool:
    return bool(config.EMBEDDING_PRODUCT_ID and config.EMBEDDING_API_KEY)


def _url() -> str:
    base = config.EMBEDDING_BASE_URL.rstrip("/")
    return f"{base}/2/ai/{config.EMBEDDING_PRODUCT_ID}/openai/v1/chat/completions"


def extract_json(content: str) -> dict:
    """Erstes JSON-Objekt aus der Modellantwort ziehen (tolerant gegen Fences/Prosa)."""
    txt = _FENCE.sub("", content).strip()
    start, end = txt.find("{"), txt.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError(f"no JSON object in response: {content[:120]!r}")
    # strict=False toleriert rohe Zeilenumbrüche in String-Werten.
    obj = json.loads(txt[start:end + 1], strict=False)
    if not isinstance(obj, dict):
        raise ValueError("response is not a JSON object")
    return obj


async def _post_with_retry(client: httpx.AsyncClient, payload: dict, headers: dict) -> httpx.Response:
    last_err: object = None
    for attempt in range(len(_BACKOFFS) + 1):
        try:
            resp = await client.post(_url(), json=payload, headers=headers)
        except httpx.RequestError as err:
            last_err = err
            if attempt < len(_BACKOFFS):
                await asyncio.sleep(_BACKOFFS[attempt])
                continue
            raise
        if resp.status_code in _TRANSIENT_STATUS:
            last_err = f"HTTP {resp.status_code}"
            if attempt < len(_BACKOFFS):
                await asyncio.sleep(_BACKOFFS[attempt])
                continue
            resp.raise_for_status()
        if resp.status_code != 200:
            resp.raise_for_status()
        return resp
    raise RuntimeError(f"chat failed after retries: {last_err}")


async def chat_json(system: str, user: str, *, model: str,
                    max_tokens: int = 500, temperature: float = 0.1) -> dict:
    """Eine Chat-Completion mit JSON-Antwort. Wirft bei Konfig-/Netz-/Parse-Fehler."""
    if not is_configured():
        raise RuntimeError(
            "Infomaniak chat not configured (CALCULATOR_EMBEDDING_PRODUCT_ID / _API_KEY).")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {config.EMBEDDING_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=40.0) as client:
        resp = await _post_with_retry(client, payload, headers)
    content = resp.json()["choices"][0]["message"]["content"]
    return extract_json(content)
