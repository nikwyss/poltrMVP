"""
REST-Endpoints für den Open-Coding-Worker.

  POST /opencoding         — einen Batch verarbeiten (vom Cron alle 5 min)
  GET  /opencoding/status  — Counts, Tagesbudget, offene Kandidaten

Hinweis: nicht für öffentlichen Zugriff gedacht (Token-/DB-Last). Wird derzeit
nur cluster-intern aufgerufen; ein expliziter Endpoint-Schutz folgt später.
"""

from __future__ import annotations
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.opencoding import worker

router = APIRouter(prefix="/opencoding", tags=["opencoding"])


class BatchRequest(BaseModel):
    batch_size: Optional[int] = Field(
        None, ge=1, le=200,
        description="Anzahl Argumente in diesem Lauf (Default aus Config = 20).")

    model_config = {"json_schema_extra": {"examples": [{}]}}


@router.post("")
async def run(req: BatchRequest):
    return await worker.run_batch(batch_size=req.batch_size)


class BallotRequest(BaseModel):
    ballot_rkey: str = Field(
        ..., description="Ballot, dessen noch nicht codierte Argumente jetzt codiert werden.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1"}]}}


@router.post("/ballot")
async def run_ballot(req: BallotRequest):
    """On-demand: alle noch nicht (oder veraltet) codierten Argumente EINES Ballots
    codieren — wird vom Taxonomie-Editor vor dem „Argumente einsortieren" aufgerufen
    (ersetzt für diesen Ballot den Cron). Ignoriert den Tagescap."""
    return await worker.code_ballot(req.ballot_rkey)


@router.get("/status")
async def status():
    return await worker.status_summary()
