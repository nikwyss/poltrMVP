"""
REST-Endpoint für LLM-Checks beim Verfassen (erweiterbar). MVP: Stance-/Kohärenz-
Check. INTERN ONLY (Ingress auf /api/topdown beschränkt — siehe doc/CALCULATOR_EXPOSURE.md).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.review import stance as stance_check

logger = logging.getLogger("calculator.review.router")

router = APIRouter(prefix="/api/review", tags=["review"])


class StanceRequest(BaseModel):
    ballot_rkey: str
    title: str = ""
    body: str = ""
    type: str | None = None  # gewählte Position 'PRO'|'CONTRA'
    lang: str | None = None


@router.post("/stance")
async def stance_endpoint(req: StanceRequest):
    """Beurteilt Stance-Stimmigkeit + Kohärenz + Thematik eines Entwurfs (konservativ)."""
    try:
        return await stance_check.check_stance(
            req.ballot_rkey, req.title, req.body, req.type, lang=req.lang)
    except Exception as err:
        logger.error("review stance failed: %s", err)
        raise HTTPException(status_code=502, detail=f"stance fehlgeschlagen: {err}") from err
