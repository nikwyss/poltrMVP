"""
Shared configuration for route handlers.
"""

import os

# Upstream services
BLUESKY_APPVIEW_URL = os.getenv("BLUESKY_APPVIEW_URL", "https://api.bsky.app")
DUMMY_BIRTHDATE = "1970-01-01T00:00:00.000Z"
PDS_URL = os.getenv("PDS_URL", "https://pds.poltr.info")
OZONE_URL = os.getenv("OZONE_URL", "https://ozone.poltr.info")

# Headers to forward from client to upstream
FORWARD_REQUEST_HEADERS = [
    "authorization",
    "accept",
    "accept-language",
    "content-type",
    "atproto-accept-labelers",
]

# Headers to forward from upstream to client
FORWARD_RESPONSE_HEADERS = [
    "content-type",
    "atproto-repo-rev",
    "atproto-content-labelers",
]
