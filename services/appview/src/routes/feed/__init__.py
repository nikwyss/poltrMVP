"""
app.bsky.feed.* endpoints

Handles feed-related operations (timeline, posts, threads).
Includes the poltr feed generator (getFeedSkeleton, describeFeedGenerator).
"""

import os
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, Response

from src.lib.db import get_pool
from src.lib.fastapi import logger
from src.config import (
    BLUESKY_APPVIEW_URL,
    FORWARD_REQUEST_HEADERS,
    FORWARD_RESPONSE_HEADERS,
)

router = APIRouter(prefix="/xrpc", tags=["feed"])

FEED_GENERATOR_DID = os.getenv("FEED_GENERATOR_DID", "did:web:app.poltr.info")
GOVERNANCE_DID = os.getenv("PDS_GOVERNANCE_ACCOUNT_DID", "")
FEED_URI = f"at://{GOVERNANCE_DID}/app.bsky.feed.generator/poltr"


# -----------------------------------------------------------------------------
# Feed generator endpoints (poltr feed)
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.describeFeedGenerator")
async def describe_feed_generator():
    """Describe available feeds served by this generator."""
    return {"did": FEED_GENERATOR_DID, "feeds": [{"uri": FEED_URI}]}


@router.get("/app.bsky.feed.getFeedSkeleton")
async def get_feed_skeleton(
    feed: str,
    limit: int = Query(default=50, ge=1, le=100),
    cursor: str = Query(default=None),
):
    """Return a skeleton of post URIs for the poltr feed."""
    if feed != FEED_URI:
        return JSONResponse(
            status_code=400,
            content={
                "error": "UnknownFeed",
                "message": f"Unknown feed: {feed}",
            },
        )

    # Parse cursor: "2026-02-15T20:53:04.083000+00:00::rkey"
    cursor_ts = None
    cursor_rkey = None
    if cursor:
        parts = cursor.split("::", 1)
        if len(parts) != 2:
            return JSONResponse(
                status_code=400,
                content={"error": "BadCursor", "message": "Malformed cursor"},
            )
        try:
            cursor_ts = datetime.fromisoformat(parts[0])
            cursor_rkey = parts[1]
        except (ValueError, IndexError):
            return JSONResponse(
                status_code=400,
                content={"error": "BadCursor", "message": "Malformed cursor"},
            )

    pool = await get_pool()
    async with pool.acquire() as conn:
        if cursor_ts and cursor_rkey:
            rows = await conn.fetch(
                """
                SELECT bsky_post_uri, created_at, rkey
                FROM app_ballots
                WHERE bsky_post_uri IS NOT NULL AND NOT deleted
                  AND (created_at, rkey) < ($1, $2)
                ORDER BY created_at DESC, rkey DESC
                LIMIT $3
                """,
                cursor_ts,
                cursor_rkey,
                limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT bsky_post_uri, created_at, rkey
                FROM app_ballots
                WHERE bsky_post_uri IS NOT NULL AND NOT deleted
                ORDER BY created_at DESC, rkey DESC
                LIMIT $1
                """,
                limit,
            )

    feed_items = [{"post": row["bsky_post_uri"]} for row in rows]

    result: dict = {"feed": feed_items}
    if rows:
        last = rows[-1]
        result["cursor"] = f"{last['created_at'].isoformat()}::{last['rkey']}"

    return result


# -----------------------------------------------------------------------------
# Proxy helpers
# -----------------------------------------------------------------------------


def _forward_headers(request: Request) -> dict:
    """Extract headers to forward from request."""
    headers = {}
    for header in FORWARD_REQUEST_HEADERS:
        if header in request.headers:
            headers[header] = request.headers[header]
    return headers


def _response_headers(upstream_response: httpx.Response) -> dict:
    """Extract headers to forward from upstream response."""
    headers = {}
    for header in FORWARD_RESPONSE_HEADERS:
        if header in upstream_response.headers:
            headers[header] = upstream_response.headers[header]
    return headers


async def _proxy_to_bluesky(request: Request, method: str) -> Response:
    """Generic proxy helper for feed endpoints."""
    upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/{method}"
    if request.query_params:
        upstream_url += f"?{request.query_params}"

    headers = _forward_headers(request)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(upstream_url, headers=headers, timeout=30.0)
        except httpx.RequestError as e:
            logger.error(f"Error proxying {method}: {e}")
            return Response(
                content='{"error":"UpstreamError","message":"Failed to reach upstream AppView"}',
                status_code=502,
                media_type="application/json",
            )

    return Response(
        content=response.content,
        status_code=response.status_code,
        headers=_response_headers(response),
        media_type=response.headers.get("content-type", "application/json"),
    )


# -----------------------------------------------------------------------------
# app.bsky.feed.getTimeline
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.getTimeline")
async def get_timeline(request: Request):
    """Get the user's home timeline."""
    # TODO: Implement local timeline from indexed data
    return await _proxy_to_bluesky(request, "app.bsky.feed.getTimeline")


# -----------------------------------------------------------------------------
# app.bsky.feed.getAuthorFeed
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.getAuthorFeed")
async def get_author_feed(request: Request):
    """Get posts from a specific author."""
    # TODO: Implement from local index
    return await _proxy_to_bluesky(request, "app.bsky.feed.getAuthorFeed")


# -----------------------------------------------------------------------------
# app.bsky.feed.getPostThread
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.getPostThread")
async def get_post_thread(request: Request):
    """Get a post and its thread (replies)."""
    # TODO: Implement from local index with label augmentation
    return await _proxy_to_bluesky(request, "app.bsky.feed.getPostThread")


# -----------------------------------------------------------------------------
# app.bsky.feed.getPosts
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.getPosts")
async def get_posts(request: Request):
    """Get multiple posts by URI."""
    # TODO: Implement from local index
    return await _proxy_to_bluesky(request, "app.bsky.feed.getPosts")


# -----------------------------------------------------------------------------
# app.bsky.feed.searchPosts
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.searchPosts")
async def search_posts(request: Request):
    """Search for posts."""
    # TODO: Implement local full-text search
    return await _proxy_to_bluesky(request, "app.bsky.feed.searchPosts")


# -----------------------------------------------------------------------------
# app.bsky.feed.getLikes
# -----------------------------------------------------------------------------


@router.get("/app.bsky.feed.getLikes")
async def get_likes(request: Request):
    """Get likes on a post."""
    # TODO: Implement from local index
    return await _proxy_to_bluesky(request, "app.bsky.feed.getLikes")
