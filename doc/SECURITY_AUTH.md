# Auth Security — Magic-Link Abuse Surface

Tracking doc for hardening the passwordless (magic-link + short-code) auth flow
against bots, email-bombing, and account enumeration. Keep this current as items
are fixed or new gaps are found.

**Affected endpoints** (all unauthenticated, all in
[`services/appview/src/routes/auth/__init__.py`](../services/appview/src/routes/auth/__init__.py)):

| Endpoint | Triggers email? | Notes |
|----------|-----------------|-------|
| `ch.poltr.auth.sendMagicLink` | ✅ | login link + short code |
| `ch.poltr.auth.register` | ✅ | registration link + short code |
| `ch.poltr.auth.verifyLogin` | no | consumes a token |
| `ch.poltr.auth.verifyRegistration` | no | consumes a token |
| `ch.poltr.auth.verifyShortCode` | no | has its own per-row `failed_attempts` cap |

The two email-sending endpoints are the real abuse surface: each call sends an
outbound email. CAPTCHA tokens are farmable, so rate limiting (per-IP **and**
per-email) is the primary protection; CAPTCHA is a friction layer on top.

---

## Status overview

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Rate limiter saw ingress IP, not client IP (limits were global) | High | ✅ Fixed |
| 2 | No per-email send cap (email-bombing) | High | ✅ Fixed |
| 3 | Account enumeration via distinct responses | Medium | ✅ Fixed |
| 4 | No human-verification (CAPTCHA) on email-sending endpoints | Medium | ⬜ Deferred — compensating controls in place (see below) |

---

## 1. Rate-limit key = real client IP (proxy-collapse + spoofing) ✅

**Problem.** Two compounding issues meant `slowapi`'s
`Limiter(key_func=get_remote_address)` ([`core/fastapi.py`](../services/appview/src/core/fastapi.py))
could not key on the real client:

1. **Proxy collapse.** All user traffic is proxied through the frontend's
   Next.js XRPC routes (`services/front/src/app/api/{xrpc,auth}/…`), which fetch
   the AppView server-side **without** forwarding the browser IP. So the AppView
   saw every proxied request as coming from the *frontend pod's* IP — one shared
   bucket for the entire user base. (A naive global default limit would have
   locked everyone out at once.)
2. **Spoofable XFF.** An interim fix started uvicorn with
   `--proxy-headers --forwarded-allow-ips='*'`, but that trusts `X-Forwarded-For`
   from *any* direct caller — so someone hitting `app.poltr.info` directly could
   rotate a fake XFF per request and evade the limit entirely.

**Fix (client-IP chain).**
- The frontend proxy forwards the real browser IP in a header
  `X-Poltr-Client-IP`, authenticated by a shared `APPVIEW_PROXY_SECRET`
  (`X-Poltr-Proxy-Secret`) — see [`front/src/lib/appview-proxy.ts`](../services/front/src/lib/appview-proxy.ts),
  applied in the XRPC proxy and all `/api/auth/*` proxy routes.
- The AppView limiter uses a custom `key_func` (`_client_ip_key` in
  [`core/fastapi.py`](../services/appview/src/core/fastapi.py)) that trusts that
  header **only** when the secret matches (constant-time compare), else falls
  back to `get_remote_address`.
- The spoofable `--forwarded-allow-ips='*'` was **reverted** (`Dockerfile`,
  `start.sh`). Direct/un-secreted callers are now keyed by the connection IP
  (the ingress peer) — spoof-proof, and an acceptable aggregate bucket since all
  legitimate traffic comes through the secreted proxy.

**Consequence.** Legitimate per-user traffic is now keyed by real browser IP, so
the per-endpoint limits (auth) and any future global default actually bind
per-client instead of collapsing. `APPVIEW_PROXY_SECRET` lives once in
`appview-secrets`; the frontend inherits it via a `secretKeyRef` to
`appview-secrets` in `frontend.yaml` (single source of truth, nothing to keep in
sync). If unset, keying safely degrades to the connection IP (old global-bucket
behaviour, no regression).

**Watch.** For *authenticated* write endpoints, consider keying on the session
DID instead of IP (immune to IP sharing/rotation) — see Tier-1 follow-up.

## 2. No per-email send cap — email-bombing ✅

**Problem.** Limits were per-IP only. An attacker rotating IPs could send
unlimited magic-link / registration emails to a chosen victim address.

**Fix.** Added a per-email window cap (`MAX_SENDS_PER_EMAIL = 10` per 15 min)
applied **before** sending:
- **Login** ([`magic_link_handler.py`](../services/appview/src/auth/magic_link_handler.py)):
  counts `auth_pending_logins` rows for the email created in the window (rows
  accumulate — table is not unique on email).
- **Registration** ([`routes/auth/__init__.py`](../services/appview/src/routes/auth/__init__.py)):
  the table is `UNIQUE(email)` (upsert), so a single row can't be counted —
  added `send_count` + `window_started_at` columns (migration
  `003_add_registration_send_throttle.sql`) tracked across the window.

When the cap is exceeded the endpoint returns the **same neutral response** as a
success (see #3) and sends nothing.

**Watch.** This is in addition to — not a replacement for — the per-IP limit.
Both layers must stay. Window/cap constants live next to the handlers.

## 3. Account enumeration ✅

**Problem.** Responses differed by account existence, letting anyone probe
whether a given email has a POLTR account (privacy-sensitive on a referendum
platform):
- `sendMagicLink` returned `404 user_not_found` for unknown emails.
- `register` returned `400 email_taken` for existing emails.

**Fix.** Both endpoints now always return the same neutral `200` message
regardless of account existence, and only actually send an email on the valid
branch. Frontends already navigate to the "link sent" screen on `200`, so the
UX is unchanged for legitimate users.

**Accepted tradeoff.** A user who mistypes / uses an unregistered email on the
login form is told "check your email" and waits in vain (and vice-versa on
register). This is the standard cost of enumeration opacity. The post-token
endpoints (`verifyRegistration`, `verifyShortCode`) still return `email_taken`,
but that is **not** an enumeration leak — the caller already proved control of
the mailbox by possessing the token/code.

**UX wording.** To avoid over-promising in the cases where no email is actually
sent, the "check your email" screen
([`magic-link-sent/page.tsx`](../services/front/src/app/\(auth\)/auth/magic-link-sent/page.tsx))
uses conditional phrasing (`magicLink.sentMagic` / `magicLink.sentConfirmation`
in `messages/*.json`): "If an account exists for this address, we've sent a
sign-in link to:" and "If this address isn't already registered, we've sent a
confirmation link to:". Note `fr`/`it`/`rm` message files still hold the German
strings (untranslated platform-wide, not specific to this change).

## 4. CAPTCHA / human verification — OPEN (deferred) ⬜

**Plan (not yet implemented).** Add **Cloudflare Turnstile** to the two
email-sending endpoints (`sendMagicLink`, `register`):
- Backend: a `verify_turnstile(token)` check (server-side `siteverify` call) run
  before the DB work; reject on failure.
- Frontend: Turnstile widget on the login ([`(auth)/page.tsx`](../services/front/src/app/\(auth\)/page.tsx))
  and register ([`(auth)/auth/register/page.tsx`](../services/front/src/app/\(auth\)/auth/register/page.tsx))
  forms; send the token in the request body.

Recommended over reCAPTCHA for privacy / Swiss-DSG fit (no ad-network tracking),
near-zero user friction. Requires a Cloudflare site key + secret (new secret in
`secrets.yaml.dist` + appview env). **Decision pending** — revisit with the user.

Why deferred / lower priority: items 1–3 are the actual exposure. Turnstile is a
friction layer; its tokens are farmable and do not replace rate limiting.

### Compensating control: global hourly circuit breaker ✅

With CAPTCHA deferred, the main residual risk is the `register` endpoint being
abused as a **distributed email-amplifier** (a botnet on many IPs, each under the
per-IP limit, sending confirmation emails to many distinct attacker-chosen
addresses → SMTP cost + sender-reputation damage). The per-email cap does not
stop this because each target address differs.

Mitigated by a platform-wide **hourly circuit breaker** on outbound auth emails
([`auth/auth_email_guard.py`](../services/appview/src/auth/auth_email_guard.py)),
applied to both `sendMagicLink` and `register`:

| Threshold | Dev-phase value | Action |
|-----------|-----------------|--------|
| `APPVIEW_AUTH_EMAIL_ALERT_PER_HOUR` | `40` | log a warning, keep sending |
| `APPVIEW_AUTH_EMAIL_CAP_PER_HOUR` | `100` | refuse new auth emails, neutral response |

> **These are deliberately *tight* dev-phase values, not production defaults.**
> During testing there are no real users to lock out, so the cap is set LOW to
> tightly bound worst-case abuse (~100/hr ≈ ~2.4k/day — a nuisance, not enough to
> get a fresh SMTP domain flagged) rather than to preserve availability. The
> code defaults if the env is unset remain `150` / `500`.
>
> **At production launch, switch to observe-then-tune:** raise CAP high
> (~`2000`, effectively alert-only) for ~2 weeks, read the real peak hour **P**
> from the `AUTH-EMAIL ALERT` log lines (the `auth_email_sends` table is pruned
> to 2h and is *not* a history source), then set `CAP ≈ clamp(3×P, 500, 1000)`
> and `ALERT ≈ clamp(2×P, 100, 0.4×CAP)`. Keep CAP well above the single-IP
> ceiling (180/hr from the 3/min `register` limit) so one IP can't trip it.

- DB-backed (`auth_email_sends` table, migration `004`) so the count is correct
  across replicas and survives restarts; rows older than 2h are pruned on insert.
- **PII-free by design.** The table is a pure tally — `id, purpose, created_at`,
  no email / IP / DID. The breaker only needs a platform-wide *count*; the
  "which address" question is already covered by the per-email throttle (#2).
  Nothing to leak or retain (data minimization), and rows are transient (2h).
- Window is **hourly**, not daily, so a burst is bounded per-hour and the limit
  resets quickly (a daily cap could be exhausted in minutes, then lock out real
  users all day).
- Fails **open** on a DB read error — the breaker is a safety net and must never
  block legitimate auth; per-IP / per-email limits still apply.
- The cap returns the same neutral response as success (no enumeration).

**Tuning.** Defaults sit well above expected peak but are guesses. Recommended:
run effectively alert-only for ~2 weeks (watch the `AUTH-EMAIL ALERT` log line
for the real peak hour), then set the hard cap to ~5× observed peak. Both values
are env-tunable without a redeploy. ⚠️ On a referendum surge a too-low cap would
lock out real citizens — err generous.

**Tradeoff — the cap is a shared bucket (weaponizable as auth-DoS).** A global
hourly cap denies the resource to everyone once filled. If a single source can
fill it, an attacker can lock all users out of *new* login/registration for the
rest of the hour (existing sessions are unaffected — 7-day cookies; the window
self-resets). To stop one host tripping it alone, the per-IP `register` limit was
lowered **10/min → 3/min** (180/hr — below the 500 cap), so tripping the breaker
now requires several coordinated IPs. `sendMagicLink` stays at 5/min and only
emails existing accounts. A still-stronger option (not yet done): a per-IP/subnet
*contribution* cap on the global budget so no single source can dominate it.

On balance the breaker is net-positive: email-reputation damage is lasting and
hard to recover; an hourly, self-resetting auth pause is not. Running the breaker
effectively **alert-only first** (generous cap) also keeps this DoS lever dormant
until the hard cap is tightened.

**Follow-up.** "Notify" is currently an elevated log line (`WARNING` on alert,
`ERROR` on cap). Wiring a real push channel (email/Slack webhook) on those log
events is a separate, easy improvement.
