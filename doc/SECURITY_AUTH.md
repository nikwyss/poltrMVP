# Auth Security — Magic-Link Abuse Surface

Hardening for the passwordless (magic-link) auth flow against bots, email-bombing,
account enumeration, and cross-device code phishing. Keep current as controls change.

**Endpoints** (in [`routes/auth/__init__.py`](../services/appview/src/routes/auth/__init__.py)):

| Endpoint | Sends email? | Per-IP limit |
|----------|--------------|--------------|
| `start` | ✅ login **or** registration link (decided server-side) | 3/min + 25/hour + 40/day + 100/7days |
| `checkLink` | no (non-consuming preflight) | 20/min |
| `waitStatus` | no (polling) | 60/min |
| `verifyLogin` / `verifyRegistration` / `verifyShortCode` | no (consume token) | 10/min |

⚠️ All four windows are keyed on the **real client IP**. Behind a shared NAT
(mobile CGNAT, corporate/school proxy, public Wi-Fi) many users share one IP, so
the **daily (40) and weekly (100) caps are the ones most likely to lock out
legitimate clusters** during a referendum surge. The per-email (10/15min) and the
global breaker (500/hr) already bound abuse independently; if real users get
locked out, raise the day/week caps first. (`limits` has no `week` granularity →
expressed as `100 per 7 days`.)

`start` is the single email-sending entry point and the real abuse surface. Rate
limiting (per-IP **and** per-email) + the global breaker are the primary protection;
CAPTCHA would be a friction layer on top.

## Unified flow & cross-browser code (#007)

The **email carries only the magic link** — never the short code. The 6-char code
is shown **in-browser** and only when the link opens in a *different* browser than
the one that entered the email:

- `start` returns an `initiatorSecret`; the frontend stores its **SHA-256** in a
  `httpOnly` cookie (`poltr_auth_init`, 10 min) and the appview stores the same
  hash in the pending row's `initiator_id`.
- `/auth/verify` runs a **non-consuming** preflight (`checkLink`): if the cookie
  matches → *same browser* (show a confirm button); else → *different browser*,
  reveal the short code to be typed on the originating device (no direct-login
  button there).
- **Device binding** 🔒 — `verifyLogin` / `verifyRegistration` / `verifyShortCode`
  require the initiator cookie to **match** the pending row's `initiator_id`, so a
  login only completes in the browser that started it. A forwarded or leaked link
  therefore **cannot sign in on a stranger's device** — it only reveals a code to
  carry back to the originating device (which holds the cookie). The short-code
  check verifies the cookie **before** counting an attempt, so a wrong-device
  caller can't burn the code's 5-attempt budget. Legacy rows without
  `initiator_id` (predating the unified flow) are unbound. **Scope:** this closes
  link-leakage/forwarding, **not** full inbox compromise (an attacker who reads
  the inbox can initiate *and* complete on their own browser).
- **Anti-phishing:** the code page (`verify-client.tsx`) shows the target email +
  a warning ("if you didn't start this elsewhere, don't share this code") to blunt
  device-code phishing.
- **Token leak:** `/auth/verify` sets `Referrer-Policy: no-referrer` so the
  `?token=` cannot leak via `Referer`. Preflight is non-consuming, so unfurl/prefetch
  bots that GET the page don't burn the link.
- **Deanonymisation/Sybil** (Email↔DID linkage, DID-genesis timing, eID-gating) are
  a separate, higher-priority privacy workstream — out of scope here.

---

## Current controls

**Rate-limit key = real client IP** ✅ *(verified in prod 2026-06-09)*
All user traffic is proxied by the frontend, so the AppView would otherwise see
one IP (the frontend pod) for everyone. The proxy forwards the real browser IP in
`X-Poltr-Client-IP`, gated by the shared `APPVIEW_PROXY_SECRET`
(`X-Poltr-Proxy-Secret`); the AppView `key_func` (`_client_ip_key` in
[`core/fastapi.py`](../services/appview/src/core/fastapi.py)) trusts it only on a
constant-time secret match, else falls back to the connection IP. Forwarding done
in [`front/src/lib/appview-proxy.ts`](../services/frontend/src/lib/appview-proxy.ts)
(XRPC proxy + all `/api/auth/*` routes). uvicorn runs **without**
`--forwarded-allow-ips` (that would let direct callers spoof XFF).
Secret lives once in `appview-secrets`; frontend inherits it via `secretKeyRef`
in `frontend.yaml`.

**Per-email send cap** ✅ — `MAX_SENDS_PER_EMAIL = 10` per 15 min, checked before
sending. **Both** branches track `send_count`/`window_started_at` on their
(unique) row: registration since migration `003`, login since migration `011`.
Over the cap → neutral response, no send. In addition to (not instead of) the
per-IP limit. ⚠️ *Login originally counted `auth_pending_logins` rows in-window,
but the "one live code" collapse (below) deletes exactly those rows → the count
was pinned at ≤1 and the cap never fired. Fixed by moving login to the same
on-row counter as registration (migration `011`).*

**One live code per email** ✅ — both pending tables are `UNIQUE(email_hmac)` and
`start` **upserts** (`ON CONFLICT DO UPDATE`), so there is always exactly one live
row per email and the token/short-code rotate in place (resetting
`failed_attempts`). The 5-attempt brute-force cap therefore can't be multiplied by
re-requesting a link (which would otherwise mint a fresh code + counter each
time); the per-email window cap above bounds how often a new code can be requested
at all. (The login branch previously used DELETE-then-INSERT, which defeated the
row-count throttle — see the per-email cap note above.)

**No account enumeration** ✅ — `start` returns the **identical** neutral `200`
(plus the random `initiatorSecret`) whether the email is new or existing; the only
difference is *which* email goes out ("Welcome back" vs "new account"), visible
only to the real mailbox owner. The waiting screen wording is neutral
(`magicLink.sentTo`). Post-token endpoints still return `email_taken` — not a leak
(caller already controls the mailbox).

**Global hourly circuit breaker** ✅ — platform-wide cap on outbound auth emails
([`auth/auth_email_guard.py`](../services/appview/src/auth/auth_email_guard.py)),
the main defense against `start` being used as a distributed email-amplifier.
DB-backed tally (`auth_email_sends`, migration `004`; PII-free `id/purpose/created_at`,
pruned to 2h). Fails **open** on DB error.

| Env | Current (dev) | Code default | Action |
|-----|---------------|--------------|--------|
| `APPVIEW_AUTH_EMAIL_ALERT_PER_HOUR` | `40` | `150` | log warning, keep sending |
| `APPVIEW_AUTH_EMAIL_CAP_PER_HOUR` | `100` | `500` | refuse, neutral response |

**Short-code verify** ✅ — per-row `failed_attempts` cap (5); verify targets the
most-recent valid pending row and is **purpose-agnostic** (searches both pending
tables, so the waiting screen never learns login-vs-registration before the email).

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

## Guard-Parität: writer-first (autoritatives Gate ≠ AppView-Check)

Seit dem ATProto-nativen Modell schreibt die appview user-authored Records ins
**eigene User-Repo**; der **community-writer** promotet sie (mit Community-Creds) zum
autoritativen Community-Record. Daraus folgt das Sicherheits-Invariant:

> Die **AppView ist ein untrusted Client.** Wer ein eigenes PDS-Repo hat, kann jeden
> Record direkt schreiben — an der appview-API (samt Quota/Rate-Limit/PR-Checks)
> vorbei. Der **community-writer ist der Trust-Boundary**: jede Prüfung, die
> entscheidet ob ein Record *autoritativ wird*, muss dort sitzen.

Die zwei Schichten sind **asymmetrisch**, nicht spiegelgleich:

- **Writer = Boden.** Muss vollständig prüfen ([`acceptance.py`](../services/community-writer/src/atproto/acceptance.py): `_accept_argument` Quota, `_accept_response` PR-Authorization).
- **AppView = UX-Superset.** Schnelles Feedback (Status-Codes, `acceptedDraft`), Rate-Limit, Quota-*Reservierung* — braucht der Writer nicht.

| Drift-Richtung | Folge |
|---|---|
| Writer hinkt AppView nach (Check nur in der AppView) | **Sicherheitsloch** — Direkt-PDS-Bypass öffnet sich wieder. Die gefährliche Richtung. |
| Writer strenger als AppView | Beitrag „verschwindet" (im User-Repo, nie promotet). Schlechte UX, kein Sicherheitsproblem. |

**Regel:** neue autoritative Regel **zuerst im Writer**, optional in der AppView
spiegeln. Vergisst man die AppView, verliert man nur frühes Feedback (safe-by-default).

**Drift strukturell ausgeschlossen** — die must-match-Prädikate liegen in *je einem*
Artefakt, das beide Seiten nur aufrufen (statt nachzubauen):

- **Eligibility** → DB-View `auth.v_eligible_participants` (auch der JS-Indexer liest sie).
- **Quota-Caps + Advisory-Lock-Key** → [`content_quota.py`](../services/appview/src/core/content_quota.py) (`limits_for`, `lock_key`); im writer als byte-identischer Mirror unter `src/shared/` (manuell synchronisiert wie `pds_creds.py`).
- **PR-Submission-Authorization** → SQL-Funktion `app_response_gate(argument_uri, reviewer_did)` (db-setup.sql / migration `008`); `submit_review` mappt den Reason auf HTTP, `_accept_response` auf eine Queue-Rejection.

Bewusst **nicht** zentralisiert (durch dieses Prinzip + Cross-Ref-Kommentare gedeckt):
Vote-Payload-Validierung (kein DB-State) und reine AppView-UX (Rate-Limit, `acceptedDraft`).

---

## Open / deferred

**CAPTCHA (Cloudflare Turnstile)** ⬜ — deferred; circuit breaker is the
compensating control. Plan: `verify_turnstile()` before DB work on
`start` + widget on the login/register form. Decision pending
(Turnstile vs Friendly Captcha). Tokens are farmable → never replaces rate limiting.

**Per-IP contribution cap on the global budget** ⬜ — the breaker is a shared
bucket: enough coordinated IPs can fill it and lock all users out of *new* auth
for the hour (existing sessions unaffected; self-resets). The 3/min `start`
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



## Was CAPTCHA beim start wirklich bringt
Es erschwert automatisiertes Send-Spam (E-Mail-Bombing eines Opfers, Reputations-/Amplification-Angriff auf euren Mailversand). Aber:

Deine Per-IP-Limits (3/min·25/h·60/Tag·100/Woche) + Per-Email (10/15min) + globaler Breaker (500/h) decken den realistischen Single-Source-Missbrauch schon ab.
CAPTCHA-Tokens sind farmbar (Solver-Dienste, billig) → es ersetzt nie Rate-Limiting, es ist nur eine Reibungsschicht obendrauf. Steht so auch schon in eurer SECURITY_AUTH.md (dort als „deferred" mit dem Breaker als Kompensation).
Der eine Fall, wo es echt hilft
Verteilter Angriff (viele IPs), der den globalen Breaker füllt und damit echte Bürger:innen aussperrt — genau da beissen Per-IP-Limits nicht. Aber dafür gibt es eine nicht-CAPTCHA-Alternative, die in eurer TODO schon steht: ein Per-IP/Subnet-Contribution-Cap auf das globale Budget. Das löst den verteilten Fall ohne jede Nutzer-Reibung — ich würde das vor CAPTCHA bauen.

Falls doch CAPTCHA — dann so
Adaptiv, nicht immer an: Challenge nur zeigen, wenn ein Soft-Signal trippt (Breaker nähert sich der Alert-Schwelle, IP/Subnet über Soft-Limit). So bleibt der „ein Feld, kein Passwort"-Flow für 99 % frictionless — Reibung nur unter Last.
Privacy-first Anbieter: Friendly Captcha (EU/DE, GDPR, kein Tracking, Datensouveränität — passt zu eurem Apertus/Infomaniak-Ethos) > Cloudflare Turnstile (unsichtbar, privacy-schonend) ≫ Google reCAPTCHA (Tracking — für eine Anonymitäts-Plattform das Schlechteste). Jeder Drittanbieter sieht beim Auth-Schritt die IP + das Signal „hier loggt sich wer ein" → das ist genau der Korrelations-Touchpoint aus unserer Deanonymisierungs-Diskussion. Friendly Captcha hält das in der EU und trackerfrei.
Ehrliche Priorisierung
Deine grossen Risiken sind Deanonymisierung + Sybil (Email↔DID-Klartext, eID-Gating der Zahlen — auf 2027 vertagt). CAPTCHA adressiert davon nichts und könnte den Anonymitäts-Touchpoint sogar minim verschlechtern. Es bekämpft ein vergleichsweise kleines Risiko (Send-Spam), das deine Limits grösstenteils schon haben. Ich würde die Reibungs-/Privacy-„Kosten" lieber dort investieren.

Konkret: Lass es vorerst weg. Wenn du proaktiv etwas willst, bau den Per-IP-Contribution-Cap auf den Breaker (frictionless, löst den verteilten Fall). CAPTCHA erst, wenn ihr im Log echten verteilten Missbrauch seht — dann adaptiv + Friendly Captcha. Soll ich den Contribution-Cap skizzieren/implementieren?