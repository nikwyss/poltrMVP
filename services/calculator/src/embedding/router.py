"""
REST endpoints for embeddings (duplicate check + semantic search).

  POST /api/embeddings/backfill    — compute missing/stale embeddings (cron-driven).
  GET  /api/embeddings/duplicates  — nearest arguments to a given argument (same ballot).
  GET  /api/embeddings/search      — semantic search over arguments.

INTERNAL ONLY. These must not be reachable from the public ingress — /backfill
triggers compute + Infomaniak cost. See doc/CALCULATOR_EXPOSURE.md (ingress path
restricted to /api/topdown).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from src.embedding import backfill as bf
from src.embedding import similarity as sim

logger = logging.getLogger("calculator.embedding.router")

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


class SimilarRequest(BaseModel):
    ballot_rkey: str
    title: str = ""
    body: str = ""
    lang: str | None = None
    type: str | None = None  # 'PRO' | 'CONTRA' — nur gleichgesinnte vergleichen
    limit: int = 1


@router.post("/backfill")
async def backfill_endpoint():
    """Compute embeddings for arguments/taxonomy nodes lacking an up-to-date one."""
    try:
        return await bf.run_backfill()
    except Exception as err:
        logger.error("embedding backfill failed: %s", err)
        raise HTTPException(status_code=502, detail=f"Backfill fehlgeschlagen: {err}") from err


@router.get("/duplicates")
async def duplicates_endpoint(
    argument_uri: str = Query(..., description="Argument, dessen Duplikate gesucht werden."),
    lang: str | None = Query(None, description="Sprache (Default: DEFAULT_LANGUAGE)."),
    limit: int = Query(5, ge=1, le=50),
):
    return {
        "argument_uri": argument_uri,
        "duplicates": await sim.find_duplicates(argument_uri, lang=lang, limit=limit),
    }


@router.post("/similar")
async def similar_endpoint(req: SimilarRequest):
    """Duplikat-Check beim Verfassen: ähnlichste Argumente der Vorlage (POST, da
    title+body lang sein können). Liefert {results:[{uri,title,body,type,similarity}]}."""
    try:
        results = await sim.similar_arguments(
            req.ballot_rkey, req.title, req.body,
            lang=req.lang, stance=req.type, limit=req.limit)
        return {"results": results}
    except Exception as err:
        logger.error("embedding similar failed: %s", err)
        raise HTTPException(status_code=502, detail=f"similar fehlgeschlagen: {err}") from err


@router.get("/search")
async def search_endpoint(
    q: str = Query(..., min_length=1, description="Suchtext (Nutzersprache)."),
    lang: str | None = Query(None),
    ballot_rkey: str | None = Query(None, description="Auf eine Vorlage einschränken (optional)."),
    limit: int = Query(20, ge=1, le=100),
):
    try:
        return {"q": q, "results": await sim.search(q, lang=lang, ballot_rkey=ballot_rkey, limit=limit)}
    except Exception as err:
        logger.error("embedding search failed: %s", err)
        raise HTTPException(status_code=502, detail=f"Suche fehlgeschlagen: {err}") from err
