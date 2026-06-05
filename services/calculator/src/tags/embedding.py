"""
Embeddings über Infomaniak AI Tools (OpenAI-kompatibel).

  POST {base}/2/ai/{product_id}/openai/v1/embeddings
  Header: Authorization: Bearer <token>
  Body:   {"model": <id>, "input": [<text>, ...], "encoding_format": "float"}
  Resp:   {"object":"list","data":[{"embedding":[...],"index":0}, ...], ...}

Modell: Qwen3-Embedding-8B (`CALCULATOR_EMBEDDING_MODEL`, exakte ID via
`GET /1/ai/models` prüfen). Genutzt als Stage-1-Backend der Vorbündelung
(siehe doc/argument_clustering.md §9).
"""

from __future__ import annotations
import logging
import time

import httpx

from src import config

logger = logging.getLogger("calculator.embedding")

# Infomaniak: „input list must have less than 100 items" (HTTP 400 ab 100).
# Daher konservativ chunken (< 100).
_CHUNK = 64

# Transiente Upstream-Fehler (Infomaniak-Gateway zickt sporadisch mit 502/503).
# Diese werden kurz wiederholt (Backoff), bevor der Lauf hörbar scheitert — das
# ist KEIN Lexical-Fallback, sondern derselbe Backend-Call nochmal.
_RETRY_STATUSES = {429, 500, 502, 503, 504}
_BACKOFF_BASE = 1.0  # Sekunden: 1, 2, 4, … zwischen den Versuchen


def is_configured() -> bool:
    return bool(config.EMBEDDING_PRODUCT_ID and config.EMBEDDING_API_KEY)


def _url() -> str:
    base = config.EMBEDDING_BASE_URL.rstrip("/")
    return f"{base}/2/ai/{config.EMBEDDING_PRODUCT_ID}/openai/v1/embeddings"


def _post_with_retry(client: httpx.Client, body: dict, headers: dict) -> httpx.Response:
    """POST mit Retry für transiente Fehler (5xx-Gateway, 429, Netz/Timeout).
    Permanente Fehler (z.B. 400/401) werden NICHT wiederholt, sondern sofort
    durchgereicht. Nach `EMBEDDING_MAX_ATTEMPTS` erfolglosen Versuchen wirft die
    letzte Exception → der Lauf scheitert hörbar (Alarm)."""
    attempts = max(1, config.EMBEDDING_MAX_ATTEMPTS)
    last_exc: Exception | None = None
    for attempt in range(attempts):
        try:
            resp = client.post(_url(), json=body, headers=headers)
            resp.raise_for_status()
            return resp
        except httpx.HTTPStatusError as err:
            if err.response.status_code not in _RETRY_STATUSES:
                raise  # permanenter Fehler → nicht wiederholen
            last_exc = err
        except httpx.TransportError as err:  # ConnectError/ReadTimeout/…
            last_exc = err
        if attempt < attempts - 1:
            delay = _BACKOFF_BASE * (2 ** attempt)
            logger.warning("Embedding-Call transient fehlgeschlagen (%s) — "
                           "Versuch %d/%d, retry in %.0fs.",
                           last_exc, attempt + 1, attempts, delay)
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embeddings für `texts`, Reihenfolge-erhaltend. Wirft bei Fehlern (nach
    Retries für transiente Upstream-Fehler, siehe `_post_with_retry`)."""
    if not is_configured():
        raise RuntimeError("Embedding-Backend nicht konfiguriert "
                           "(CALCULATOR_EMBEDDING_PRODUCT_ID / _API_KEY).")
    headers = {
        "Authorization": f"Bearer {config.EMBEDDING_API_KEY}",
        "Content-Type": "application/json",
    }
    out: list[list[float]] = []
    with httpx.Client(timeout=60.0) as client:
        for i in range(0, len(texts), _CHUNK):
            chunk = texts[i:i + _CHUNK]
            body: dict = {
                "model": config.EMBEDDING_MODEL,
                "input": chunk,
                "encoding_format": "float",
            }
            if config.EMBEDDING_DIMENSIONS:
                body["dimensions"] = config.EMBEDDING_DIMENSIONS
            resp = _post_with_retry(client, body, headers)
            data = resp.json().get("data", [])
            # Nach index sortieren, damit die Reihenfolge garantiert stimmt.
            data = sorted(data, key=lambda d: d.get("index", 0))
            out.extend(d["embedding"] for d in data)
    if len(out) != len(texts):
        raise RuntimeError(
            f"Embedding-Anzahl stimmt nicht: {len(out)} != {len(texts)}")
    logger.info("Embedded %d texts via %s (model=%s)",
                len(texts), config.EMBEDDING_BASE_URL, config.EMBEDDING_MODEL)
    return out
