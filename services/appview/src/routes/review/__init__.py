"""
Peer-review endpoints for argument quality control.

Provides endpoints for:
- Listing pending review invitations for a user
- Submitting a review response
- Checking review status of an argument
- Retrieving configurable review criteria
"""

import json
import os
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Query, Request, Depends
from fastapi.responses import JSONResponse

import httpx

from src.auth.middleware import TSession, verify_session_token
from src.lib.db import get_pool
from src.lib.governance_pds import create_governance_record, _governance_did

logger = logging.getLogger("review")

router = APIRouter(prefix="/xrpc", tags=["review"])


def _get_quorum() -> int:
    return int(os.getenv("PEER_REVIEW_QUORUM", "10"))


def _get_criteria() -> list[dict]:
    raw = os.getenv(
        "PEER_REVIEW_CRITERIA",
        '[{"key":"factual_accuracy","label":"Factual Accuracy"},'
        '{"key":"relevance","label":"Relevance to Ballot"},'
        '{"key":"clarity","label":"Clarity"},'
        '{"key":"unity_of_thought","label":"Unity of Thought"},'
        '{"key":"non_duplication","label":"Non-Duplication"}]',
    )
    return json.loads(raw)


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.review.criteria
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.review.criteria")
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
# GET /xrpc/app.ch.poltr.review.pending
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.review.pending")
async def get_pending_reviews(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Return pending review invitations for the authenticated user."""
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT ri.uri AS invitation_uri, ri.argument_uri, ri.created_at AS invited_at,
                   a.title, a.body, a.type, a.ballot_uri, a.ballot_rkey, a.did AS author_did
            FROM app_review_invitations ri
            JOIN app_arguments a ON a.uri = ri.argument_uri AND NOT a.deleted
            WHERE ri.invitee_did = $1
              AND NOT ri.deleted
              AND a.review_status = 'preliminary'
              AND NOT EXISTS (
                SELECT 1 FROM app_review_responses rr
                WHERE rr.argument_uri = ri.argument_uri
                  AND rr.reviewer_did = $1
                  AND NOT rr.deleted
              )
            ORDER BY ri.created_at ASC
            """,
            session.did,
        )

    invitations = []
    for r in rows:
        row = dict(r)
        invitations.append({
            "invitationUri": row["invitation_uri"],
            "argumentUri": row["argument_uri"],
            "invitedAt": row["invited_at"].isoformat() if row["invited_at"] else None,
            "argument": {
                "title": row["title"],
                "body": row["body"],
                "type": row["type"],
                "ballotUri": row["ballot_uri"],
                "ballotRkey": row["ballot_rkey"],
                "authorDid": row["author_did"],
            },
        })

    return JSONResponse(status_code=200, content={"invitations": invitations})


# -----------------------------------------------------------------------------
# POST /xrpc/app.ch.poltr.review.submit
# -----------------------------------------------------------------------------


@router.post("/app.ch.poltr.review.submit")
async def submit_review(
    request: Request,
    session: TSession = Depends(verify_session_token),
):
    """Submit a peer-review for an argument."""
    body = await request.json()
    argument_uri = body.get("argumentUri")
    criteria = body.get("criteria")
    vote = body.get("vote")
    justification = body.get("justification", "")

    # Validate required fields
    if not argument_uri or not criteria or vote not in ("APPROVE", "REJECT"):
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "argumentUri, criteria, and valid vote required"},
        )

    if vote == "REJECT" and not justification:
        return JSONResponse(
            status_code=400,
            content={"error": "invalid_request", "message": "Justification required for REJECT vote"},
        )

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Verify invitation exists
        invitation = await conn.fetchrow(
            """
            SELECT uri FROM app_review_invitations
            WHERE argument_uri = $1 AND invitee_did = $2 AND NOT deleted
            """,
            argument_uri,
            session.did,
        )
        if not invitation:
            return JSONResponse(
                status_code=403,
                content={"error": "not_invited", "message": "No invitation found for this argument"},
            )

        # Check not already reviewed
        existing = await conn.fetchrow(
            """
            SELECT uri FROM app_review_responses
            WHERE argument_uri = $1 AND reviewer_did = $2 AND NOT deleted
            """,
            argument_uri,
            session.did,
        )
        if existing:
            return JSONResponse(
                status_code=409,
                content={"error": "already_reviewed", "message": "You have already reviewed this argument"},
            )

    # Write review response to governance PDS
    review_record = {
        "$type": "app.ch.poltr.review.response",
        "argument": argument_uri,
        "reviewer": session.did,
        "criteria": criteria,
        "vote": vote,
        "justification": justification if justification else None,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    # Remove None values
    review_record = {k: v for k, v in review_record.items() if v is not None}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            result = await create_governance_record(
                client, "app.ch.poltr.review.response", review_record
            )
    except Exception as err:
        logger.error(f"Failed to write review to governance PDS: {err}")
        return JSONResponse(
            status_code=500,
            content={"error": "pds_error", "message": str(err)},
        )

    # The review is now on the governance PDS. The indexer will pick it up
    # via firehose, index it, and run the quorum check. If the quorum is
    # reached, the appview background loop will create the governance copy.
    return JSONResponse(
        status_code=200,
        content={"uri": result.get("uri", "")},
    )


# -----------------------------------------------------------------------------
# GET /xrpc/app.ch.poltr.review.status
# -----------------------------------------------------------------------------


@router.get("/app.ch.poltr.review.status")
async def get_review_status(
    request: Request,
    argument_uri: str = Query(..., alias="argumentUri"),
    session: TSession = Depends(verify_session_token),
):
    """Get review status for an argument."""
    quorum = _get_quorum()
    pool = await get_pool()

    async with pool.acquire() as conn:
        arg = await conn.fetchrow(
            "SELECT uri, did, review_status, governance_uri FROM app_arguments WHERE uri = $1 AND NOT deleted",
            argument_uri,
        )
        if not arg:
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Argument not found"},
            )

        counts = await conn.fetchrow(
            """
            SELECT
              COUNT(*) FILTER (WHERE vote = 'APPROVE') AS approvals,
              COUNT(*) FILTER (WHERE vote = 'REJECT') AS rejections,
              COUNT(*) AS total
            FROM app_review_responses
            WHERE argument_uri = $1 AND NOT deleted
            """,
            argument_uri,
        )

        invitation_count = await conn.fetchval(
            "SELECT COUNT(*) FROM app_review_invitations WHERE argument_uri = $1 AND NOT deleted",
            argument_uri,
        )

        # Author sees individual feedback
        reviews = []
        is_author = session.did == arg["did"]
        if is_author:
            review_rows = await conn.fetch(
                """
                SELECT reviewer_did, criteria, vote, justification, created_at
                FROM app_review_responses
                WHERE argument_uri = $1 AND NOT deleted
                ORDER BY created_at ASC
                """,
                argument_uri,
            )
            for r in review_rows:
                row = dict(r)
                reviews.append({
                    "reviewerDid": row["reviewer_did"],
                    "criteria": row["criteria"],
                    "vote": row["vote"],
                    "justification": row["justification"],
                    "createdAt": row["created_at"].isoformat() if row["created_at"] else None,
                })

    status_data = {
        "argumentUri": argument_uri,
        "reviewStatus": arg["review_status"],
        "governanceUri": arg["governance_uri"],
        "quorum": quorum,
        "approvals": counts["approvals"],
        "rejections": counts["rejections"],
        "totalReviews": counts["total"],
        "invitationCount": invitation_count,
    }

    if reviews:
        status_data["reviews"] = reviews

    return JSONResponse(status_code=200, content=status_data)
