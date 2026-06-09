# Auth Security — Magic-Link Abuse Surface

Hardening for the passwordless (magic-link + short-code) auth flow against bots,
email-bombing, and account enumeration. Keep current as controls change.

**Endpoints** (in [`routes/auth/__init__.py`](../services/appview/src/routes/auth/__init__.py)):

| Endpoint | Sends email? | Per-IP limit |
|----------|--------------|--------------|
| `sendMagicLink` | ✅ login link + code | 5/min |
| `register` | ✅ registration link + code | 3/min |
| `verifyLogin` / `verifyRegistration` / `verifyShortCode` | no (consume token) | 10/min |

The two email-sending endpoints are the real abuse surface. Rate limiting (per-IP
**and** per-email) + the global breaker are the primary protection; CAPTCHA would
be a friction layer on top.

---

## Current controls

**Rate-limit key = real client IP** ✅ *(verified in prod 2026-06-09)*
All user traffic is proxied by the frontend, so the AppView would otherwise see
one IP (the frontend pod) for everyone. The proxy forwards the real browser IP in
`X-Poltr-Client-IP`, gated by the shared `APPVIEW_PROXY_SECRET`
(`X-Poltr-Proxy-Secret`); the AppView `key_func` (`_client_ip_key` in
[`core/fastapi.py`](../services/appview/src/core/fastapi.py)) trusts it only on a
constant-time secret match, else falls back to the connection IP. Forwarding done
in [`front/src/lib/appview-proxy.ts`](../services/front/src/lib/appview-proxy.ts)
(XRPC proxy + all `/api/auth/*` routes). uvicorn runs **without**
`--forwarded-allow-ips` (that would let direct callers spoof XFF).
Secret lives once in `appview-secrets`; frontend inherits it via `secretKeyRef`
in `frontend.yaml`.

**Per-email send cap** ✅ — `MAX_SENDS_PER_EMAIL = 10` per 15 min, checked before
sending. Login counts `auth_pending_logins` rows in-window; registration tracks
`send_count`/`window_started_at` on its (unique) row (migration `003`). Over the
cap → neutral response, no send. In addition to (not instead of) the per-IP limit.

**No account enumeration** ✅ — `sendMagicLink` and `register` always return the
same neutral `200` regardless of account existence; email only sent on the valid
branch. "Check your email" screen uses conditional wording
(`magicLink.sentMagic` / `sentConfirmation` in `messages/*.json`). Post-token
endpoints still return `email_taken` — not a leak (caller already controls the
mailbox).

**Global hourly circuit breaker** ✅ — platform-wide cap on outbound auth emails
([`auth/auth_email_guard.py`](../services/appview/src/auth/auth_email_guard.py)),
the main defense against `register` being used as a distributed email-amplifier.
DB-backed tally (`auth_email_sends`, migration `004`; PII-free `id/purpose/created_at`,
pruned to 2h). Fails **open** on DB error.

| Env | Current (dev) | Code default | Action |
|-----|---------------|--------------|--------|
| `APPVIEW_AUTH_EMAIL_ALERT_PER_HOUR` | `40` | `150` | log warning, keep sending |
| `APPVIEW_AUTH_EMAIL_CAP_PER_HOUR` | `100` | `500` | refuse, neutral response |

**Short-code verify** ✅ — per-row `failed_attempts` cap (5); verify targets the
most-recent valid pending row (login table can hold several rows per email).

---

## Content-creation quotas (arguments & comments)

Separate abuse/quality control on the deliberation write endpoints
(`argument.create`, `comment.create`). Two caps **per (user, ballot)**, both
**append-only** (deletions do not refund):

| | Daily (rolling 24h) | Lifetime (per ballot) | Env (daily / ballot) |
|---|---|---|---|
| Arguments | 2 | 10 | `APPVIEW_ARGUMENT_DAILY_LIMIT` / `APPVIEW_ARGUMENT_BALLOT_LIMIT` |
| Comments | 10 | 50 | `APPVIEW_COMMENT_DAILY_LIMIT` / `APPVIEW_COMMENT_BALLOT_LIMIT` |

**Mechanism** ([`routes/deliberation/quota.py`](../services/appview/src/routes/deliberation/quota.py)).
Counts come from a synchronous ledger `app_content_creations`
(`did, kind, ballot_rkey, uri, created_at`; migration `006`, backfilled from
existing `app_arguments`/`app_comments`) — **not** the indexer-populated content
tables, which lag the firehose and would let a burst slip past. `reserve()` does
an atomic, advisory-locked (`pg_advisory_xact_lock` per user·kind·ballot)
count-then-insert before the PDS write; the slot is `release()`d if the write
fails. Over a cap → **`429 {error:"quota_exceeded", kind, scope, limit}`**.
Both creates also carry a per-IP `@limiter.limit` (6/min args, 20/min comments).

**Counts exposed**: DB (the ledger), API
(`GET app.ch.poltr.quota.get?ballot=<id>` → daily/ballot used+limit per kind),
and the frontend composer (pending — see below).

**Status**: backend live + verified (migration applied & backfilled). Defaults in
code equal the values above, so prod works without setting the env.
**Pending**: frontend display (usage in the argument/comment composer, disable at
cap, 429 handling, i18n).

---

## Open / deferred

**CAPTCHA (Cloudflare Turnstile)** ⬜ — deferred; circuit breaker is the
compensating control. Plan: `verify_turnstile()` before DB work on
`sendMagicLink`/`register` + widget on the login/register forms. Decision pending
(Turnstile vs Friendly Captcha). Tokens are farmable → never replaces rate limiting.

**Per-IP contribution cap on the global budget** ⬜ — the breaker is a shared
bucket: enough coordinated IPs can fill it and lock all users out of *new* auth
for the hour (existing sessions unaffected; self-resets). The 3/min `register`
limit means one IP can't trip it alone, but a per-IP/subnet contribution cap would
fully close it.

**Session-DID keying for authenticated writes** ⬜ — key write endpoints on the
session DID instead of IP (immune to IP sharing/rotation).

**Real alert channel** ⬜ — breaker "notify" is currently just a log line
(`WARNING` alert / `ERROR` cap); wire an email/Slack webhook.

---

## Operational notes

**Deploy ordering (gotcha).** `APPVIEW_PROXY_SECRET` must exist in the **live**
`appview-secrets` before the frontend rolls out — its `secretKeyRef` is
`Optional: false`, so a missing key → `CreateContainerConfigError`. Repo
`secrets.yaml` is not enough. Add it first
(`kubectl patch secret appview-secrets -n poltr --type merge -p '{"stringData":{"APPVIEW_PROXY_SECRET":"…"}}'`),
then restart appview (to load it) + frontend.

**Circuit-breaker tuning for production.** Dev values are deliberately tight (no
users to lock out; bound worst-case abuse). At launch, switch to observe-then-tune:
raise CAP high (~`2000`, effectively alert-only) for ~2 weeks, read the real peak
hour **P** from `AUTH-EMAIL ALERT` log lines (the table is pruned to 2h — not a
history source), then `CAP ≈ clamp(3×P, 500, 1000)`, `ALERT ≈ clamp(2×P, 100,
0.4×CAP)`. Keep CAP above the single-IP ceiling (180/hr). ⚠️ Too-low a cap during
a referendum surge locks out real citizens — err generous. Env-tunable; needs a
pod restart (read at startup).

**Rotate** the proxy secret to `openssl rand -hex 32` (single place: `appview-secrets`).
