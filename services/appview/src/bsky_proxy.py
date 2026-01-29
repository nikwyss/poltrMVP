"""
Proxy for Bluesky AppView requests.
Forwards app.bsky.* XRPC calls to the upstream Bluesky AppView.
Injects dummy birthDate for getPreferences to satisfy Bluesky age verification.
"""
import json
import os
import httpx
from fastapi import Request, Response
from src.lib.fastapi import app, logger

BLUESKY_APPVIEW_URL = os.getenv("BLUESKY_APPVIEW_URL", "https://api.bsky.app")
DUMMY_BIRTHDATE = "1970-01-01T00:00:00.000Z"

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


def inject_birthdate_preference(response_content: bytes) -> bytes:
    """Inject birthDate preference if not present in getPreferences response."""
    try:
        data = json.loads(response_content)
        preferences = data.get("preferences", [])

        # Check if birthDate already exists (in personalDetailsPref)
        has_birthdate = any(
            p.get("$type") == "app.bsky.actor.defs#personalDetailsPref" and p.get("birthDate")
            for p in preferences
        )

        if not has_birthdate:
            preferences.append({
                "$type": "app.bsky.actor.defs#personalDetailsPref",
                "birthDate": DUMMY_BIRTHDATE
            })
            data["preferences"] = preferences
            logger.debug("Injected dummy birthDate preference")

        return json.dumps(data).encode()
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to inject birthDate: {e}")
        return response_content


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

    # Inject birthDate for getPreferences if successful
    content = upstream_response.content
    if method == "app.bsky.actor.getPreferences" and upstream_response.status_code == 200:
        content = inject_birthdate_preference(content)

    return Response(
        content=content,
        status_code=upstream_response.status_code,
        headers=response_headers,
        media_type=upstream_response.headers.get("content-type", "application/json"),
    )
