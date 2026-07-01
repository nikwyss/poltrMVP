"""
Peer-review endpoints for argument quality control.

Lifecycle (see doc/PEER_REVIEW.md):
    open  ─▶ provisional_closed  ─▶ closed
              (grace window, sliding on reviewer activity)

Endpoints
=========
- GET  app.ch.poltr.peerreview.criteria   configurable criteria list
- GET  app.ch.poltr.peerreview.pending    invitations the user can still take
- GET  app.ch.poltr.peerreview.list       peer reviews of a ballot (open + closed)
- POST app.ch.poltr.peerreview.checkIn    grant submit-rights for the grace window
- POST app.ch.poltr.peerreview.activity   slide grace_until forward on real typing
- POST app.ch.poltr.peerreview.submit     final submission (writes response to PDS)
- GET  app.ch.poltr.peerreview.status     state + counts for one argument

Contract: a reviewer must check in *before* submitting. While the review is
'open' check-in is unconditional; once it transitions to 'provisional_closed',
only previously-checked-in reviewers may submit (and only while grace_until is
in the future). The lifecycle transition is driven by the indexer + finaliser
cron — these endpoints only consume state, they don't decide closure.
"""

import json
import os
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.atproto.atproto_api import pds_create_record

logger = logging.getLogger("review")

router = APIRouter(prefix="/xrpc", tags=["review"])

# Calculator (clusterintern) für den Live-Duplikat-Check im Reviewer-Overlay.
# Default = In-Cluster-DNS; lokal via .env überschreibbar (vgl. precheck.py).
CALCULATOR_INTERNAL_URL = os.getenv(
    "CALCULATOR_INTERNAL_URL", "http://calculator.poltr.svc.cluster.local")


def _grace_seconds() -> int:
    return int(os.getenv("APPVIEW_PEER_REVIEW_GRACE_PERIOD_SECONDS", "600"))


def _get_criteria() -> list[dict]:
    # Die FÜNF offiziellen Kriterien für neue Argumente — identisch zur
    # automatischen Vorprüfung im Composer (siehe doc/ARGUMENT_CRITERIA.md).
    # Faktische Richtigkeit ist bewusst KEIN Kriterium (Civic-Speech: weder KI
    # noch Reviewer bewerten die politische „Richtigkeit" einer Meinung).
    raw = os.getenv(
        "APPVIEW_PEER_REVIEW_CRITERIA",
        '[{"key":"coherence","label":"Stimmigkeit"},'
        '{"key":"tone","label":"Umgangston"},'
        '{"key":"topic","label":"Thematik"},'
        '{"key":"unity","label":"Fokus"},'
        '{"key":"non_duplication","label":"Kein Duplikat"}]',
    )
    return json.loads(raw)


def _iso(ts) -> str | None:
    return ts.isoformat() if ts else None


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.peerreview.criteria
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.peerreview.criteria")
async def get_review_criteria(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Return the configurable review criteria list."""
    return JSONResponse(
        status_code=200,
        content={"criteria": _get_criteria()},
    )


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.peerreview.duplicateCandidate
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.peerreview.duplicateCandidate")
async def get_duplicate_candidate(
    argumentUri: str = Query(..., description="Argument under review."),
    session: TSession = Depends(verify_session_token),
):
    """Live-Duplikat-Check fürs Reviewer-Overlay: das ähnlichste *andere* Argument
    GLEICHER Position derselben Vorlage (über der Anzeige-Schwelle). Frisch
    berechnet (kein persistierter Stufe-1-Befund). Das „Kein Duplikat"-Kriterium
    wird dem Gutachter nur gezeigt, wenn hier ein Kandidat zurückkommt.

    Graceful: Calculator nicht erreichbar/fehlerhaft → {status:'unavailable'};
    blockiert den Review nie.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT langs FROM app_arguments WHERE uri = $1 AND deleted = false",
            argumentUri,
        )
    if not row:
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "message": "Argument not found"},
        )
    # Vergleich in der Originalsprache des Arguments (dort liegt das Embedding).
    langs = row["langs"] or []
    lang = langs[0] if langs else None

    url = f"{CALCULATOR_INTERNAL_URL.rstrip('/')}/api/embeddings/duplicates"
    params = {"argument_uri": argumentUri, "limit": 1, "same_stance": "true"}
    if lang:
        params["lang"] = lang
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.get(url, params=params)
    except httpx.RequestError as err:
        logger.warning("duplicateCandidate: calculator unreachable: %s", err)
        return JSONResponse(status_code=200, content={"status": "unavailable"})
    if resp.status_code != 200:
        logger.warning("duplicateCandidate: calculator returned %s: %s",
                       resp.status_code, resp.text[:200])
        return JSONResponse(status_code=200, content={"status": "unavailable"})
    try:
        items = resp.json().get("duplicates", []) or []
    except ValueError:
        logger.warning("duplicateCandidate: calculator returned non-JSON")
        return JSONResponse(status_code=200, content={"status": "unavailable"})
    return JSONResponse(status_code=200, content={"status": "ok", "items": items})


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.peerreview.pending
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.peerreview.pending")
async def get_pending_reviews(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Return pending review invitations for the authenticated user.

    A review is 'pending' for a user when:
      * they hold an active invitation (`invited=true`)
      * the peer-review row exists and is still 'open' (provisional_closed
        only accepts already-checked-in users — they see those via direct
        status lookup, not via this list)
      * the user has not yet submitted a response
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ri.uri AS invitation_uri, ri.argument_uri, ri.created_at AS invited_at,
                   a.title, a.body, a.type, a.ballot_uri, a.ballot_rkey, a.author_did
            FROM app_peerreview_invitations ri
            JOIN app_arguments a    ON a.uri  = ri.argument_uri AND NOT a.deleted
            JOIN app_peerreviews pr ON pr.argument_uri = ri.argument_uri
            WHERE ri.invitee_did = $1
              AND ri.invited = true
              AND pr.state = 'open'
              AND NOT EXISTS (
                SELECT 1 FROM app_peerreview_responses rr
                WHERE rr.argument_uri = ri.argument_uri
                  AND rr.reviewer_did = $1
              )
            ORDER BY ri.created_at ASC
            """,
            session.did,
        )

    invitations = [
        {
            "invitationUri": r["invitation_uri"],
            "argumentUri": r["argument_uri"],
            "invitedAt": _iso(r["invited_at"]),
            "argument": {
                "title": r["title"],
                "body": r["body"],
                "type": r["type"],
                "ballotUri": r["ballot_uri"],
                "ballotRkey": r["ballot_rkey"],
                "authorDid": r["author_did"],
            },
        }
        for r in rows
    ]

    return JSONResponse(status_code=200, content={"invitations": invitations})


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.peerreview.list
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.peerreview.list")
async def list_ballot_peerreviews(
    request: Request,
    ballot_rkey: str = Query(..., alias="ballotRkey"),
    scope: str = Query("mine"),
    session: TSession = Depends(verify_session_token),
):
    """List the peer reviews (Gutachten) of a single ballot.

    Unlike `.pending` (the user's own open invitations) or `.status` (one
    argument), this returns every peer-review row whose argument belongs to the
    given ballot, with vote counts and per-viewer flags.

    `scope`:
      * 'mine' (default) — only reviews the viewer is involved in: invited,
        already responded, or author of the reviewed argument.
      * 'all' — every peer review of the ballot (transparency view).

    Sorted server-side: open + provisional_closed first (the "current" ones),
    then closed; newest first within each group. The frontend just splits on
    `state == 'closed'`.
    """
    scope = scope if scope in ("mine", "all") else "mine"

    # viewer_inv / viewer_resp are LEFT-JOINed on the viewer DID (each at most
    # one row thanks to the (argument, did) unique constraints), so referencing
    # them in the WHERE clause is safe and avoids a separate lookup.
    mine_filter = (
        "AND (viewer_inv.invitee_did IS NOT NULL "
        "OR viewer_resp.uri IS NOT NULL "
        "OR a.author_did = $2)"
        if scope == "mine"
        else ""
    )

    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            f"""
            SELECT
              pr.argument_uri,
              a.title, a.body, a.type, a.author_did,
              pr.state, a.peerreview_status, pr.quorum,
              pr.opened_at, pr.provisional_closed_at, pr.grace_until, pr.closed_at,
              rc.approvals, rc.rejections, rc.total,
              ic.invitation_count,
              (viewer_inv.invitee_did IS NOT NULL) AS viewer_invited,
              viewer_inv.checked_in_at            AS viewer_checked_in_at,
              (viewer_resp.uri IS NOT NULL)        AS viewer_responded,
              (a.author_did = $2)                  AS viewer_is_author
            FROM app_peerreviews pr
            JOIN app_arguments a
              ON a.uri = pr.argument_uri AND NOT a.deleted AND a.ballot_rkey = $1
            -- LATERAL count subqueries keep responses/invitations from
            -- fanning out against each other (cartesian inflation).
            LEFT JOIN LATERAL (
              SELECT
                COUNT(*) FILTER (WHERE vote = 'APPROVE') AS approvals,
                COUNT(*) FILTER (WHERE vote = 'REJECT')  AS rejections,
                COUNT(*)                                  AS total
              FROM app_peerreview_responses
              WHERE argument_uri = pr.argument_uri
            ) rc ON true
            LEFT JOIN LATERAL (
              SELECT COUNT(*) AS invitation_count
              FROM app_peerreview_invitations
              WHERE argument_uri = pr.argument_uri AND invited = true
            ) ic ON true
            LEFT JOIN app_peerreview_invitations viewer_inv
              ON viewer_inv.argument_uri = pr.argument_uri
             AND viewer_inv.invitee_did = $2
             AND viewer_inv.invited = true
            LEFT JOIN app_peerreview_responses viewer_resp
              ON viewer_resp.argument_uri = pr.argument_uri
             AND viewer_resp.reviewer_did = $2
            WHERE true
              {mine_filter}
            ORDER BY (pr.state = 'closed') ASC,
                     COALESCE(pr.closed_at, pr.opened_at) DESC
            """,
            ballot_rkey,
            session.did,
        )

    reviews = [
        {
            "argumentUri": r["argument_uri"],
            "title": r["title"],
            "body": r["body"],
            "type": r["type"],
            "authorDid": r["author_did"],
            "state": r["state"],
            "peerreviewStatus": r["peerreview_status"],
            "quorum": r["quorum"],
            "approvals": r["approvals"],
            "rejections": r["rejections"],
            "totalReviews": r["total"],
            "invitationCount": r["invitation_count"],
            "openedAt": _iso(r["opened_at"]),
            "provisionalClosedAt": _iso(r["provisional_closed_at"]),
            "graceUntil": _iso(r["grace_until"]),
            "closedAt": _iso(r["closed_at"]),
            "viewerInvited": r["viewer_invited"],
            "viewerCheckedInAt": _iso(r["viewer_checked_in_at"]),
            "viewerResponded": r["viewer_responded"],
            "viewerIsAuthor": r["viewer_is_author"],
        }
        for r in rows
    ]

    return JSONResponse(status_code=200, content={"reviews": reviews})


# -----------------------------------------------------------------------------
# POST /xrpc/app.ch.poltr.peerreview.checkIn
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.peerreview.checkIn")
async def check_in_review(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Claim a review slot. Required before the user may submit.

    Validates the user holds an active invitation and the review still accepts
    them. While `state='open'` any active invitee may check in. Once the review
    is in `provisional_closed`, new check-ins are refused but already-checked-in
    users get a refreshed view (so re-opening the tab works).
    """
    body = await request.json()
    argument_uri = body.get("argumentUri")
    if not argument_uri:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "argumentUri required"},
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Lock the peerreview row to serialise against the response insert
            # that flips state to provisional_closed. Cheap: at most one row.
            pr = await conn.fetchrow(
                """
                SELECT state, quorum, grace_until
                FROM app_peerreviews
                WHERE argument_uri = $1
                  AND EXISTS (SELECT 1 FROM app_arguments a
                              WHERE a.uri = $1 AND NOT a.deleted)
                FOR UPDATE
                """,
                argument_uri,
            )
            if not pr:
                return JSONResponse(
                    status_code=404,
                    content={
                        "error": "not_found",
                        "message": "No peer review for this argument",
                    },
                )
            if pr["state"] == "closed":
                return JSONResponse(
                    status_code=409,
                    content={"error": "closed", "message": "Peer review is closed"},
                )

            inv = await conn.fetchrow(
                """
                SELECT uri, checked_in_at
                FROM app_peerreview_invitations
                WHERE argument_uri = $1 AND invitee_did = $2 AND invited = true
                """,
                argument_uri,
                session.did,
            )
            if not inv:
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "not_invited",
                        "message": "No active invitation for this argument",
                    },
                )

            already_checked_in = inv["checked_in_at"] is not None
            if pr["state"] == "provisional_closed" and not already_checked_in:
                # New check-ins refused during the grace window.
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "too_late",
                        "message": "Quorum reached; no new reviewers accepted",
                    },
                )

            # First-time check-in: stamp both timestamps. Re-check-in (e.g. tab
            # reload): refresh last_activity_at so the user appears live again.
            await conn.execute(
                """
                UPDATE app_peerreview_invitations
                   SET checked_in_at    = COALESCE(checked_in_at, NOW()),
                       last_activity_at = NOW()
                 WHERE argument_uri = $1 AND invitee_did = $2
                """,
                argument_uri,
                session.did,
            )

    return JSONResponse(
        status_code=200,
        content={
            "state": pr["state"],
            "quorum": pr["quorum"],
            "graceUntil": _iso(pr["grace_until"]),
        },
    )


# -----------------------------------------------------------------------------
# POST /xrpc/app.ch.poltr.peerreview.activity
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.peerreview.activity")
async def review_activity(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Slide the grace window forward on real reviewer activity.

    Called by the frontend on `input`/`change` events (throttled). During
    'open' state, just refreshes last_activity_at. During 'provisional_closed',
    also extends grace_until by GRACE_PERIOD — this is what protects a typing
    reviewer from getting cut off mid-sentence.

    Returns the fresh grace_until (or null when state='open') so the frontend
    can reset its client-side countdown without polling.
    """
    body = await request.json()
    argument_uri = body.get("argumentUri")
    if not argument_uri:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "argumentUri required"},
        )

    grace = _grace_seconds()
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            pr = await conn.fetchrow(
                """
                SELECT state, grace_until
                FROM app_peerreviews
                WHERE argument_uri = $1
                  AND EXISTS (SELECT 1 FROM app_arguments a
                              WHERE a.uri = $1 AND NOT a.deleted)
                FOR UPDATE
                """,
                argument_uri,
            )
            if not pr:
                return JSONResponse(
                    status_code=404,
                    content={"error": "not_found", "message": "No peer review"},
                )
            if pr["state"] == "closed":
                return JSONResponse(
                    status_code=409,
                    content={"error": "closed", "message": "Peer review is closed"},
                )

            # Update activity unconditionally if the user is checked in. We
            # don't strictly need to require check-in here, but it's the cheapest
            # guard against random clients spamming the endpoint.
            inv_updated = await conn.execute(
                """
                UPDATE app_peerreview_invitations
                   SET last_activity_at = NOW()
                 WHERE argument_uri = $1
                   AND invitee_did  = $2
                   AND invited      = true
                   AND checked_in_at IS NOT NULL
                """,
                argument_uri,
                session.did,
            )
            if inv_updated.endswith(" 0"):
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "not_checked_in",
                        "message": "Check in first before sending activity",
                    },
                )

            grace_until = pr["grace_until"]
            if pr["state"] == "provisional_closed":
                row = await conn.fetchrow(
                    """
                    UPDATE app_peerreviews
                       SET grace_until = NOW() + ($2 || ' seconds')::interval
                     WHERE argument_uri = $1 AND state = 'provisional_closed'
                     RETURNING grace_until
                    """,
                    argument_uri,
                    str(grace),
                )
                if row:
                    grace_until = row["grace_until"]

    return JSONResponse(
        status_code=200,
        content={
            "state": pr["state"],
            "graceUntil": _iso(grace_until),
        },
    )


# -----------------------------------------------------------------------------
# POST /xrpc/app.ch.poltr.peerreview.submit
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.peerreview.submit")
async def submit_review(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Submit a peer-review for an argument.

    Validates state + check-in atomically: a reviewer who entered before the
    quorum hit is always allowed to finish; everyone else is bounced. Late
    submissions get the in-flight body back in `acceptedDraft` so the frontend
    can preserve the user's work even when the server can't accept it.
    """
    body = await request.json()
    argument_uri = body.get("argumentUri")
    criteria = body.get("criteria")
    vote = body.get("vote")
    justification = body.get("justification", "")

    # Vote-payload validity (not DB state, so deliberately NOT in app_response_gate):
    # the same check lives in the community-writer's _accept_response. writer-first
    # rule — see "Guard-Parität" in doc/SECURITY_AUTH.md.
    # Kriterien sind ein OPTIONALes Signal (Default: nichts gewählt) — die
    # Liste muss vorhanden, darf aber leer sein. Verbindlich ist das Gesamturteil
    # (vote). Siehe doc/ARGUMENT_CRITERIA.md „Bewertungs-Modus".
    if (
        not argument_uri
        or not isinstance(criteria, list)
        or vote not in ("APPROVE", "REJECT")
    ):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "argumentUri, criteria (list), and valid vote required",
            },
        )

    if vote == "REJECT" and not justification:
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "Justification required for REJECT vote",
            },
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Lock the review row to serialize against the quorum-flip
            # (checkReviewQuorum updates WHERE state='open'); closed_at feeds the
            # review_closed response body below.
            pr = await conn.fetchrow(
                "SELECT closed_at FROM app_peerreviews WHERE argument_uri = $1 FOR UPDATE",
                argument_uri,
            )

            # Authorization decision — SINGLE SOURCE OF TRUTH shared with the
            # community-writer: app_response_gate() in
            # infra/scripts/postgres/db-setup.sql. Returns NULL = allowed, else a
            # reason in fixed priority; we map it to the user-facing response here
            # (the writer maps the same reason to a queue rejection).
            reason = await conn.fetchval(
                "SELECT app_response_gate($1, $2)", argument_uri, session.did
            )
            if reason == "no_peerreview":
                return JSONResponse(
                    status_code=404,
                    content={"error": "not_found", "message": "No peer review"},
                )
            if reason == "not_invited":
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "not_invited",
                        "message": "No invitation found for this argument",
                    },
                )
            # 'closed' is unconditionally too late — hand the draft back so the
            # frontend can preserve the user's work.
            if reason == "review_closed":
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "review_closed",
                        "message": "Peer review is closed",
                        "closedAt": _iso(pr["closed_at"]) if pr else None,
                        "acceptedDraft": {
                            "argumentUri": argument_uri,
                            "criteria": criteria,
                            "vote": vote,
                            "justification": justification,
                        },
                    },
                )
            if reason == "not_checked_in":
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "not_checked_in",
                        "message": "Check in first before submitting",
                    },
                )

            existing = await conn.fetchval(
                """
                SELECT uri FROM app_peerreview_responses
                WHERE argument_uri = $1 AND reviewer_did = $2
                """,
                argument_uri,
                session.did,
            )
            if existing:
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "already_reviewed",
                        "message": "You have already reviewed this argument",
                    },
                )

            community_did = await conn.fetchval(
                "SELECT did FROM app_arguments WHERE uri = $1",
                argument_uri,
            )

    if not community_did:
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "message": "Argument not found"},
        )

    # Write review response to community PDS. The indexer will pick it up via
    # firehose and (if quorum is now reached) transition the review to
    # provisional_closed in checkReviewQuorum.
    review_record = {
        "$type": "app.ch.poltr.peerreview.response",
        "argument": argument_uri,
        "reviewer": session.did,
        "criteria": criteria,
        "vote": vote,
        "justification": justification or None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    review_record = {k: v for k, v in review_record.items() if v is not None}

    # ATProto-native: write the self-signed response into the reviewer's OWN repo.
    # The internal write-side (writer) picks it up off the firehose, gates it, and
    # writes the canonical community response (deterministic rkey via
    # compose_review_rkey) into the argument's community repo.
    result = await pds_create_record(
        session, "app.ch.poltr.peerreview.response", review_record
    )

    return JSONResponse(
        status_code=200,
        content={"uri": result.get("uri", "")},
    )


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.peerreview.status
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.peerreview.status")
async def get_peerreview_status(
    request: Request,
    argument_uri: str = Query(..., alias="argumentUri"),
    session: TSession = Depends(verify_session_token),
):
    """Return lifecycle + counts for a single argument's peer review.

    `state`, `quorum`, `graceUntil` come from app_peerreviews — the lifecycle
    source of truth. `reviewStatus` on app_arguments is the terminal outcome
    (preliminary / approved / rejected) which is only meaningful after the
    finaliser runs.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        arg = await conn.fetchrow(
            "SELECT uri, author_did, peerreview_status FROM app_arguments WHERE uri = $1 AND NOT deleted",
            argument_uri,
        )
        if not arg:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Argument not found"},
            )

        pr = await conn.fetchrow(
            """
            SELECT state, quorum, provisional_closed_at, grace_until, closed_at
            FROM app_peerreviews
            WHERE argument_uri = $1
            """,
            argument_uri,
        )

        counts = await conn.fetchrow(
            """
            SELECT
              COUNT(*) FILTER (WHERE vote = 'APPROVE') AS approvals,
              COUNT(*) FILTER (WHERE vote = 'REJECT') AS rejections,
              COUNT(*) AS total
            FROM app_peerreview_responses
            WHERE argument_uri = $1
            """,
            argument_uri,
        )

        invitation_count = await conn.fetchval(
            "SELECT COUNT(*) FROM app_peerreview_invitations WHERE argument_uri = $1 AND invited = true",
            argument_uri,
        )

        # Per-user check-in status helps the frontend decide whether to render
        # the form or a "you must check in" gate. Null when no invitation.
        check_in = await conn.fetchrow(
            """
            SELECT checked_in_at, last_activity_at
            FROM app_peerreview_invitations
            WHERE argument_uri = $1 AND invitee_did = $2 AND invited = true
            """,
            argument_uri,
            session.did,
        )

        # Aggregierte Kriterien-Auszählung (ok vs. beanstandet) über ALLE
        # Antworten. Nur Summen — die einzelnen Stimmen bleiben autorenintern;
        # das Aggregat ist so unkritisch wie die approvals/rejections-Zähler.
        breakdown_rows = await conn.fetch(
            """
            SELECT c->>'key'                                          AS key,
                   max(c->>'label')                                   AS label,
                   count(*) FILTER (WHERE c->>'assessment' = 'ok')      AS ok,
                   count(*) FILTER (WHERE c->>'assessment' = 'flagged') AS flagged
            FROM app_peerreview_responses r
            CROSS JOIN LATERAL jsonb_array_elements(r.criteria) AS c
            WHERE r.argument_uri = $1
              AND jsonb_typeof(r.criteria) = 'array'
            GROUP BY c->>'key'
            """,
            argument_uri,
        )

        reviews = []
        if session.did == arg["author_did"]:
            review_rows = await conn.fetch(
                """
                SELECT reviewer_did, criteria, vote, justification, created_at
                FROM app_peerreview_responses
                WHERE argument_uri = $1
                ORDER BY created_at ASC
                """,
                argument_uri,
            )
            for r in review_rows:
                reviews.append(
                    {
                        "reviewerDid": r["reviewer_did"],
                        "criteria": r["criteria"],
                        "vote": r["vote"],
                        "justification": r["justification"],
                        "createdAt": _iso(r["created_at"]),
                    }
                )

    # Reihenfolge an der konfigurierten Kriterienliste ausrichten (unbekannte ans Ende).
    crit_order = {c["key"]: i for i, c in enumerate(_get_criteria())}
    criteria_breakdown = sorted(
        (
            {"key": b["key"], "label": b["label"], "ok": b["ok"], "flagged": b["flagged"]}
            for b in breakdown_rows
        ),
        key=lambda b: crit_order.get(b["key"], len(crit_order)),
    )

    status_data = {
        "argumentUri": argument_uri,
        "peerreviewStatus": arg["peerreview_status"],
        "criteriaBreakdown": criteria_breakdown,
        "state": pr["state"] if pr else None,
        "quorum": pr["quorum"] if pr else None,
        "provisionalClosedAt": _iso(pr["provisional_closed_at"]) if pr else None,
        "graceUntil": _iso(pr["grace_until"]) if pr else None,
        "closedAt": _iso(pr["closed_at"]) if pr else None,
        "approvals": counts["approvals"],
        "rejections": counts["rejections"],
        "totalReviews": counts["total"],
        "invitationCount": invitation_count,
        "checkedInAt": _iso(check_in["checked_in_at"]) if check_in else None,
        "lastActivityAt": _iso(check_in["last_activity_at"]) if check_in else None,
    }

    if reviews:
        status_data["reviews"] = reviews

    return JSONResponse(status_code=200, content=status_data)
