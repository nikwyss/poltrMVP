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
    # Hinweis: /induce baut bewusst nur die FLACHEN Oberthemen (Tiefe 1). Die
    # Vertiefung in Unterthemen läuft separat über /grow („Wachsen lassen"),
    # daher gibt es hier keine min_split/max_depth-Optionen mehr.
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
            ballot_description=data.get("ballot_description"))

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


# =========================================================================
#  State-Editor: zustandslose „propose"-Endpoints (rechnen gegen den vom Client
#  geschickten Baum, schreiben NICHTS) + ein einziges /save (voller Ersatz).
#  Der CMS-Editor hält den ganzen Baum im State, merged Vorschläge lokal und
#  persistiert am Ende einmal. uid = Client-Knoten-Identität (auch neue Knoten).
# =========================================================================
class SaveRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot, dessen Baum geschrieben wird.")
    tree: dict = Field(
        ..., description="Vollständiger Baum aus dem State-Editor: je Knoten "
        "{name, description, children, codes:[{code, argument_uri, confidence, stance}]}. "
        "Ersetzt Knoten UND Memberships komplett.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1", "tree": {}}]}}


@router.post("/save")
async def save_topdown(req: SaveRequest):
    """Persistiert den kompletten editierten Baum (Struktur + Argument-Zuordnungen)
    in einer Transaktion — ersetzt den bestehenden Baum des Ballots vollständig.
    Deterministisch, kein LLM."""
    try:
        saved = await db.save_topic_tree_full(req.ballot_rkey, req.tree)
    except Exception as err:
        logger.error("Speichern des Baums fehlgeschlagen (%s)", err)
        raise HTTPException(status_code=502, detail=f"Speichern fehlgeschlagen: {err}") from err
    return {"ballot_rkey": req.ballot_rkey, "saved": saved}


def _placed_argument_uris(node: dict) -> set:
    """Alle bereits im (State-)Baum verorteten argument_uris sammeln."""
    uris: set = set()

    def walk(n: dict):
        for c in n.get("codes", []) or []:
            if isinstance(c, dict) and c.get("argument_uri"):
                uris.add(c["argument_uri"])
        for ch in n.get("children", []) or []:
            walk(ch)

    walk(node)
    return uris


class ClassifyRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot, dessen Argumente eingehängt werden.")
    tree: dict = Field(
        ..., description="Aktueller (editierter) Baum aus dem State-Editor; je Knoten "
        "{uid, name, children, codes:[…]}. Bestimmt Struktur UND welche Argumente "
        "schon verortet sind.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1", "tree": {}}]}}


@router.post("/classify")
async def classify_propose(req: ClassifyRequest):
    """Vorschlag (kein Schreiben): sortiert die im übergebenen Baum noch nicht
    verorteten Argumente top-down in dessen Struktur ein. ZUERST die offiziellen,
    DANACH die Community-Argumente; geteilte Codes erben den offiziellen Knoten.
    Rückgabe: `additions` = [{uid, code, argument_uri, confidence, stance}] zum
    Mergen in den State."""
    placed = _placed_argument_uris(req.tree)
    entries = await db.fetch_done_entries(req.ballot_rkey)
    unplaced = [e for e in entries if e["argument_uri"] not in placed]
    if not unplaced:
        return {"ballot_rkey": req.ballot_rkey, "additions": [],
                "placed": 0, "placed_official": 0, "placed_community": 0,
                "new_codes": 0, "llm_calls": 0,
                "message": "Keine unverorteten Argumente."}

    official = [e for e in unplaced if e.get("source_type") == "official"]
    community = [e for e in unplaced if e.get("source_type") != "official"]

    llm = proto._CountingLLM(get_llm())
    placements: dict[str, object] = {}

    def _classify_group(group: list[dict]):
        seen: set[str] = set()
        fresh: list[str] = []
        for e in group:
            c = e["code"]
            if c in placements or c in seen:
                continue
            seen.add(c)
            fresh.append(c)
        if fresh:
            placements.update(proto.classify_incremental(llm, req.tree, fresh))

    try:
        await asyncio.to_thread(_classify_group, official)
        await asyncio.to_thread(_classify_group, community)
    except Exception as err:
        logger.error("Einsortieren (propose) fehlgeschlagen (%s)", err)
        raise HTTPException(status_code=502, detail=f"Einsortieren fehlgeschlagen: {err}") from err

    def _adds(group: list[dict]) -> list[dict]:
        return [
            {"uid": placements[e["code"]], "code": e["code"],
             "argument_uri": e["argument_uri"],
             "confidence": e.get("confidence"), "stance": e.get("stance")}
            for e in group if e["code"] in placements
        ]

    adds_off, adds_com = _adds(official), _adds(community)
    return {
        "ballot_rkey": req.ballot_rkey,
        "llm": getattr(llm, "name", "?"),
        "llm_calls": llm.calls,
        "new_codes": len(placements),
        "placed": len(adds_off) + len(adds_com),
        "placed_official": len(adds_off),
        "placed_community": len(adds_com),
        "additions": adds_off + adds_com,
    }


class GrowRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot (für Logging/Antwort).")
    tree: dict = Field(..., description="Aktueller (editierter) Baum aus dem State-Editor.")
    threshold: int = Field(
        10, ge=2, le=200,
        description="Ab so vielen DIREKTEN Codes wird ein Knoten gesplittet.")
    max_depth: int = Field(
        proto.MAX_DEPTH, ge=1, le=8,
        description="Knoten ab dieser Tiefe werden nicht weiter gesplittet.")

    model_config = {"json_schema_extra": {"examples": [{"ballot_rkey": "663.1", "tree": {}}]}}


@router.post("/grow")
async def grow_propose(req: GrowRequest):
    """Vorschlag (kein Schreiben): überladene Knoten des übergebenen Baums per LLM
    in Unterthemen aufteilen. Rückgabe: `splits` = [{uid, kind, subtopics, assign,
    children}] zum Anwenden im State."""
    candidates = proto.overfull_candidates(req.tree, req.threshold, req.max_depth)
    if not candidates:
        return {"ballot_rkey": req.ballot_rkey, "splits": [],
                "candidates": 0, "llm_calls": 0,
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

    splits = []
    for cand in candidates:
        try:
            subs, assign = await asyncio.to_thread(
                _propose_and_classify, cand["codes"], cand["is_root"])
        except Exception as err:
            logger.error("Split-Vorschlag für Knoten %s fehlgeschlagen (%s)",
                         cand["uid"], err)
            continue
        if not subs:
            continue
        used = {t for t in assign.values() if t != "andere"}
        splits.append({
            "uid": cand["uid"],
            "kind": "neue-hauptaeste" if cand["is_root"] else "unterthemen",
            "subtopics": subs,
            "assign": assign,
            "children": [s["name"] for s in subs if s["name"] in used],
        })

    return {
        "ballot_rkey": req.ballot_rkey,
        "llm": getattr(llm, "name", "?"),
        "llm_calls": llm.calls,
        "candidates": len(candidates),
        "splits": splits,
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


@router.get("/unplaced")
async def get_unplaced(ballot_rkey: str = Query(...)):
    """Argumente mit mindestens einem nicht zugeordneten Code (für den
    „Nicht zugeordnet"-Bereich im CMS-Panel). Pro Argument: platzierte vs. nicht
    platzierte Codes + `fully_missing` (kein Code im Baum). Kein LLM."""
    items = await db.fetch_unplaced_codes_detailed(ballot_rkey)
    return {
        "ballot_rkey": ballot_rkey,
        "unplaced": items,
        "fully_missing": sum(1 for e in items if e["fully_missing"]),
        "partial": sum(1 for e in items if not e["fully_missing"]),
    }


class BranchUnplacedRequest(BaseModel):
    ballot_rkey: str = Field(..., description="Ballot (für Logging/Antwort).")
    codes: list[str] = Field(
        ..., description="Code-Labels aus dem Unplaced-Pool, aus denen neue "
        "Hauptäste gebildet werden sollen.")

    model_config = {"json_schema_extra": {"examples": [
        {"ballot_rkey": "663.1", "codes": ["Datenschutz", "Föderalismus"]}]}}


@router.post("/branch_unplaced")
async def branch_unplaced(req: BranchUnplacedRequest):
    """Vorschlag (kein Schreiben): aus den übergebenen nicht zugeordneten Codes
    per LLM 1–4 NEUE Hauptäste bilden (gleiche Logik wie der Root-Split von
    /grow, `_SYS_NEW_BRANCHES`). Rückgabe: {subtopics, assign} zum Mergen in den
    State-Baum (neue Wurzelkinder; Codes per assign auf die neuen Äste verteilt)."""
    codes = list(dict.fromkeys(c.strip() for c in req.codes if c and c.strip()))
    if len(codes) < 2:
        return {"ballot_rkey": req.ballot_rkey, "subtopics": [], "assign": {},
                "llm_calls": 0, "message": "Zu wenige Codes für einen neuen Ast."}

    llm = proto._CountingLLM(get_llm())

    def _propose():
        subs = proto.propose_topics(
            llm, proto._SYS_NEW_BRANCHES,
            "Codes:\n" + "\n".join(f"- {c}" for c in codes))
        if not subs:
            return [], {}
        return subs, proto.classify(llm, [s["name"] for s in subs], codes)

    try:
        subs, assign = await asyncio.to_thread(_propose)
    except Exception as err:
        logger.error("branch_unplaced fehlgeschlagen (%s)", err)
        raise HTTPException(
            status_code=502, detail=f"Astbildung fehlgeschlagen: {err}") from err

    return {
        "ballot_rkey": req.ballot_rkey,
        "llm": getattr(llm, "name", "?"),
        "llm_calls": llm.calls,
        "subtopics": subs,
        "assign": assign,
        "message": "" if subs else "Keine tragfähigen neuen Themen.",
    }
