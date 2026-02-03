"""
app.bsky.actor.* endpoints

Handles actor/profile related operations with Ozone label augmentation.
"""

import json
import httpx
from fastapi import APIRouter, Request
from fastapi.responses import Response

from src.lib.fastapi import logger
from src.config import (
    BLUESKY_APPVIEW_URL,
    OZONE_URL,
    FORWARD_REQUEST_HEADERS,
    FORWARD_RESPONSE_HEADERS,
)

router = APIRouter(prefix="/xrpc", tags=["actor"])

DUMMY_BIRTHDATE = "1990-01-01"


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


# -----------------------------------------------------------------------------
# app.bsky.actor.getProfile
# -----------------------------------------------------------------------------


@router.get("/app.bsky.actor.getProfile")
async def get_profile(request: Request):
    """
    Get actor profile, augmented with Ozone moderation labels.
    Fetches profile from Bluesky AppView and merges labels from Ozone.
    """
    actor = request.query_params.get("actor")
    if not actor:
        return Response(
            content='{"error":"InvalidRequest","message":"actor parameter is required"}',
            status_code=400,
            media_type="application/json",
        )

    upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/app.bsky.actor.getProfile?actor={actor}"
    headers = _forward_headers(request)

    logger.debug(f"Fetching profile for {actor}")

    async with httpx.AsyncClient() as client:
        try:
            profile_response = await client.get(
                upstream_url, headers=headers, timeout=30.0
            )
        except httpx.RequestError as e:
            logger.error(f"Error fetching profile for {actor}: {e}")
            return Response(
                content='{"error":"UpstreamError","message":"Failed to reach upstream AppView"}',
                status_code=502,
                media_type="application/json",
            )

        if profile_response.status_code != 200:
            return Response(
                content=profile_response.content,
                status_code=profile_response.status_code,
                media_type=profile_response.headers.get(
                    "content-type", "application/json"
                ),
            )

        profile_data = profile_response.json()

        # Fetch labels from Ozone
        try:
            ozone_url = f"{OZONE_URL}/xrpc/tools.ozone.moderation.getRepo?did={profile_data.get('did', actor)}"
            ozone_response = await client.get(ozone_url, headers=headers, timeout=10.0)

            if ozone_response.status_code == 200:
                ozone_data = ozone_response.json()
                ozone_labels = ozone_data.get("labels", [])

                if ozone_labels:
                    existing_labels = profile_data.get("labels", [])
                    existing_label_ids = {
                        (l.get("src"), l.get("val")) for l in existing_labels
                    }
                    for label in ozone_labels:
                        label_id = (label.get("src"), label.get("val"))
                        if label_id not in existing_label_ids:
                            existing_labels.append(label)

                    profile_data["labels"] = existing_labels
                    logger.debug(
                        f"Augmented profile for {actor} with {len(ozone_labels)} Ozone labels"
                    )
        except httpx.RequestError as e:
            logger.warning(f"Failed to fetch Ozone labels for {actor}: {e}")
        except Exception as e:
            logger.warning(f"Error processing Ozone labels for {actor}: {e}")

    return Response(
        content=json.dumps(profile_data),
        status_code=200,
        headers=_response_headers(profile_response),
        media_type="application/json",
    )


# -----------------------------------------------------------------------------
# app.bsky.actor.getPreferences
# -----------------------------------------------------------------------------


def _inject_birthdate_preference(response_content: bytes) -> bytes:
    """Inject birthDate preference if not present. Required for Bluesky age verification."""
    try:
        data = json.loads(response_content)
        preferences = data.get("preferences", [])

        has_birthdate = any(
            p.get("$type") == "app.bsky.actor.defs#personalDetailsPref"
            and p.get("birthDate")
            for p in preferences
        )

        if not has_birthdate:
            preferences.append(
                {
                    "$type": "app.bsky.actor.defs#personalDetailsPref",
                    "birthDate": DUMMY_BIRTHDATE,
                }
            )
            data["preferences"] = preferences
            logger.debug("Injected dummy birthDate preference")

        return json.dumps(data).encode()
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to inject birthDate: {e}")
        return response_content


@router.get("/app.bsky.actor.getPreferences")
async def get_preferences(request: Request):
    """Proxy app.bsky.actor.getPreferences with birthDate injection."""

    upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/app.bsky.actor.getPreferences"
    if request.query_params:
        upstream_url += f"?{request.query_params}"

    headers = _forward_headers(request)

    async with httpx.AsyncClient() as client:
        try:
            upstream_response = await client.get(
                url=upstream_url, headers=headers, timeout=30.0
            )
        except httpx.RequestError as e:
            logger.error(f"Proxy error for getPreferences: {e}")
            return Response(
                content='{"error":"UpstreamError","message":"Failed to reach upstream AppView"}',
                status_code=502,
                media_type="application/json",
            )

    content = upstream_response.content
    if upstream_response.status_code == 200:
        content = _inject_birthdate_preference(content)

    return Response(
        content=content,
        status_code=upstream_response.status_code,
        headers=_response_headers(upstream_response),
        media_type=upstream_response.headers.get("content-type", "application/json"),
    )


# -----------------------------------------------------------------------------
# app.bsky.actor.getProfiles
# -----------------------------------------------------------------------------


@router.get("/app.bsky.actor.getProfiles")
async def get_profiles(request: Request):
    """Get multiple actor profiles."""
    # TODO: Implement with label augmentation
    # For now, proxy to upstream
    upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/app.bsky.actor.getProfiles"
    if request.query_params:
        upstream_url += f"?{request.query_params}"

    headers = _forward_headers(request)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(upstream_url, headers=headers, timeout=30.0)
        except httpx.RequestError as e:
            logger.error(f"Error fetching profiles: {e}")
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
# app.bsky.actor.searchActors
# -----------------------------------------------------------------------------


@router.get("/app.bsky.actor.searchActors")
async def search_actors(request: Request):
    """Search for actors."""
    # TODO: Implement local search
    # For now, proxy to upstream
    upstream_url = f"{BLUESKY_APPVIEW_URL}/xrpc/app.bsky.actor.searchActors"
    if request.query_params:
        upstream_url += f"?{request.query_params}"

    headers = _forward_headers(request)

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(upstream_url, headers=headers, timeout=30.0)
        except httpx.RequestError as e:
            logger.error(f"Error searching actors: {e}")
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
