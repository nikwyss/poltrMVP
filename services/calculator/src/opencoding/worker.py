"""
Open-Coding-Worker (Cron-getrieben).

Verarbeitet einen Batch noch nicht (oder veraltet) codierter Argumente aus
`app_arguments` und schreibt die Open Codes nach `app_argument_open_codes`.

Eigenschaften (siehe doc/argument_clustering.md §9 + README „Roadmap"):
  • Reihenfolge: offizielle Argumente zuerst, dann nach `created_at` aufsteigend.
  • Re-Coding automatisch bei Edit (`cid` ändert sich) oder Modell-/Prompt-
    Wechsel (`coder_signature`).
  • Fehler: bis `OPENCODING_MAX_ATTEMPTS` Versuche → dann `failed_permanent`
    (keine Endlosschlaufe). **Transiente** Fehler (Netz/429/5xx) zählen NICHT
    als Versuch, damit ein Anthropic-Ausfall die Queue nicht „verbrennt".
  • Overlap-Schutz: `processing`-Lease mit `OPENCODING_LEASE_MINUTES`-Timeout.
  • Tagescap: max. `OPENCODING_DAILY_CAP` erfolgreich codierte Argumente/Tag.
  • Sprache: Codes immer Deutsch (Prompt), Eingabe = Titel + Body im Original.
"""

from __future__ import annotations
import asyncio
import json
import logging

import anthropic

from src import config
from src.core import db
from src.llm import get_open_coder
from src.llm.base import OPEN_CODE_EMPTY_NOTE

logger = logging.getLogger("calculator.opencoding")

_CONCURRENCY = 5


def _is_transient(exc: Exception) -> bool:
    """API-Ausfälle, die man nicht dem Argument anlasten darf (kein Versuch)."""
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError,
                        anthropic.RateLimitError, anthropic.InternalServerError)):
        return True
    status = getattr(exc, "status_code", None)
    return isinstance(status, int) and status >= 500


async def _count_coded_today(conn) -> int:
    return await conn.fetchval(
        """SELECT count(*) FROM app_argument_open_codes
           WHERE status IN ('done','empty')
             AND updated_at >= date_trunc('day', now())""") or 0


async def _claim(conn, *, coder_sig: str, limit: int,
                 codeable_rkeys: list[str] | None) -> list:
    """Atomar Kandidaten auswählen und auf `processing` setzen (Lease).

    `codeable_rkeys`: nur Argumente dieser Ballot-rkeys (Status published/draft
    aus der CMS-DB) werden geclaimt. `None` = keine Status-Filterung (CMS-DB
    nicht konfiguriert)."""
    return await conn.fetch(
        """
        WITH candidates AS (
          SELECT a.uri
          FROM app_arguments a
          LEFT JOIN app_argument_open_codes oc ON oc.argument_uri = a.uri
          WHERE a.deleted = false
            -- Ballot-Status-Filter (NULL = kein Filter, sonst nur codierbare rkeys)
            AND ($5::text[] IS NULL OR a.ballot_rkey = ANY($5::text[]))
            AND ( oc.argument_uri IS NULL
               OR oc.argument_cid <> a.cid
               OR oc.coder_signature IS DISTINCT FROM $1
               OR (oc.status = 'failed' AND oc.attempts < $2) )
            -- nicht claimen, solange ein frischer processing-Lease läuft;
            -- NULL-sicher (nie codierte Zeilen haben oc.status = NULL).
            AND ( oc.status IS DISTINCT FROM 'processing'
               OR oc.claimed_at <= now() - ($3 || ' minutes')::interval )
          ORDER BY (a.source_type = 'official') DESC, a.created_at ASC
          LIMIT $4
          -- KEIN FOR UPDATE: das bräuchte UPDATE-Recht auf app_arguments, das
          -- die calculator-Rolle (Least Privilege: nur SELECT) nicht hat.
          -- Overlap ist über den processing-Lease + CronJob concurrencyPolicy
          -- Forbid abgedeckt; das INSERT … ON CONFLICT unten serialisiert die
          -- Claim-Schreibzugriffe auf app_argument_open_codes.
        )
        INSERT INTO app_argument_open_codes
              (argument_uri, argument_cid, ballot_rkey, status, claimed_at, updated_at)
        SELECT c.uri, a.cid, a.ballot_rkey, 'processing', now(), now()
        FROM candidates c JOIN app_arguments a ON a.uri = c.uri
        ON CONFLICT (argument_uri) DO UPDATE
          SET status = 'processing', claimed_at = now(), updated_at = now()
        RETURNING argument_uri, argument_cid, ballot_rkey
        """,
        coder_sig, config.OPENCODING_MAX_ATTEMPTS,
        str(config.OPENCODING_LEASE_MINUTES), limit, codeable_rkeys,
    )


async def _load_texts(conn, uris: list[str]) -> dict[str, tuple[str, str]]:
    rows = await conn.fetch(
        "SELECT uri, title, body FROM app_arguments WHERE uri = ANY($1::text[])",
        uris)
    return {r["uri"]: (r["title"], r["body"]) for r in rows}


def _classify_result(codes: list[dict]) -> str:
    """done | empty — nach erfolgreichem (nicht-fehlerhaftem) open_code."""
    if not codes:
        return "empty"
    if all(c.get("note") == OPEN_CODE_EMPTY_NOTE for c in codes):
        return "empty"
    return "done"


async def _write_success(conn, uri: str, cid: str, sig: str,
                         codes: list[dict], status: str) -> None:
    await conn.execute(
        """UPDATE app_argument_open_codes
           SET codes = $2::jsonb, status = $3, coder_signature = $4,
               argument_cid = $5, attempts = 0, last_error = NULL,
               claimed_at = NULL, updated_at = now()
           WHERE argument_uri = $1""",
        uri, json.dumps(codes), status, sig, cid)


async def _write_failure(conn, uri: str, err: str, *, transient: bool) -> str:
    """Markiert Fehler. Transient: kein Versuch gezählt (Retry später).
    Sonst: attempts+1; ab MAX → failed_permanent. Gibt den neuen Status zurück."""
    if transient:
        await conn.execute(
            """UPDATE app_argument_open_codes
               SET status = 'failed', last_error = $2, claimed_at = NULL,
                   updated_at = now()
               WHERE argument_uri = $1""", uri, err[:500])
        return "failed"
    row = await conn.fetchrow(
        """UPDATE app_argument_open_codes
           SET attempts = attempts + 1,
               status = CASE WHEN attempts + 1 >= $2 THEN 'failed_permanent'
                             ELSE 'failed' END,
               last_error = $3, claimed_at = NULL, updated_at = now()
           WHERE argument_uri = $1
           RETURNING status, attempts""",
        uri, config.OPENCODING_MAX_ATTEMPTS, err[:500])
    return row["status"]


async def run_batch(batch_size: int | None = None) -> dict:
    """Einen Open-Coding-Batch verarbeiten. Gibt eine Zusammenfassung zurück."""
    batch_size = batch_size or config.OPENCODING_BATCH_SIZE
    llm = get_open_coder()           # Open Coding via Infomaniak-Gemma (Fallback Anthropic)
    sig = llm.open_code_signature
    pool = await db.get_pool()

    # --- Tagescap prüfen ---
    async with pool.acquire() as conn:
        used = await _count_coded_today(conn)
        remaining = config.OPENCODING_DAILY_CAP - used
        if remaining <= 0:
            return {"status": "daily_cap_reached", "coded_today": used,
                    "daily_cap": config.OPENCODING_DAILY_CAP, "processed": 0}
        limit = min(batch_size, remaining)

        # Nur Ballots mit codierbarem Status (published/draft) aus der CMS-DB.
        codeable = await db.fetch_codeable_ballot_rkeys()
        claimed = await _claim(conn, coder_sig=sig, limit=limit,
                               codeable_rkeys=codeable)
        if not claimed:
            return {"status": "idle", "coded_today": used, "processed": 0}
        uris = [r["argument_uri"] for r in claimed]
        meta = {r["argument_uri"]: (r["argument_cid"], r["ballot_rkey"]) for r in claimed}
        texts = await _load_texts(conn, uris)

    # --- Open Coding parallel (LLM-Calls außerhalb der Connection) ---
    sem = asyncio.Semaphore(_CONCURRENCY)
    counts = {"done": 0, "empty": 0, "failed": 0, "failed_permanent": 0}

    async def _process(uri: str):
        cid, _ = meta[uri]
        title, body = texts.get(uri, ("", ""))
        text = f"{title}\n\n{body}".strip()
        try:
            codes = await asyncio.to_thread(
                llm.open_code, text, config.OPENCODING_MAX_CODES, True)
        except Exception as err:  # noqa: BLE001 — klassifiziert weiter unten
            transient = _is_transient(err)
            async with pool.acquire() as conn:
                st = await _write_failure(conn, uri, str(err), transient=transient)
            counts[st] = counts.get(st, 0) + 1
            logger.warning("open_code failed (%s, transient=%s): %s",
                           uri, transient, err)
            return
        status = _classify_result(codes)
        async with pool.acquire() as conn:
            await _write_success(conn, uri, cid, sig, codes, status)
        counts[status] += 1

    await asyncio.gather(*[_process(u) for u in uris])

    return {
        "status": "ok",
        "processed": len(uris),
        "coded_today_before": used,
        "daily_cap": config.OPENCODING_DAILY_CAP,
        "coder_signature": sig,
        **counts,
    }


async def code_ballot(ballot_rkey: str, *, batch_size: int | None = None,
                      max_total: int = 2000) -> dict:
    """On-demand: ALLE noch nicht (oder veraltet) codierten Argumente EINES Ballots
    codieren — für das interaktive „Argumente einsortieren" im Editor (ersetzt für
    diesen Ballot den Cron-Lauf).

    Unterschiede zum Cron-`run_batch`:
      • auf genau diesen `ballot_rkey` beschränkt (umgeht die CMS-Status-Filterung —
        der Admin editiert die Vorlage gerade),
      • IGNORIERT den Tagescap (bewusste Aktion),
      • läuft in Schleife über mehrere Batches, bis nichts mehr offen ist
        (Sicherheits-Limit `max_total`).
    Re-Coding bei Edit (`cid`) / Signatur-Wechsel passiert wie im Cron automatisch.
    """
    batch_size = batch_size or config.OPENCODING_BATCH_SIZE
    llm = get_open_coder()
    sig = llm.open_code_signature
    pool = await db.get_pool()
    counts = {"done": 0, "empty": 0, "failed": 0, "failed_permanent": 0}
    processed = 0
    sem = asyncio.Semaphore(_CONCURRENCY)

    while processed < max_total:
        async with pool.acquire() as conn:
            claimed = await _claim(
                conn, coder_sig=sig,
                limit=min(batch_size, max_total - processed),
                codeable_rkeys=[ballot_rkey])
            if not claimed:
                break
            uris = [r["argument_uri"] for r in claimed]
            meta = {r["argument_uri"]: (r["argument_cid"], r["ballot_rkey"]) for r in claimed}
            texts = await _load_texts(conn, uris)

        async def _process(uri: str):
            async with sem:
                cid, _ = meta[uri]
                title, body = texts.get(uri, ("", ""))
                text = f"{title}\n\n{body}".strip()
                try:
                    codes = await asyncio.to_thread(
                        llm.open_code, text, config.OPENCODING_MAX_CODES, True)
                except Exception as err:  # noqa: BLE001
                    transient = _is_transient(err)
                    async with pool.acquire() as conn:
                        st = await _write_failure(conn, uri, str(err), transient=transient)
                    counts[st] = counts.get(st, 0) + 1
                    logger.warning("open_code failed (%s, transient=%s): %s",
                                   uri, transient, err)
                    return
                status = _classify_result(codes)
                async with pool.acquire() as conn:
                    await _write_success(conn, uri, cid, sig, codes, status)
                counts[status] += 1

        before = counts["done"] + counts["empty"]
        await asyncio.gather(*[_process(u) for u in uris])
        processed += len(uris)
        # Keine erfolgreiche Codierung in dieser Runde (z.B. LLM-Ausfall, lauter
        # transiente Fehler) → abbrechen, sonst würden dieselben Zeilen endlos
        # neu geclaimt.
        if counts["done"] + counts["empty"] == before:
            break

    return {
        "status": "ok",
        "ballot_rkey": ballot_rkey,
        "processed": processed,
        "coder_signature": sig,
        "truncated": processed >= max_total,
        **counts,
    }


async def status_summary() -> dict:
    """Counts je Status + Tagesbudget + offene Kandidaten (für /opencoding/status).

    Zählt nur Argumente codierbarer Ballots (Status published/draft, wie der
    Worker). `codeable = None` (CMS-DB nicht konfiguriert) → kein Filter.
    `coded_today` bleibt global, da der Tagescap ein globales Token-Budget ist.
    """
    pool = await db.get_pool()
    codeable = await db.fetch_codeable_ballot_rkeys()
    async with pool.acquire() as conn:
        by_status = {r["status"]: r["n"] for r in await conn.fetch(
            """SELECT status, count(*) AS n FROM app_argument_open_codes
               WHERE ($1::text[] IS NULL OR ballot_rkey = ANY($1::text[]))
               GROUP BY status""", codeable)}
        coded_today = await _count_coded_today(conn)
        pending = await conn.fetchval(
            """SELECT count(*) FROM app_arguments a
               LEFT JOIN app_argument_open_codes oc ON oc.argument_uri = a.uri
               WHERE a.deleted = false
                 AND ($1::text[] IS NULL OR a.ballot_rkey = ANY($1::text[]))
                 AND (oc.argument_uri IS NULL OR oc.argument_cid <> a.cid)""",
            codeable)
    return {
        "by_status": by_status,
        "coded_today": coded_today,
        "daily_cap": config.OPENCODING_DAILY_CAP,
        "daily_remaining": max(0, config.OPENCODING_DAILY_CAP - coded_today),
        "uncoded_arguments": pending or 0,
        "codeable_ballots": codeable,
    }
