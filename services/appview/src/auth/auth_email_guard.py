"""Global circuit breaker for outbound auth emails.

A platform-wide hourly limit on auth emails (login magic links + registration
confirmations), layered on top of the per-IP (slowapi) and per-email throttles.
Its job is to bound the blast radius of a distributed email-amplification attack
(many IPs, many distinct target addresses) that the other two layers cannot stop
on their own — capping cost and protecting SMTP sender reputation.

Two thresholds (both env-tunable, hourly window):
  * ALERT  — log a warning, keep sending.
  * CAP    — refuse new auth emails (caller returns a neutral response).

DB-backed (auth_email_sends) rather than in-memory so the count is correct
across replicas and survives restarts. See doc/SECURITY_AUTH.md #4.
"""

import os
import logging

import src.core.db as db

logger = logging.getLogger("appview.auth_email_guard")

# Hourly thresholds. Defaults chosen to sit well above normal peak traffic while
# bounding an attack; retune via env without a redeploy.
ALERT_PER_HOUR = int(os.getenv("APPVIEW_AUTH_EMAIL_ALERT_PER_HOUR", "150"))
CAP_PER_HOUR = int(os.getenv("APPVIEW_AUTH_EMAIL_CAP_PER_HOUR", "500"))


async def auth_email_capped() -> bool:
    """True if the global hourly cap is reached. Call BEFORE sending.

    On failure to read the count, fail open (return False) — the breaker is a
    safety net and must never block legitimate auth because of a transient DB
    hiccup; the per-IP / per-email limits still apply.
    """
    try:
        if db.pool is None:
            await db.init_pool()
        async with db.pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT count(*) FROM auth_email_sends WHERE created_at > now() - interval '1 hour'"
            )
    except Exception as e:
        logger.error("auth_email_capped check failed, failing open: %s", e)
        return False

    if count >= CAP_PER_HOUR:
        logger.error(
            "AUTH-EMAIL CIRCUIT BREAKER OPEN: %s auth emails in the last hour "
            ">= hard cap %s — refusing new auth emails.",
            count,
            CAP_PER_HOUR,
        )
        return True
    return False


async def record_auth_email_sent(purpose: str) -> None:
    """Record one sent auth email, prune old rows, and emit the alert if over
    the alert threshold. Call AFTER a successful send. Never raises."""
    try:
        if db.pool is None:
            await db.init_pool()
        async with db.pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO auth_email_sends (purpose) VALUES ($1)", purpose
            )
            # Keep the ledger tiny: only the last 2h is ever needed (1h window
            # + headroom). Cheap with the created_at index.
            await conn.execute(
                "DELETE FROM auth_email_sends WHERE created_at < now() - interval '2 hours'"
            )
            count = await conn.fetchval(
                "SELECT count(*) FROM auth_email_sends WHERE created_at > now() - interval '1 hour'"
            )
    except Exception as e:
        logger.error("record_auth_email_sent failed: %s", e)
        return

    if count >= ALERT_PER_HOUR:
        logger.warning(
            "AUTH-EMAIL ALERT: %s auth emails sent in the last hour "
            "(alert threshold %s, hard cap %s).",
            count,
            ALERT_PER_HOUR,
            CAP_PER_HOUR,
        )
