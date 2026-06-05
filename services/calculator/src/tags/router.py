"""
REST-Endpoints für die Tag-Induktion (Variante B).

POST /api/tags/induce-batch
  Axiale Taxonomie-Induktion über die bereits PERSISTIERTEN Open Codes eines
  Ballots. Open Coding (Schritt 1) macht der Cron-Worker und schreibt nach
  app_argument_open_codes; dieser Endpoint liest diese Codes (status='done') und
  führt nur Axial Coding + Zuordnung aus — er generiert KEINE Codes mehr.
  Das Ergebnis (Achsen / Bündel / Zugehörigkeiten) wird versioniert in die DB
  geschrieben (app_taxonomy_*); die Antwort trägt `taxonomy_run_id`.

Der Aufruf ist zustandslos: jeder Request startet mit einer leeren Taxonomie.
Axial Coding läuft über get_llm() (benötigt ANTHROPIC_API_KEY).
"""

from __future__ import annotations
import asyncio
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.core import db
from src.llm import get_llm, get_open_coder
from src.tags.tag_system import TagSystem

logger = logging.getLogger("calculator.tags")

router = APIRouter(prefix="/api/tags", tags=["tags"])


# =========================================================================
#  Variante B: Axiale Induktion über persistierte Open Codes
# =========================================================================
class BatchOptions(BaseModel):
    max_themes: int = Field(
        6,
        ge=2,
        le=20,
        description="Weicher Cap für die Anzahl axialer "
        "Achsen (Bitte ans LLM, nicht garantiert).",
    )
    min_frequency: int = Field(
        2,
        ge=1,
        le=100,
        description="Stage 0: Mindesthaeufigkeit, ab der ein "
        "Code achsen-wuerdig ist (sonst Rand-Topf).",
    )
    target_bundles: int = Field(
        80,
        ge=2,
        le=500,
        description="Stage 1: weiche Decke für die Bündelzahl. Im honest-Modus "
        "meist nicht bindend (der Floor stoppt zuerst) — nur Absicherung gegen "
        "Über-Verdichtung bei dichten Daten.",
    )
    reorganize: bool = Field(
        True,
        description="Reorganisation (2. Sicherheitsnetz): überladene Achsen nach "
        "der Achsenbildung in 2–3 schärfere Achsen aufteilen.",
    )
    split_factor: float = Field(
        1.8,
        ge=1.1,
        le=10.0,
        description="Eine Achse gilt als überladen ab `split_factor × "
        "durchschnittliche Größe der ÜBRIGEN Achsen` (Codes pro Achse) — der "
        "Schnitt der anderen, damit die große Achse den Maßstab nicht selbst aufbläht.",
    )
    split_min_reps: int = Field(
        6,
        ge=2,
        le=100,
        description="Erst ab so vielen Repräsentanten wird eine Achse gesplittet "
        "(darunter lohnt sich die Aufteilung nicht).",
    )
    split_max_sub: int = Field(
        3,
        ge=2,
        le=6,
        description="Max. Sub-Achsen, in die eine überladene Achse zerfällt.",
    )


class BatchInduceRequest(BaseModel):
    ballot_rkey: str = Field(
        ..., description="Ballot, dessen persistierte Open Codes axial gruppiert werden.")
    limit: int | None = Field(
        None, ge=1, le=10000,
        description="Max. Argumente (Default: alle codierten des Ballots).")
    options: BatchOptions = Field(default_factory=BatchOptions)

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1"}]}}


@router.post("/induce-batch")
async def induce_batch(req: BatchInduceRequest):
    """Axiale Taxonomie über die PERSISTIERTEN Open Codes eines Ballots.

    Open Coding (Schritt 1) ist Sache des Cron-Workers (→ app_argument_open_codes).
    Hier wird NICHT mehr codiert: die Codes (status='done') werden gelesen, dann
    Axial Coding + Zuordnung ausgeführt. Reihenfolge-unabhängig.
    """
    coded = await db.fetch_open_codes_for_ballot(req.ballot_rkey, limit=req.limit)
    if not coded:
        raise HTTPException(
            status_code=422,
            detail=f"Keine codierten Argumente (status='done') für Ballot "
                   f"{req.ballot_rkey}. Erst den Open-Coding-Worker laufen lassen.",
        )

    items = [(r["argument_uri"], r["text"]) for r in coded]
    precomputed = {r["argument_uri"]: r["codes"] for r in coded}
    stance_by_arg = {r["argument_uri"]: r["stance"] for r in coded}

    # Axial Coding (Anthropic) — Open Coding wird hier NICHT mehr generiert.
    llm = get_llm()
    system = TagSystem(llm)
    try:
        batch = await asyncio.to_thread(
            system.batch_induce,
            items,
            precomputed,
            stance_by_arg=stance_by_arg,
            max_themes=req.options.max_themes,
            min_frequency=req.options.min_frequency,
            target_bundles=req.options.target_bundles,
            reorganize=req.options.reorganize,
            split_factor=req.options.split_factor,
            split_min_reps=req.options.split_min_reps,
            split_max_sub=req.options.split_max_sub,
        )
    except Exception as err:
        # u.a. der nicht mehr stille Embedding-Ausfall (kein Lexical-Fallback,
        # solange CALCULATOR_PREBUNDLE_EMBED_FALLBACK=false) → 502 als Alarm,
        # statt leise schlechtere Bündel zu liefern.
        logger.error("induce-batch fehlgeschlagen (%s)", err)
        raise HTTPException(
            status_code=502,
            detail=f"Taxonomie-Induktion fehlgeschlagen: {err}") from err

    # Achsen / Bündel / Zugehörigkeiten versioniert in die DB schreiben.
    # Best-effort: schlägt der Write fehl (z.B. Migration noch nicht gelaufen),
    # bleibt das Axial-Ergebnis erhalten — run_id wird dann null.
    run_id = None
    try:
        s0 = batch.get("stage0", {}) or {}
        pb = batch.get("prebundle", {}) or {}
        run_metrics = {
            "bundled": bool(batch.get("bundled")),
            "stage0_applied": s0.get("applied"),
            "stage0_min_frequency": s0.get("min_frequency"),
            "stage0_kept": s0.get("kept"),
            "stage0_margin": s0.get("margin"),
            "prebundle_backend": pb.get("backend"),
            "prebundle_target": pb.get("target"),
            "prebundle_rounds": pb.get("rounds"),
            "prebundle_final_floor": pb.get("final_floor"),
            "prebundle_capped": pb.get("capped"),
            "prebundle_max_size": pb.get("max_size"),
            "prebundle_max_bundle": pb.get("max_bundle"),
        }
        tax = system.taxonomy_for_persistence()
        run_metrics.update(tax.get("run_stats", {}))  # arguments_total/_unassigned
        run_id = await db.persist_taxonomy(
            req.ballot_rkey,
            tax,
            axial_model=getattr(llm, "model", None),
            code_count=batch.get("code_count", 0),
            run_metrics=run_metrics,
        )
    except Exception as err:
        logger.warning("Taxonomie-Persistenz fehlgeschlagen (%s) — "
                       "migrate-taxonomy.sql schon gelaufen?", err)

    result = system.snapshot()
    result["llm"] = llm.name                # Axial-Backend
    result["taxonomy_run_id"] = run_id      # DB-Lauf (app_taxonomy_run); null bei Fehler
    result["source"] = {
        "mode": "db", "ballot_rkey": req.ballot_rkey, "count": len(items),
    }

    # Open-Coding-Abdeckung (rein informativ): zeigt, ob über die VOLLE Code-Basis
    # gruppiert wurde oder nur über einen Teil — z.B. wenn der Worker gerade
    # neu codiert (nach Prompt-Änderung) und nur einen Teil als `done` zurücklässt.
    # `coverage.done` sollte `source.count` entsprechen. Best-effort.
    try:
        sig = get_open_coder().open_code_signature
        result["coverage"] = await db.ballot_coding_coverage(req.ballot_rkey, sig)
    except Exception as err:
        logger.warning("Coverage-Abfrage fehlgeschlagen (%s).", err)
        result["coverage"] = None

    result.update(batch)  # method, bundled, open_codes, themes, code_count, …
    return result
