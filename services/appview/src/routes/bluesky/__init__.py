"""
Fallback proxy for unhandled XRPC requests.

Routes app.bsky.* to Bluesky AppView, everything else returns 501.
This should be the LAST router included in main.py.
"""

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

from src.lib.fastapi import logger
from src.config import (
    BLUESKY_APPVIEW_URL,
    FORWARD_REQUEST_HEADERS,
    FORWARD_RESPONSE_HEADERS,
)

router = APIRouter(tags=["proxy"])


# @router.api_route(
#     "/xrpc/{method:path}",
#     methods=["GET", "POST"],
#     include_in_schema=False,
# )
# async def fallback_proxy(method: str, request: Request):
#     """
#     Fallback proxy for unhandled XRPC methods.

#     - app.bsky.* -> Bluesky AppView
#     - Everything else -> 501 Not Implemented
#     """

#     # Only proxy app.bsky.* methods
#     if not method.startswith("app.bsky."):
#         return Response(
#             content=f'{{"error":"MethodNotImplemented","message":"Method {method} not implemented"}}',
#             status_code=501,
#             media_type="application/json",
#         )

#     # Build upstream URL
#     upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/{method}"

#     # Forward query params
#     if request.query_params:
#         upstream_url += f"?{request.query_params}"

#     # Build headers to forward
#     headers = {}
#     for header in FORWARD_REQUEST_HEADERS:
#         if header in request.headers:
#             headers[header] = request.headers[header]

#     # Get request body for POST
#     body = None
#     if request.method == "POST":
#         body = await request.body()

#     logger.debug(f"Proxying {request.method} {method} to Bluesky AppView")

#     async with httpx.AsyncClient() as client:
#         try:
#             upstream_response = await client.request(
#                 method=request.method,
#                 url=upstream_url,
#                 headers=headers,
#                 content=body,
#                 timeout=30.0,
#             )
#         except httpx.RequestError as e:
#             logger.error(f"Proxy error for {method}: {e}")
#             return Response(
#                 content='{"error":"UpstreamError","message":"Failed to reach Bluesky AppView"}',
#                 status_code=502,
#                 media_type="application/json",
#             )

#     # Build response headers
#     response_headers = {}
#     for header in FORWARD_RESPONSE_HEADERS:
#         if header in upstream_response.headers:
#             response_headers[header] = upstream_response.headers[header]

#     return Response(
#         content=upstream_response.content,
#         status_code=upstream_response.status_code,
#         headers=response_headers,
#         media_type=upstream_response.headers.get("content-type", "application/json"),
#     )
