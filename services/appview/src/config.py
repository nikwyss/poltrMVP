"""
Shared configuration for route handlers.
"""

import os

# Upstream services
BLUESKY_APPVIEW_URL = os.getenv("BLUESKY_APPVIEW_URL", "https://api.bsky.app")
DUMMY_BIRTHDATE = "1970-01-01T00:00:00.000Z"
PROFILE_BIO_TEMPLATE = (
    "Dies ist ein User-Account von poltr.ch\u2009—\u2009dem digitalen Raum"
    " für Schweizer Volksbstimmungen. Das Pseudonym leitet sich"
    " vom Berg '{mountainFullname}' ({height:.0f}m, {canton}) ab."
)
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
