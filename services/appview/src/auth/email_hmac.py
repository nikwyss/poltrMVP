"""Peppered HMAC for email addresses.

`auth_creds` never stores a plaintext email. It stores `email_hmac` =
HMAC-SHA256(pepper, normalized_email), hex-encoded. The pepper lives ONLY in the
appview process env (`APPVIEW_EMAIL_HMAC_PEPPER_B64`), never in the DB.

Why HMAC and not a plain hash: an email is a low-entropy, enumerable input, so a
plain SHA-256 in a leaked DB is trivially brute-forced against a wordlist of
candidate addresses. The secret pepper defeats that offline attack — an attacker
needs the DB *and* the appview secret. Why HMAC and not SHA256(pepper||email):
HMAC is the standard keyed construction (no length-extension footgun).

Properties / limits (see doc/SECURITY_AUTH.md):
- Deterministic: same email -> same digest, so login lookup and the UNIQUE
  constraint still work. This is pseudonymisation, not unlinkability — equal
  emails remain joinable.
- Plaintext still transits the pending tables (to actually send mail) and the
  PDS (createAccount keeps its own copy). Hashing auth_creds removes the
  long-term plaintext store, not every copy in the system.
- No rotation without plaintext: re-peppering existing rows is impossible (we
  don't keep the address). Rotation = users must re-verify their email.
"""

import base64
import hashlib
import hmac
import os

PEPPER_ENV = "APPVIEW_EMAIL_HMAC_PEPPER_B64"

# Minimum pepper length. HMAC accepts any key length, but a short pepper is the
# whole security here — demand at least 32 bytes of entropy. Generate with:
#   openssl rand -base64 32
_MIN_PEPPER_BYTES = 32


def _load_pepper() -> bytes:
    b64 = os.getenv(PEPPER_ENV)
    if not b64:
        raise ValueError(f"{PEPPER_ENV} environment variable is not set")
    pepper = base64.b64decode(b64)
    if len(pepper) < _MIN_PEPPER_BYTES:
        raise ValueError(f"{PEPPER_ENV} must decode to at least {_MIN_PEPPER_BYTES} bytes")
    return pepper


def normalize_email(email: str) -> str:
    """Canonicalise before hashing so case/whitespace variants collapse to one
    account. MUST stay in lockstep with the backfill script and any future
    importer, or digests won't match."""
    return email.strip().lower()


def email_digest(email: str) -> str:
    """Hex HMAC-SHA256(pepper, normalized_email). 64 chars — the lookup key in
    auth_creds.email_hmac."""
    norm = normalize_email(email).encode("utf-8")
    return hmac.new(_load_pepper(), norm, hashlib.sha256).hexdigest()


def mask_email(email: str | None) -> str:
    """Privacy-safe stand-in for log lines. The address AND its domain are
    deanonymizing (a rare domain alone can identify a user), so we never log any
    part of it — always a fixed mask. Use did/handle instead when an identifier
    is actually needed for debugging."""
    return "****"
