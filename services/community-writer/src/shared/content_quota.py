"""Pure content-quota policy: per-(user, ballot) caps + the advisory-lock key.

Shared by the synchronous appview reserve() (src/routes/deliberation/quota.py)
and the authoritative community-writer gate (acceptance._enforce_argument_quota).
Both sides MUST agree on the caps and — critically — on lock_key(), so their
count+insert serialize on the same pg_advisory_xact_lock key space. Keeping this
logic in one place makes that agreement structural rather than disciplinary.

No FastAPI / DB / framework deps, so both services import it directly.

CANONICAL COPY: services/appview/src/core/content_quota.py
MIRROR (manual, keep byte-identical — same rule as pds_creds.py/languages.py):
       services/community-writer/src/shared/content_quota.py
"""

import hashlib
import os


def limits_for(kind: str) -> tuple[int, int]:
    """(daily, ballot) caps per (user, ballot) for 'argument' | 'comment'.

    Read from env at call time (same vars/defaults both sides use). Append-only
    semantics live in the callers; this only defines the numbers."""
    if kind == "argument":
        return (
            int(os.getenv("APPVIEW_ARGUMENT_DAILY_LIMIT", "2")),
            int(os.getenv("APPVIEW_ARGUMENT_BALLOT_LIMIT", "10")),
        )
    if kind == "comment":
        return (
            int(os.getenv("APPVIEW_COMMENT_DAILY_LIMIT", "10")),
            int(os.getenv("APPVIEW_COMMENT_BALLOT_LIMIT", "50")),
        )
    raise KeyError(f"unknown quota kind: {kind!r}")


def lock_key(did: str, kind: str, ballot_rkey: str) -> int:
    """Stable signed 64-bit key for pg_advisory_xact_lock, so the count+insert is
    serialized per (user, kind, ballot) across appview reserve() AND the writer's
    quota reconciliation. Both call this — do not reimplement the formula."""
    digest = hashlib.blake2b(
        f"{did}|{kind}|{ballot_rkey}".encode(), digest_size=8
    ).digest()
    return int.from_bytes(digest, "big", signed=True)
