"""
Proxy for Bluesky AppView requests.
Forwards app.bsky.* XRPC calls to the upstream Bluesky AppView.
"""
import os
import httpx
from fastapi import Request, Response
from src.lib.fastapi import app, logger

BLUESKY_APPVIEW_URL = os.getenv("BLUESKY_APPVIEW_URL", "https://api.bsky.app")

# Headers to forward from client to upstream
FORWARD_REQUEST_HEADERS = [
    "authorization",
    "accept",
    "accept-language",
    "content-type",
]

# Headers to forward from upstream to client
FORWARD_RESPONSE_HEADERS = [
    "content-type",
    "atproto-repo-rev",
    "atproto-content-labelers",
]


@app.api_route(
    "/xrpc/{method:path}",
    methods=["GET", "POST"],
    include_in_schema=False,
)
async def proxy_bsky_xrpc(method: str, request: Request):
    """Proxy app.bsky.* requests to Bluesky's AppView."""

    # Only proxy app.bsky.* methods
    if not method.startswith("app.bsky."):
        return Response(
            content='{"error":"MethodNotImplemented","message":"Method not found"}',
            status_code=501,
            media_type="application/json",
        )

    # Build upstream URL
    upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/{method}"

    # Forward query params
    if request.query_params:
        upstream_url += f"?{request.query_params}"

    # Build headers to forward
    headers = {}
    for header in FORWARD_REQUEST_HEADERS:
        if header in request.headers:
            headers[header] = request.headers[header]

    # Get request body for POST
    body = None
    if request.method == "POST":
        body = await request.body()

    logger.debug(f"Proxying {request.method} {method} to {upstream_url}")

    async with httpx.AsyncClient() as client:
        try:
            upstream_response = await client.request(
                method=request.method,
                url=upstream_url,
                headers=headers,
                content=body,
                timeout=30.0,
            )
        except httpx.RequestError as e:
            logger.error(f"Proxy error for {method}: {e}")
            return Response(
                content='{"error":"UpstreamError","message":"Failed to reach Bluesky AppView"}',
                status_code=502,
                media_type="application/json",
            )

    # Build response headers
    response_headers = {}
    for header in FORWARD_RESPONSE_HEADERS:
        if header in upstream_response.headers:
            response_headers[header] = upstream_response.headers[header]

    return Response(
        content=upstream_response.content,
        status_code=upstream_response.status_code,
        headers=response_headers,
        media_type=upstream_response.headers.get("content-type", "application/json"),
    )
