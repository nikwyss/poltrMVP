"""
Peer-review endpoints for argument quality control.

Lifecycle (see doc/PEER_REVIEW.md):
    open  ─▶ provisional_closed  ─▶ closed
              (grace window, sliding on reviewer activity)

Endpoints
=========
- GET  app.ch.poltr.peerreview.criteria   configurable criteria list
- GET  app.ch.poltr.peerreview.pending    invitations the user can still take
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

from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse

from src.auth.middleware import TSession, verify_session_token
from src.core.db import get_pool
from src.atproto.atproto_api import pds_create_record

logger = logging.getLogger("review")

router = APIRouter(prefix="/xrpc", tags=["review"])


def _grace_seconds() -> int:
    return int(os.getenv("APPVIEW_PEER_REVIEW_GRACE_PERIOD_SECONDS", "600"))


def _get_criteria() -> list[dict]:
    raw = os.getenv(
        "APPVIEW_PEER_REVIEW_CRITERIA",
        '[{"key":"factual_accuracy","label":"Factual Accuracy"},'
        '{"key":"relevance","label":"Relevance to Ballot"},'
        '{"key":"clarity","label":"Clarity"},'
        '{"key":"unity_of_thought","label":"Unity of Thought"},'
        '{"key":"non_duplication","label":"Non-Duplication"}]',
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

    if not argument_uri or not criteria or vote not in ("APPROVE", "REJECT"):
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_request",
                "message": "argumentUri, criteria, and valid vote required",
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
            pr = await conn.fetchrow(
                """
                SELECT state, closed_at
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

            inv = await conn.fetchrow(
                """
                SELECT checked_in_at
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
                        "message": "No invitation found for this argument",
                    },
                )

            # 'closed' is unconditionally too late. 'provisional_closed' is OK
            # only if the user was already checked in when the review flipped
            # — and check-in is required before submit regardless.
            if pr["state"] == "closed":
                return JSONResponse(
                    status_code=409,
                    content={
                        "error": "review_closed",
                        "message": "Peer review is closed",
                        "closedAt": _iso(pr["closed_at"]),
                        "acceptedDraft": {
                            "argumentUri": argument_uri,
                            "criteria": criteria,
                            "vote": vote,
                            "justification": justification,
                        },
                    },
                )
            if inv["checked_in_at"] is None:
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

            gov_did = await conn.fetchval(
                "SELECT did FROM app_arguments WHERE uri = $1",
                argument_uri,
            )

    if not gov_did:
        return JSONResponse(
            status_code=404,
            content={"error": "not_found", "message": "Argument not found"},
        )

    # Write review response to governance PDS. The indexer will pick it up via
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
    # compose_review_rkey) into the argument's governance repo.
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

    status_data = {
        "argumentUri": argument_uri,
        "peerreviewStatus": arg["peerreview_status"],
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
