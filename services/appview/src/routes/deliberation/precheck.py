"""
XRPC: app.ch.poltr.argument.precheck — Prüfstufe beim Verfassen eines Arguments.

Liefert ein **erweiterbares Bündel** von Checks. MVP: nur `duplicates` — die
ähnlichsten bestehenden Argumente der Vorlage (vom Calculator via Embedding-
Cosine). Spätere Checks (stance, clarity, topic, tips) kommen als zusätzliche
Top-Level-Felder dazu — additiv, ohne Bruch.

Nicht-blockierend: ist der Calculator nicht erreichbar/fehlerhaft, kommt
`duplicates: []` zurück — das Erstellen wird nie verhindert. (Muster wie der
CMS-Aufruf in src/routes/ballots/ballots.py.)
"""

import asyncio
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.fastapi import logger
from src.routes.deliberation._lang import resolve_requested_lang

router = APIRouter(prefix="/xrpc", tags=["poltr-deliberation"])

# In-Cluster-Default; lokal via .env überschreibbar. Calculator ist nur
# clusterintern erreichbar (Ingress auf /api/topdown beschränkt).
CALCULATOR_INTERNAL_URL = os.getenv(
    "CALCULATOR_INTERNAL_URL", "http://calculator.poltr.svc.cluster.local")


async def _fetch_similar(ballot_rkey: str, lang: str, title: str, body: str,
                         stance: str | None, limit: int) -> dict:
    """Duplikate vom Calculator (gleiche Stance). Graceful → {status:'unavailable'}."""
    url = f"{CALCULATOR_INTERNAL_URL.rstrip('/')}/api/embeddings/similar"
    payload = {
        "ballot_rkey": ballot_rkey, "lang": lang,
        "title": title, "body": body, "type": stance, "limit": limit,
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(url, json=payload)
    except httpx.RequestError as err:
        logger.warning("precheck: calculator unreachable: %s", err)
        return {"status": "unavailable"}
    if resp.status_code != 200:
        logger.warning("precheck: calculator returned %s: %s",
                       resp.status_code, resp.text[:200])
        return {"status": "unavailable"}
    try:
        return {"status": "ok", "items": resp.json().get("results", []) or []}
    except ValueError:
        logger.warning("precheck: calculator returned non-JSON")
        return {"status": "unavailable"}


def _build_topic(stance_result: dict) -> dict:
    """Thematik-Check aus dem Stance-LLM (Variante B): On-Topic + zugeordnetes
    Hauptthema (`choice` = Themenname | 'ANDERES' | None). ⚠ nur bei off-topic."""
    if stance_result.get("status") == "unavailable":
        return {"status": "unavailable"}
    on_topic = stance_result.get("on_topic", True)
    choice = stance_result.get("topic")  # Themenname | 'ANDERES' | None
    severity = "warn" if on_topic is False else "ok"
    return {"status": "ok", "severity": severity, "on_topic": on_topic, "choice": choice}


def _build_tone(stance_result: dict) -> dict:
    """Umgangston aus dem Stance-LLM: ⚠ bei Beschimpfungen/Vulgaritäten ('harsh');
    sachliche/harte Kritik bleibt ok. Beratend, nicht blockierend."""
    if stance_result.get("status") == "unavailable":
        return {"status": "unavailable"}
    severity = "warn" if stance_result.get("tone") == "harsh" else "ok"
    return {"status": "ok", "severity": severity}


def _build_unity(stance_result: dict) -> dict:
    """Fokus/Unity of Thought aus dem Stance-LLM: ⚠, wenn der Text mehrere
    eigenständige Argumente bündelt (single_thought=false). Beratend.

    single_thought=None (kein erkennbares Argument → Fokus unbeurteilbar) ⇒
    severity 'ok', d.h. keine Empfehlung anzeigen; der Hinweis kommt dann über
    die Stimmigkeit."""
    if stance_result.get("status") == "unavailable":
        return {"status": "unavailable"}
    single = stance_result.get("single_thought", True)
    return {"status": "ok", "severity": "warn" if single is False else "ok"}


async def _fetch_stance(ballot_rkey: str, lang: str, title: str, body: str,
                        stance: str | None) -> dict:
    """Stance-/Kohärenz-Check (LLM) vom Calculator. Graceful: {status:'unavailable'}."""
    url = f"{CALCULATOR_INTERNAL_URL.rstrip('/')}/api/review/stance"
    payload = {
        "ballot_rkey": ballot_rkey, "lang": lang,
        "title": title, "body": body, "type": stance,
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(url, json=payload)
    except httpx.RequestError as err:
        logger.warning("precheck: stance calculator unreachable: %s", err)
        return {"status": "unavailable"}
    if resp.status_code != 200:
        logger.warning("precheck: stance returned %s: %s",
                       resp.status_code, resp.text[:200])
        return {"status": "unavailable"}
    try:
        return resp.json()
    except ValueError:
        logger.warning("precheck: stance returned non-JSON")
        return {"status": "unavailable"}


@router.post("/app.ch.poltr.argument.precheck")
async def precheck_argument(
    request: Request,
    accept_language: Optional[str] = Header(None),
    session: TSession = Depends(verify_session_token),
):
    """Prüf-Bündel für einen Argument-Entwurf (vor dem Erstellen)."""
    body = await request.json()
    ballot = (body.get("ballot") or "").strip()
    title = (body.get("title") or "").strip()
    text = (body.get("body") or "").strip()
    stance = ((body.get("type") or "").strip().upper() or None)
    try:
        limit = max(1, min(int(body.get("limit") or 1), 10))
    except (TypeError, ValueError):
        limit = 1
    lang = resolve_requested_lang(body.get("lang"), accept_language)

    if not ballot or not (title or text):
        return JSONResponse(status_code=200, content={
            "lang": lang,
            "duplicates": {"status": "ok", "items": []},
            "stance": {"status": "ok", "severity": "ok"},
            "topic": {"status": "ok", "severity": "ok"},
            "tone": {"status": "ok", "severity": "ok"},
            "unity": {"status": "ok", "severity": "ok"},
        })

    # Duplikate (Embedding) und Stimmigkeit+Thematik (LLM) parallel.
    duplicates, stance_result = await asyncio.gather(
        _fetch_similar(ballot, lang, title, text, stance, limit),
        _fetch_stance(ballot, lang, title, text, stance),
    )
    return JSONResponse(status_code=200, content={
        "lang": lang,
        "duplicates": duplicates,
        "stance": stance_result,
        "topic": _build_topic(stance_result),
        "tone": _build_tone(stance_result),
        "unity": _build_unity(stance_result),
    })
