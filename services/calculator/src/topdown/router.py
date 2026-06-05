"""
REST-Endpoints für die Top-down Themen-Hierarchie (parallel zu
/api/tags/induce-batch).

  POST /api/topdown/induce    — Baum NEU bauen (LLM) und persistieren (ersetzt).
  POST /api/topdown/classify  — neue Argumente inkrementell in den BESTEHENDEN
                                Baum einsortieren (Q4), ohne ihn neu zu bauen.
  GET  /api/topdown/tree      — den persistierten Baum eines Ballots lesen.

Persistenz: EIN stabiler Baum pro Ballot (app_topic_node / app_topic_membership),
inkrementell mutierbar — nicht pro Lauf versioniert. Signierte ATProto-Snapshots
kommen später separat oben drauf.
"""

from __future__ import annotations
import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from src.core import db
from src.llm import get_llm, get_open_coder
from src.topdown import prototype as proto

logger = logging.getLogger("calculator.topdown")

router = APIRouter(prefix="/api/topdown", tags=["topdown"])


class TopdownOptions(BaseModel):
    min_split: int = Field(
        proto.MIN_SPLIT, ge=2, le=100,
        description="Knoten mit weniger Codes werden nicht weiter unterteilt (Blatt).")
    max_depth: int = Field(
        proto.MAX_DEPTH, ge=1, le=6,
        description="Maximale Baumtiefe (Wurzelthema = Tiefe 1).")
    limit: int | None = Field(
        None, ge=1, le=10000,
        description="Max. Argumente (Default: alle codierten des Ballots).")
    persist: bool = Field(
        True, description="Baum in die DB schreiben (ersetzt den bestehenden Baum des Ballots).")
    official_only: bool = Field(
        True,
        description="Nur die OFFIZIELLEN Argumente in den Initialbaum klassifizieren "
        "(so, als gäbe es noch keine Community-Argumente). Community-Argumente "
        "kommen später per /classify dazu. Default true — induce ist als einmaliger "
        "Projektstart gedacht.")


class TopdownRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot, dessen Open Codes hierarchisiert werden.")
    options: TopdownOptions = Field(default_factory=TopdownOptions)

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1"}]}}


@router.post("/induce")
async def induce_topdown(req: TopdownRequest):
    """Top-down Themen-Baum NEU bauen und (optional) persistieren — ersetzt den
    bestehenden Baum des Ballots. Wurzelthemen aus den offiziellen Argumenten."""
    data = await proto.load_inputs(
        req.ballot_rkey, limit=req.options.limit,
        official_only=req.options.official_only)
    if not data["codes"]:
        scope = "offiziellen " if req.options.official_only else ""
        raise HTTPException(
            status_code=422,
            detail=f"Keine codierten {scope}Argumente (status='done') für Ballot "
                   f"{req.ballot_rkey}. Erst den Open-Coding-Worker laufen lassen.")
    if not data["seed"]:
        logger.warning("Ballot %s ohne offizielle Argumente — Seed leer.", req.ballot_rkey)

    llm = proto._CountingLLM(get_llm())

    def _build():
        return proto.induce_tree(
            llm, data["codes"], data["seed"],
            min_split=req.options.min_split, max_depth=req.options.max_depth)

    try:
        root, andere = await asyncio.to_thread(_build)
    except Exception as err:
        logger.error("Top-down-Induktion fehlgeschlagen (%s)", err)
        raise HTTPException(status_code=502, detail=f"Baumbau fehlgeschlagen: {err}") from err

    root["name"] = f"Vorlage {req.ballot_rkey}"
    root["own_codes"] = andere

    persisted = None
    if req.options.persist:
        try:
            persisted = await db.persist_topic_tree(req.ballot_rkey, root, data["entries"])
        except Exception as err:
            logger.warning("Persistenz fehlgeschlagen (%s) — migrate-topics.sql gelaufen?", err)

    return {
        "ballot_rkey": req.ballot_rkey,
        "llm": getattr(llm, "name", "?"),
        "llm_calls": llm.calls,
        "stats": {
            "codes": len(data["codes"]),
            "arguments": data["n_args"],
            "official_seed": data["n_off"],
            "andere": len(andere),
        },
        "persisted": persisted,
        "tree": proto.serialize_node(root, data["code_args"]),
    }


class PersistRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot, dessen Baum geschrieben wird.")
    tree: dict = Field(
        ..., description="Der zu persistierende Baum (Form wie in der /induce-"
        "Antwort: {name, description, codes, children}). Ersetzt den bestehenden Baum.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1", "tree": {}}]}}


def _to_internal(node: dict) -> dict:
    """Serialisierte Baum-Form ({…, codes, children}) → interne Form
    ({…, own_codes, children}) für db.persist_topic_tree."""
    return {
        "name": node.get("name"),
        "description": node.get("description"),
        "own_codes": list(node.get("codes", []) or []),
        "children": [_to_internal(c) for c in node.get("children", []) or []],
    }


@router.post("/persist")
async def persist_topdown(req: PersistRequest):
    """Persistiert einen zuvor per /induce (persist:false) erzeugten und im Admin
    geprüften Baum — deterministisch, ohne neuen LLM-Lauf. Ersetzt den
    bestehenden Baum des Ballots. Memberships werden aus den aktuellen Open Codes
    der DB aufgebaut (Codes, die der Baum nicht enthält, bleiben unverortet)."""
    data = await proto.load_inputs(req.ballot_rkey)
    internal = _to_internal(req.tree)
    try:
        persisted = await db.persist_topic_tree(
            req.ballot_rkey, internal, data["entries"])
    except Exception as err:
        logger.error("Persistenz fehlgeschlagen (%s)", err)
        raise HTTPException(status_code=502, detail=f"Persistenz fehlgeschlagen: {err}") from err
    return {"ballot_rkey": req.ballot_rkey, "persisted": persisted}


class ClassifyRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot, dessen NEUE Argumente eingehängt werden.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1"}]}}


@router.post("/classify")
async def classify_incremental(req: ClassifyRequest):
    """Inkrementell: noch nicht eingehängte Argumente top-down in den BESTEHENDEN
    Baum einsortieren (Q4). Baut den Baum NICHT neu — pro Ebene ein LLM-Call."""
    root = await db.fetch_topic_tree(req.ballot_rkey)
    if root is None:
        raise HTTPException(
            status_code=422,
            detail=f"Für Ballot {req.ballot_rkey} existiert noch kein Baum. "
                   f"Erst POST /api/topdown/induce aufrufen.")
    new_entries = await db.fetch_unplaced_entries(req.ballot_rkey)
    if not new_entries:
        return {"ballot_rkey": req.ballot_rkey, "placed": 0,
                "message": "Keine neuen Argumente zum Einsortieren."}

    new_codes = list({e["code"] for e in new_entries})
    llm = proto._CountingLLM(get_llm())

    def _classify():
        return proto.classify_incremental(llm, root, new_codes)

    try:
        placements = await asyncio.to_thread(_classify)
    except Exception as err:
        logger.error("Inkrementelles Einsortieren fehlgeschlagen (%s)", err)
        raise HTTPException(status_code=502, detail=f"Einsortieren fehlgeschlagen: {err}") from err

    placed = await db.add_topic_memberships(req.ballot_rkey, placements, new_entries)
    return {
        "ballot_rkey": req.ballot_rkey,
        "llm": getattr(llm, "name", "?"),
        "llm_calls": llm.calls,
        "new_codes": len(new_codes),
        "placed": placed,
    }


class GrowRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot, dessen Baum wachsen soll.")
    threshold: int = Field(
        10, ge=2, le=200,
        description="Ab so vielen DIREKTEN Codes wird ein Knoten gesplittet.")
    max_depth: int = Field(
        proto.MAX_DEPTH, ge=1, le=8,
        description="Knoten ab dieser Tiefe werden nicht weiter gesplittet.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1"}]}}


@router.post("/grow")
async def grow_tree(req: GrowRequest):
    """Lässt den Baum wachsen: überladene Knoten (zu viele DIREKTE Codes) werden
    per LLM in Unterthemen aufgeteilt. Am Wurzelknoten (Direkt-Codes = „andere"-
    Topf) entstehen so NEUE HAUPTÄSTE (horizontal), an Themenknoten Unterthemen
    (vertikal). Ein Durchgang; mehrfach aufrufbar, bis nichts mehr überläuft."""
    candidates = await db.fetch_overfull_nodes(
        req.ballot_rkey, req.threshold, req.max_depth)
    if not candidates:
        root = await db.fetch_topic_tree(req.ballot_rkey)
        if root is None:
            raise HTTPException(status_code=422,
                                detail=f"Kein Baum für Ballot {req.ballot_rkey}.")
        return {"ballot_rkey": req.ballot_rkey, "splits": [],
                "message": "Kein Knoten über der Schwelle."}

    llm = proto._CountingLLM(get_llm())

    def _propose_and_classify(codes: list[str], is_root: bool):
        system = proto._SYS_NEW_BRANCHES if is_root else proto._SYS_SUBS
        subs = proto.propose_topics(
            llm, system, "Codes:\n" + "\n".join(f"- {c}" for c in codes))
        if len(subs) < 2 and not is_root:
            return None, None
        if not subs:
            return None, None
        assign = proto.classify(llm, [s["name"] for s in subs], codes)
        return subs, assign

    results = []
    for cand in candidates:
        is_root = cand["depth"] == 0
        try:
            subs, assign = await asyncio.to_thread(
                _propose_and_classify, cand["codes"], is_root)
        except Exception as err:
            logger.error("Split-Vorschlag für Knoten %s fehlgeschlagen (%s)",
                         cand["node_id"], err)
            continue
        if not subs:
            continue
        res = await db.split_node(
            req.ballot_rkey, cand["node_id"], cand["depth"], subs, assign)
        if res["children"]:
            results.append({
                "node": cand["name"],
                "kind": "neue-hauptaeste" if is_root else "unterthemen",
                **res,
            })

    return {
        "ballot_rkey": req.ballot_rkey,
        "llm": getattr(llm, "name", "?"),
        "llm_calls": llm.calls,
        "candidates": len(candidates),
        "splits": results,
    }


@router.get("/tree")
async def get_tree(ballot_rkey: str = Query(...)):
    """Den persistierten Themen-Baum eines Ballots lesen (kein LLM)."""
    root = await db.fetch_topic_tree(ballot_rkey)
    if root is None:
        raise HTTPException(status_code=404,
                            detail=f"Kein Baum für Ballot {ballot_rkey}.")
    return {"ballot_rkey": ballot_rkey, "tree": root}


@router.get("/status")
async def get_status(ballot_rkey: str = Query(...)):
    """Coverage + Baum-Stand für das CMS-Panel: Open-Code-Abdeckung,
    ob ein Baum existiert, und wie viele Argumente noch nicht eingehängt sind."""
    try:
        sig = get_open_coder().open_code_signature
    except Exception:
        sig = None
    coverage = await db.ballot_coding_coverage(ballot_rkey, sig)
    tree = await db.fetch_topic_tree(ballot_rkey)
    unplaced = await db.fetch_unplaced_entries(ballot_rkey)
    return {
        "ballot_rkey": ballot_rkey,
        "coverage": coverage,
        "has_tree": tree is not None,
        "unplaced_arguments": len({e["argument_uri"] for e in unplaced}),
    }
