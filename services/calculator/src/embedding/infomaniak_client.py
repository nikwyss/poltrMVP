"""
Embeddings via Infomaniak AI Tools (OpenAI-compatible) — async.

  POST {base}/2/ai/{product_id}/openai/v1/embeddings
  Header: Authorization: Bearer <token>
  Body:   {"model": <id>, "input": [<text>, ...], "encoding_format": "float", "dimensions": <opt>}
  Resp:   {"object":"list","data":[{"embedding":[...],"index":0}, ...]}

Mechanics (chunking ≤64, sort-by-index) mirror the previously-removed
src/tags/embedding.py; the retry/backoff pattern mirrors the translation worker
(services/community-writer/src/translation/translator.py). See doc/infomaniak.md.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from src import config

logger = logging.getLogger("calculator.embedding")

# Infomaniak gateway occasionally returns these transiently → retry with backoff
# (same call, no provider fallback). Permanent 4xx fail fast.
_TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504})
_BACKOFFS = (1, 2, 4)  # seconds; len => retries after the first attempt


def is_configured() -> bool:
    return bool(config.EMBEDDING_PRODUCT_ID and config.EMBEDDING_API_KEY)


def _chunk_size() -> int:
    # Infomaniak: "input list must have less than 100 items" (HTTP 400 at 100).
    return max(1, min(config.EMBEDDING_BATCH_SIZE, 64))


def _url() -> str:
    base = config.EMBEDDING_BASE_URL.rstrip("/")
    return f"{base}/2/ai/{config.EMBEDDING_PRODUCT_ID}/openai/v1/embeddings"


async def _post_with_retry(client: httpx.AsyncClient, body: dict, headers: dict) -> httpx.Response:
    last_err: object = None
    for attempt in range(len(_BACKOFFS) + 1):
        try:
            resp = await client.post(_url(), json=body, headers=headers)
        except httpx.RequestError as err:  # network/timeout — retry
            last_err = err
            if attempt < len(_BACKOFFS):
                await asyncio.sleep(_BACKOFFS[attempt])
                continue
            raise
        if resp.status_code in _TRANSIENT_STATUS:  # 429/5xx — retry
            last_err = f"HTTP {resp.status_code}"
            if attempt < len(_BACKOFFS):
                await asyncio.sleep(_BACKOFFS[attempt])
                continue
            resp.raise_for_status()  # exhausted → raise
        if resp.status_code != 200:  # permanent (4xx) — fail fast
            resp.raise_for_status()
        return resp
    raise RuntimeError(f"embeddings failed after retries: {last_err}")


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embeddings for `texts`, order-preserving. Raises on failure (after retries
    for transient upstream errors)."""
    if not is_configured():
        raise RuntimeError(
            "Embedding backend not configured "
            "(CALCULATOR_EMBEDDING_PRODUCT_ID / _API_KEY).")
    if not texts:
        return []
    headers = {
        "Authorization": f"Bearer {config.EMBEDDING_API_KEY}",
        "Content-Type": "application/json",
    }
    out: list[list[float]] = []
    size = _chunk_size()
    async with httpx.AsyncClient(timeout=60.0) as client:
        for i in range(0, len(texts), size):
            chunk = texts[i:i + size]
            body: dict = {
                "model": config.EMBEDDING_MODEL,
                "input": chunk,
                "encoding_format": "float",
            }
            if config.EMBEDDING_DIMENSIONS:
                body["dimensions"] = config.EMBEDDING_DIMENSIONS
            resp = await _post_with_retry(client, body, headers)
            # data array order is NOT guaranteed → sort by index before zip.
            data = sorted(resp.json().get("data", []), key=lambda d: d.get("index", 0))
            out.extend(d["embedding"] for d in data)
    if len(out) != len(texts):
        raise RuntimeError(f"embedding count mismatch: {len(out)} != {len(texts)}")
    return out
