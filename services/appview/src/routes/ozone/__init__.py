"""
tools.ozone.* endpoints

Proxy endpoints for Ozone moderation service.
These are called by Ozone to fetch data for moderation.
"""

import json
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

from src.lib.fastapi import logger
from src.lib.db import get_pool
from src.config import (
    PDS_URL,
    FORWARD_REQUEST_HEADERS,
)

router = APIRouter(prefix="/xrpc", tags=["ozone"])


def _forward_headers(request: Request) -> dict:
    """Extract headers to forward from request."""
    headers = {}
    for header in FORWARD_REQUEST_HEADERS:
        if header in request.headers:
            headers[header] = request.headers[header]
    return headers


# -----------------------------------------------------------------------------
# tools.ozone.moderation.getRepo
# -----------------------------------------------------------------------------


@router.get("/tools.ozone.moderation.getRepo")
async def get_repo(request: Request):
    """
    Get repository info for moderation.
    Returns account info with labels from local database.
    """
    did = request.query_params.get("did")
    if not did:
        return Response(
            content='{"error":"InvalidRequest","message":"did parameter is required"}',
            status_code=400,
            media_type="application/json",
        )

    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            # Get account info from indexed data
            row = await conn.fetchrow(
                """
                SELECT did, handle, display_name, avatar, indexed_at
                FROM poltr_account
                WHERE did = $1
                """,
                did,
            )

            if not row:
                return Response(
                    content='{"error":"NotFound","message":"Account not found"}',
                    status_code=404,
                    media_type="application/json",
                )

            # Get labels for this account
            labels = await conn.fetch(
                """
                SELECT src, uri, val, neg, cts
                FROM poltr_label
                WHERE uri = $1
                """,
                did,
            )

            result = {
                "did": row["did"],
                "handle": row["handle"],
                "displayName": row.get("display_name"),
                "avatar": row.get("avatar"),
                "indexedAt": (
                    row["indexed_at"].isoformat() if row.get("indexed_at") else None
                ),
                "labels": [
                    {
                        "src": l["src"],
                        "uri": l["uri"],
                        "val": l["val"],
                        "neg": l["neg"],
                        "cts": l["cts"].isoformat() if l.get("cts") else None,
                    }
                    for l in labels
                ],
            }

            return Response(
                content=json.dumps(result),
                status_code=200,
                media_type="application/json",
            )

    except Exception as e:
        logger.error(f"Error fetching repo for {did}: {e}")
        return Response(
            content=f'{{"error":"InternalError","message":"{str(e)}"}}',
            status_code=500,
            media_type="application/json",
        )


# -----------------------------------------------------------------------------
# tools.ozone.moderation.getRecord
# -----------------------------------------------------------------------------


@router.get("/tools.ozone.moderation.getRecord")
async def get_record(request: Request):
    """
    Get record info for moderation.
    Fetches record from PDS and enriches with local labels.
    """
    uri = request.query_params.get("uri")
    if not uri:
        return Response(
            content='{"error":"InvalidRequest","message":"uri parameter is required"}',
            status_code=400,
            media_type="application/json",
        )

    # Parse AT URI: at://did/collection/rkey
    try:
        parts = uri.replace("at://", "").split("/")
        did = parts[0]
        collection = parts[1] if len(parts) > 1 else None
        rkey = parts[2] if len(parts) > 2 else None
    except Exception:
        return Response(
            content='{"error":"InvalidRequest","message":"Invalid AT URI"}',
            status_code=400,
            media_type="application/json",
        )

    headers = _forward_headers(request)

    async with httpx.AsyncClient() as client:
        # Fetch record from PDS
        pds_url = f"{PDS_URL}/xrpc/com.atproto.repo.getRecord?repo={did}&collection={collection}&rkey={rkey}"
        try:
            response = await client.get(pds_url, headers=headers, timeout=30.0)
        except httpx.RequestError as e:
            logger.error(f"Error fetching record {uri}: {e}")
            return Response(
                content='{"error":"UpstreamError","message":"Failed to reach PDS"}',
                status_code=502,
                media_type="application/json",
            )

        if response.status_code != 200:
            return Response(
                content=response.content,
                status_code=response.status_code,
                media_type="application/json",
            )

        record_data = response.json()

    # Enrich with labels from local DB
    try:
        db_pool = await get_pool()
        async with db_pool.acquire() as conn:
            labels = await conn.fetch(
                """
                SELECT src, uri, val, neg, cts
                FROM poltr_label
                WHERE uri = $1
                """,
                uri,
            )

            record_data["labels"] = [
                {
                    "src": l["src"],
                    "uri": l["uri"],
                    "val": l["val"],
                    "neg": l["neg"],
                    "cts": l["cts"].isoformat() if l.get("cts") else None,
                }
                for l in labels
            ]
    except Exception as e:
        logger.warning(f"Failed to fetch labels for {uri}: {e}")
        record_data["labels"] = []

    return Response(
        content=json.dumps(record_data),
        status_code=200,
        media_type="application/json",
    )
