"""Typed PDS errors with categorization.

Lives in its own module to avoid circular imports: it is imported by
`atproto_api.py`, `governance.py` (which raise it) and `core/fastapi.py`
(which registers the shared handler).

The categorization maps the PDS's own XRPC error responses (and transport
errors) to a small set of client-facing categories with stable machine codes.
The raw PDS text and the user's DID go only into `log_detail` (server-side
logs) — never into the client-facing response.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

import httpx


class PDSErrorCategory(str, Enum):
    AUTH_REQUIRED = "auth_required"      # -> HTTP 401 (re-auth needed)
    PDS_UNAVAILABLE = "pds_unavailable"  # -> HTTP 503 + Retry-After (transient/infra)
    INVALID_REQUEST = "invalid_request"  # -> HTTP 400 (bad input the PDS rejected)
    INTERNAL = "internal"                # -> HTTP 500 (last resort)


# category -> client-facing HTTP status
_HTTP_STATUS = {
    PDSErrorCategory.AUTH_REQUIRED: 401,
    PDSErrorCategory.PDS_UNAVAILABLE: 503,
    PDSErrorCategory.INVALID_REQUEST: 400,
    PDSErrorCategory.INTERNAL: 500,
}


class PDSError(Exception):
    """A categorized PDS failure. Raised by the atproto helpers, serialized by
    the shared FastAPI handler in `core/fastapi.py`."""

    def __init__(
        self,
        category: PDSErrorCategory,
        *,
        code: Optional[str] = None,
        log_detail: str = "",
        retry_after: Optional[int] = None,
    ):
        self.category = category
        self.http_status = _HTTP_STATUS[category]
        # Stable machine code returned to clients (defaults to the category value).
        self.code = code or category.value
        # Full diagnostic detail — SERVER-SIDE LOGS ONLY, never sent to clients.
        self.log_detail = log_detail
        # Seconds for a Retry-After header (only meaningful for PDS_UNAVAILABLE).
        self.retry_after = retry_after
        super().__init__(self.code)


# PDS XRPC error strings that indicate a token/session/auth problem.
_AUTH_ERRORS = {
    "ExpiredToken",
    "InvalidToken",
    "AuthenticationRequired",
    "AuthMissing",
    "AccountTakedown",
    "AccountDeactivated",
}

# PDS XRPC error strings for malformed/rejected input.
_INVALID_ERRORS = {
    "InvalidRequest",
    "RecordNotFound",
    "InvalidSwap",
}


def from_response(
    resp: httpx.Response, *, op: str, did: Optional[str] = None
) -> PDSError:
    """Map a non-2xx PDS XRPC response to a categorized PDSError."""
    pds_error = None
    pds_msg = ""
    try:
        body = resp.json()
        pds_error = body.get("error")
        pds_msg = body.get("message", "")
    except Exception:
        pds_msg = resp.text

    detail = (
        f"op={op} did={did} status={resp.status_code} "
        f"error={pds_error} msg={pds_msg!r}"
    )

    # Auth / session problems.
    if resp.status_code in (401, 403) or pds_error in _AUTH_ERRORS:
        return PDSError(PDSErrorCategory.AUTH_REQUIRED, log_detail=detail)

    # Transient / infrastructure (PDS 5xx — incl. a full-disk PDS returning
    # InternalServerError on createSession).
    if resp.status_code >= 500:
        return PDSError(
            PDSErrorCategory.PDS_UNAVAILABLE, log_detail=detail, retry_after=30
        )

    # Bad input the PDS rejected.
    if resp.status_code == 400 or pds_error in _INVALID_ERRORS:
        return PDSError(PDSErrorCategory.INVALID_REQUEST, log_detail=detail)

    return PDSError(PDSErrorCategory.INTERNAL, log_detail=detail)


def from_network_error(
    exc: httpx.RequestError, *, op: str, did: Optional[str] = None
) -> PDSError:
    """Map a transport-level failure (connection refused, timeout, …) to a
    transient PDSError."""
    return PDSError(
        PDSErrorCategory.PDS_UNAVAILABLE,
        log_detail=f"op={op} did={did} network_error={exc!r}",
        retry_after=30,
    )
