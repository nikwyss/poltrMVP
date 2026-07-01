# Peer Review

User-submitted arguments go through a community peer-review step before they reach the regular argument feed. This document describes the mechanism end-to-end: who gets invited, when, how the closure decision is made, and how to operate the system.

## Goal

For each user-submitted argument, collect votes from a small panel of randomly-selected community members and let the majority decide whether the argument is community-approved (`review_status='approved'`) or rejected (`review_status='rejected'`). Curated content (`source_type IN ('official','organization')`) bypasses peer review entirely.

The mechanism aims to make collusion expensive: even if a small clique tried to coordinate on pushing a specific argument through, the probability-based selection means roughly `1 / INVITE_PROBABILITY` times as many of them would need to act in concert to land on the panel.

## Bewertungs-Kriterien

Reviewer geben **ein Gesamturteil ja/nein** ab — *Soll dieses Argument in den Argumentenkatalog aufgenommen werden?* (= `vote` APPROVE/REJECT, Mehrheit entscheidet). Begleitend bewerten sie die **fünf offiziellen Kriterien** — **Stimmigkeit, Umgangston, Thematik, Fokus, Kein Duplikat** — pro Kriterium mit einem leichten Flag **ok/beanstandet** (kein 1–5-Rating). „Kein Duplikat" erscheint nur, wenn ein **Live-Duplikat-Check** (`app.ch.poltr.peerreview.duplicateCandidate`, frisch via Embedding) ein konkretes ähnliches Argument gleicher Position findet — bestätigtes Duplikat wählt „nein" vor (überschreibbar). Es sind **dieselben fünf**, die beim Verfassen bereits **automatisch** vorgeprüft werden (Composer „Einreichung vorbereiten"); die Stufe-1-LLM-Bewertung wird dem Reviewer bewusst **nicht** gezeigt (frisches Urteil, kein Anchoring). Definition + beide Stufen: **[ARGUMENT_CRITERIA.md](ARGUMENT_CRITERIA.md)**; konfigurierbar über `APPVIEW_PEER_REVIEW_CRITERIA` ([reviews.py](../services/appview/src/routes/deliberation/reviews.py)). Faktische Richtigkeit ist bewusst **kein** Kriterium (Civic-Speech).

## Lifecycle

Two parallel state surfaces:

- **`app_peerreviews.state`** — the *lifecycle* (`open` → `provisional_closed` → `closed`).
- **`app_arguments.review_status`** — the *outcome* (`preliminary` until the finaliser runs, then `approved` or `rejected`).

Quorum sets the **ceiling** on responses before the lifecycle flips from `open` to `provisional_closed`. The flip can happen earlier when the outcome is mathematically locked (one side can no longer be caught up — see [Closure](#closure--two-step)). Either way, quorum has no effect on how many invitations are issued.

```
┌────────────────────────────────────────────────────────────────────────┐
│ User submits argument                                                  │
│   → record on user PDS (app.ch.poltr.ballot.argument)                  │
│   → indexer writes app_arguments row + app_peerreviews row             │
│     (state = 'open', quorum captured from env at creation)             │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Other users make authenticated requests                                │
│   → auth middleware fires peer_review_assign hook (throttled 30 s)     │
│   → eligible candidates get probabilistically selected                 │
│   → invitation record (invited=true | false) on community PDS         │
│   No per-argument cap — invitations keep flowing until enough          │
│   responses arrive.                                                    │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Invited reviewer checks in (POST .review.checkIn)                      │
│   → grants submit-rights, even if quorum hits while they're typing     │
│   → typing fires .review.activity, sliding grace_until forward         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Reviewer submits app.ch.poltr.review.response                          │
│   → AppView validates: invited, checked in, state ≠ closed             │
│   → record on community PDS                                           │
│   → indexer indexes; flip state to provisional_closed if quorum        │
│     reached OR outcome mathematically locked, then open grace window   │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ During grace window (state = 'provisional_closed')                     │
│   → no new check-ins accepted                                          │
│   → already-checked-in reviewers can still submit                      │
│   → real typing slides grace_until = NOW() + GRACE_PERIOD              │
│   → review may overshoot (Q+1, Q+2, …) — accepted, more data is good   │
└────────────────────────────────────────────────────────────────────────┘
                                  │  grace_until < NOW(),
                                  │  next finaliser cron tick (1 / min)
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ state = 'closed', outcome written:                                     │
│   approvals > rejections → review_status = 'approved'                  │
│   tie / minority         → review_status = 'rejected'                  │
└────────────────────────────────────────────────────────────────────────┘
```

## Assignment: activity-triggered, not worker-polled

There is **no background worker** for reviewer selection. The check is triggered by user activity in the auth middleware:

| Trigger | Where |
|---|---|
| Every authenticated request (`verify_session_token`) | [services/appview/src/auth/middleware.py:90](../services/appview/src/auth/middleware.py#L90) |
| → `fire_and_forget(did)` | [peer_review_assign.py](../services/appview/src/arguments/peer_review_assign.py) |

The hook is fire-and-forget (`asyncio.create_task`), so the user's request never waits on it.

### Why activity-triggered

A worker-based design (the original implementation) had to repeatedly evaluate every active user against every preliminary argument on a fixed interval. Two practical problems for POLTR:

1. **Magic-link sessions are long-lived** — explicit logins are rare. A pure on-login hook would never fire for users who keep their cookie. Middleware-on-every-request catches all real activity.
2. **Worker work is wasted on inactive users** — slots assigned to users who never come back never get filled. Activity-driven assignment automatically self-limits to the engaged subset.

### Algorithm per hook call

```
def maybe_assign_reviews_for_user(did):
    if disabled or did is empty:        return
    if last_check[did] < 30s ago:       return       # throttle
    last_check[did] = now

    recent_active = COUNT(invitations WHERE invitee=did
                          AND invited=true
                          AND created_at > now - 24h)
    slots_left = DAILY_LIMIT - recent_active
    if slots_left <= 0:                 return       # daily cap reached

    candidates = SELECT user arguments WHERE
                   app_peerreviews.state = 'open'
                 AND author != did
                 AND no existing invitation for (argument, did)
                 ORDER BY created_at ASC
                 LIMIT 100

    for arg in candidates:
        if slots_left == 0:             break
        selected = random() <= INVITE_PROBABILITY
        write_invitation(arg, did, invited=selected)
        if selected:
            slots_left -= 1
```

Pool entries with `invited=false` are intentional: they record that this (argument, user) pair was already evaluated, so the user is never re-rolled for the same argument. Without this, the next hook call would consider the same argument again and could eventually land on an invitation purely by retry pressure — which would defeat the probabilistic anti-collusion property.

### Key properties

- **Idempotent**: deterministic `rkey = compose_review_rkey(argument_uri, did)` → second write to the same `(argument, user)` is rejected by the PDS before any commit is produced (`createRecord` only, no `putRecord`).
- **Quorum is *not* an invitation cap.** Quorum only gates the closure trigger (responses ≥ quorum → `provisional_closed`). Slow-to-respond reviews keep accumulating fresh invitations from newly-active users until enough actually respond. Invitation rate is bounded purely by `DAILY_LIMIT` (per user) and `INVITE_PROBABILITY` (per dice roll).
- **Bounded effort**: each hook call considers at most 100 candidates and writes at most `DAILY_LIMIT` active invitations (currently 3).
- **Throttled per user**: 30 s between hook executions for the same did, using an in-memory cache. Lost on pod restart, which is harmless — the next request just re-runs the hook once.

## Check-in

A reviewer must explicitly check in on a review **before** they can submit. Check-in is the contract that protects in-flight work from racing the closure decision.

| Endpoint | Behaviour |
|---|---|
| `POST /xrpc/app.ch.poltr.review.checkIn` | Required before showing the review form. Stamps `app_review_invitations.checked_in_at` if unset, refreshes `last_activity_at`. Returns `200 + state + quorum + graceUntil` on success; `403 not_invited` if no active invitation; `409 too_late` if `state='provisional_closed'` and the user wasn't already checked in; `409 closed` if `state='closed'`. |
| `POST /xrpc/app.ch.poltr.review.activity` | Called by the frontend on real `input`/`change` events (throttled). Refreshes `last_activity_at`. While `state='provisional_closed'`, also slides `grace_until = NOW() + GRACE_PERIOD`. Returns the fresh `graceUntil`. |
| `GET /xrpc/app.ch.poltr.review.status` | Returns `state`, `quorum`, `provisionalClosedAt`, `graceUntil`, `closedAt`, vote counts, and the caller's `checkedInAt` / `lastActivityAt`. |

Check-ins are unrestricted while `state='open'`; only `provisional_closed` refuses new check-ins. That's what gives previously-checked-in reviewers a guaranteed minimum window to finish.

## Submission

`POST /xrpc/app.ch.poltr.review.submit` ([reviews.py:351](../services/appview/src/routes/deliberation/reviews.py#L351)). The endpoint validates atomically (with `FOR UPDATE` on the peerreview row):

| Check | Failure response |
|---|---|
| `argumentUri`, `criteria` (nicht-leere Liste), valid `vote` present | `400 invalid_request` |
| `app_peerreviews` row exists | `404 not_found` |
| `state != 'closed'` | `409 review_closed` (with `closedAt` + `acceptedDraft` echo of the body) |
| Invitation exists with `invited=true` | `403 not_invited` |
| `checked_in_at IS NOT NULL` | `409 not_checked_in` |
| No prior response from this reviewer | `409 already_reviewed` |

If the review is `provisional_closed` but the reviewer was checked in *before* the flip, submit proceeds — their `checked_in_at` is already non-null. The `acceptedDraft` echo on `409 review_closed` lets the frontend show the user their work even when the server can't accept it.

The DB-state rows of that table (`no_peerreview` / `not_invited` / `review_closed` / `not_checked_in`, in that fixed priority) are **not** hand-coded here — they come from the SQL function `app_response_gate(argument_uri, reviewer_did)` (db-setup.sql / migration `008`), the single source of truth shared with the community-writer's `_accept_response`. So a self-signed response written **directly to the PDS** (bypassing this endpoint) is gated identically at promotion time. Only the vote-payload checks (`400`) and `already_reviewed` (`409`) stay endpoint-local. See *Guard-Parität: writer-first* in [SECURITY_AUTH.md](SECURITY_AUTH.md).

## Closure — two-step

### Step 1: per-response trigger (indexer)

[`checkReviewQuorum` in db.js](../services/indexer/src/db.js) runs after every indexed response. It reads `quorum` from the per-review `app_peerreviews.quorum` column (captured at row-creation from env default — see [Configuration](#configuration)), counts approvals/rejections backed by an active invitation, and flips the lifecycle to `provisional_closed` whenever any of three conditions holds:

| Trigger | Condition | Meaning |
|---|---|---|
| `quorum` | `total ≥ quorum` | Regular case — the configured number of responses has arrived |
| `locked_approve` | `approvals > rejections + remaining` | Even if every remaining invitee rejects, the approve side still wins |
| `locked_reject` | `rejections ≥ approvals + remaining` | Even if every remaining invitee approves, the best case is a tie (counts as reject) |

`remaining = max(0, quorum - total)`. At or beyond quorum, `remaining = 0` and the locked-conditions reduce to the regular at-quorum decision — one of them is always true, so the three conditions form a single coherent rule.

Worked examples for `quorum = 10`:

| Responses so far | A | R | remaining | Trigger? |
|---|---|---|---|---|
| `5R, 0A` | 0 | 5 | 5 | `locked_reject` — `5 ≥ 0+5` ✓ |
| `4R, 0A` | 0 | 4 | 6 | none — `4 < 0+6` |
| `6A, 0R` | 6 | 0 | 4 | `locked_approve` — `6 > 0+4` ✓ |
| `4A, 4R` | 4 | 4 | 2 | none — `4 < 4+2` and `4 < 4+2` |
| `5A, 5R` | 5 | 5 | 0 | `quorum` (and falls into `locked_reject`: `5 ≥ 5+0`) |

```sql
SELECT quorum FROM app_peerreviews
WHERE argument_uri = $1 AND state = 'open';

SELECT
  COUNT(*) FILTER (WHERE rr.vote = 'APPROVE') AS approvals,
  COUNT(*) FILTER (WHERE rr.vote = 'REJECT')  AS rejections,
  COUNT(*) AS total
FROM app_review_responses rr
JOIN app_review_invitations ri
  ON ri.argument_uri = rr.argument_uri
 AND ri.invitee_did  = rr.reviewer_did
 AND ri.invited      = true             -- only active invitations count
WHERE rr.argument_uri = $1;

-- if any trigger holds:
UPDATE app_peerreviews
   SET state                 = 'provisional_closed',
       provisional_closed_at = now(),
       grace_until           = now() + GRACE_PERIOD
 WHERE argument_uri = $1 AND state = 'open';
```

The `JOIN ... invited=true` is defense-in-depth: a stray response without a matching active invitation never sways the math. The `WHERE state='open'` on the UPDATE serialises concurrent closure-triggering submits — both write a response, both observe `state='open'`, and the database picks one as the winner of the lifecycle flip. Both responses still count; we may overshoot to Q+1, which is intentional and welcome.

**A "lock" is locked *at trigger time*, not forever.** Once the review is `provisional_closed`, no new check-ins join, but already-checked-in reviewers can still submit during the grace window — and their votes still count in the finaliser's outcome calculation. So a `locked_reject` triggered at `R=5/A=0` can in principle become an approve at the end if enough late approves arrive from reviewers who were already in the room. That's by design: we trigger as soon as the math closes, but never silence votes already in flight.

### Step 2: finaliser cron (every minute)

[`finalizeExpiredPeerReviews` in db.js](../services/indexer/src/db.js), triggered by the [`peerreview-finalize` cronjob](../infra/kube/cronjobs.yaml):

```sql
UPDATE app_peerreviews
   SET state = 'closed', closed_at = now()
 WHERE state = 'provisional_closed' AND grace_until < now()
 RETURNING argument_uri;

-- then per closed argument:
UPDATE app_arguments
   SET review_status = CASE WHEN approvals > rejections THEN 'approved' ELSE 'rejected' END
 WHERE uri = $1 AND review_status = 'preliminary';
```

Ties count as rejection — the proposal must earn its acceptance. The `review_status='preliminary'` guard on the outcome write makes the finaliser idempotent and never demotes a manually-set terminal state.

The cron is **not** a trigger because the transition is time-based, not event-based. It is **not** a worker because the work is sparse and stateless — a per-minute Kubernetes `CronJob` is the right granularity.

## Configuration

| Env var | Default | Where applied |
|---|---|---|
| `APPVIEW_PEER_REVIEW_ENABLED` | `false` | Master switch for the assignment hook. When false, no new invitations are written |
| `APPVIEW_PEER_REVIEW_QUORUM` | `10` | Default closure threshold for **new** peer reviews. Captured into `app_peerreviews.quorum` at row creation (indexer-side), so changing the env affects only future arguments — existing rows retain their captured value |
| `APPVIEW_PEER_REVIEW_DAILY_LIMIT` | `3` | Max active invitations a user can receive in any sliding 24 h window |
| `APPVIEW_PEER_REVIEW_INVITE_PROBABILITY` | `0.35` | Per-candidate dice roll. Lower → more anti-collusion friction, slower quorum convergence |
| `APPVIEW_PEER_REVIEW_HOOK_THROTTLE_SECONDS` | `30` | In-memory per-user throttle |
| `APPVIEW_PEER_REVIEW_GRACE_PERIOD_SECONDS` | `600` (10 min) | Initial grace window on `provisional_close` and per-activity extension |
| `APPVIEW_PEER_REVIEW_CRITERIA` | (5 defaults) | Die fünf offiziellen Kriterien (Stimmigkeit, Umgangston, Thematik, Fokus, Kein Duplikat) — identisch zur automatischen Vorprüfung. Siehe [ARGUMENT_CRITERIA.md](ARGUMENT_CRITERIA.md), [reviews.py:46](../services/appview/src/routes/deliberation/reviews.py#L46) |

Quorum is no longer a cross-service "must match" value — once captured per row it's authoritative, and both the per-response trigger and the candidate filter read it from the row. `APPVIEW_PEER_REVIEW_GRACE_PERIOD_SECONDS` is read by the indexer; the rest by AppView.

## Eligibility

Currently very permissive — only three structural constraints:

1. `argument.source_type = 'user'` (curated content skips peer review)
2. `argument.author_did != user.did` (you don't review your own argument)
3. No prior invitation exists for (argument, user), regardless of `invited` flag

Notably **not** enforced:

- eID verification status (any registered user qualifies)
- Ballot-specific eligibility (no canton/citizenship filter)
- Reputation / past review quality
- Cool-off period after rejecting / approving prior arguments

These could be added later as additional WHERE clauses in the candidate SELECT.

## Edge cases

### Race when user makes parallel requests

Two concurrent requests for the same user pass the `last_check` throttle if they hit within the same 30 s window after a previous check. Both then read the same `recent_active` count and may each write up to `slots_left` invitations. In the worst case the user ends up with `2 × DAILY_LIMIT` invitations on that one day. Accepted as low-probability and low-impact; the throttle dict-write happens before the SQL work, so the second request almost always sees a fresh timestamp and skips.

### Empty candidate set

If no `open` user-arguments are available at the moment of a hook call, the user simply doesn't get any invitations from that call. The throttle still updates, so the next opportunity is 30 s later.

### Pool exhaustion

If a user is rolled against every open argument and all rolls miss, they accumulate `invited=false` entries for everything. They won't be re-rolled — that's the dedup point of the pool. New arguments added afterwards trigger fresh rolls. With `INVITE_PROBABILITY=0.35` and 99 arguments, the probability of zero hits across the whole pool is `(0.65)^99 ≈ 6×10⁻¹⁹` — effectively impossible.

### Inactive users at argument creation

When a new argument enters the system, it has zero invitations. The assignment hook only fires when *some* user is active. With a steady trickle of activity, the argument quickly gets rolled against many users. No activity → the argument waits, which is the right behavior.

### Quorum-vs-Daily-Limit sizing

`DAILY_LIMIT × user_count × INVITE_PROBABILITY` should comfortably exceed `QUORUM × new_arguments_per_day`, otherwise quorum convergence is slow. Rule of thumb for current defaults (3, P=0.35, Q=10): you want at least ~10 actively-clicking users per new argument per day. Since invitations are not capped at quorum, the sizing only governs *time to closure*, not *whether* closure happens.

### Reviewer checks in and disappears

`last_activity_at` doesn't get refreshed. The finaliser still closes on the original `grace_until` — no infinite hang.

### Two simultaneous quorum-hitting submits

Both write a response, both observe `state = 'open'` and both attempt to flip it. The `WHERE state='open'` guard means whichever commits second is a no-op on state; both responses still count. We may overshoot to Q+1, which is intentional and welcome.

### Activity vs cron race

If a user types one millisecond before the cron tick, the cron may still close (its `grace_until < NOW()` snapshot was taken before the activity write). With 1-minute granularity and a 10-minute default grace, the window is vanishingly small. Accepted.

### Reviewer rejoins after closure

They see "review closed" and a read-only view of the outcome (via `GET .review.status`).

## Data model

| Table | Purpose | Where written | Closure-relevant filter |
|---|---|---|---|
| `app_peerreviews` | Per-argument lifecycle (state, quorum, grace_until) | Indexer (`upsertArgumentDb`, `checkReviewQuorum`, `finalizeExpiredPeerReviews`) | `WHERE state IN ('open', 'provisional_closed')` |
| `app_review_invitations` | Pool membership + active invitations + check-in tracking | AppView (assign hook, checkIn, activity), Indexer (firehose) | `WHERE invited=true` |
| `app_review_responses` | Reviewer's vote + criteria scores | AppView (submit endpoint), Indexer (firehose) | joined to `invitations` with `invited=true` |
| `app_arguments.review_status` | Terminal outcome (`preliminary` / `approved` / `rejected`) | Indexer (`finalizeExpiredPeerReviews`) | `WHERE review_status='preliminary'` on update |

`app_peerreviews` is keyed on `argument_uri` (1:1) and inserted in the same indexer transaction that inserts a user-submitted `app_arguments` row. Curated content has no peerreview row.

`(argument_uri, invitee_did)` is structurally unique on invitations because `compose_review_rkey` generates the same rkey from the same inputs — PDS's `createRecord` rejects duplicates before any commit is created. Same for `(argument_uri, reviewer_did)` on responses.

Check-in columns on `app_review_invitations`:

- `checked_in_at` — set on first `POST .review.checkIn`; immutable after that.
- `last_activity_at` — slides forward on each `POST .review.activity` (or re-check-in).

## Implementation pointers

| Concern | File |
|---|---|
| Activity-triggered assignment | [services/appview/src/arguments/peer_review_assign.py](../services/appview/src/arguments/peer_review_assign.py) |
| Middleware hook | [services/appview/src/auth/middleware.py:90](../services/appview/src/auth/middleware.py#L90) |
| Check-in / activity / submit / status endpoints | [services/appview/src/routes/deliberation/reviews.py](../services/appview/src/routes/deliberation/reviews.py) |
| Per-response quorum trigger | [services/indexer/src/db.js — `checkReviewQuorum`](../services/indexer/src/db.js) |
| Finaliser | [services/indexer/src/db.js — `finalizeExpiredPeerReviews`](../services/indexer/src/db.js), [main.js — `/peerreview-finalize` route](../services/indexer/src/main.js) |
| Finaliser cronjob | [infra/kube/cronjobs.yaml — `peerreview-finalize`](../infra/kube/cronjobs.yaml) |
| Migration | [infra/scripts/postgres/migrate-peer-review-grace.sql](../infra/scripts/postgres/migrate-peer-review-grace.sql) |
| Rkey composer | [services/appview/src/atproto/community.py — `compose_review_rkey`](../services/appview/src/atproto/community.py) |
| Lexicons | [lexicons/app/ch/poltr/review/invitation.json](../lexicons/app/ch/poltr/review/invitation.json), [response.json](../lexicons/app/ch/poltr/review/response.json), [note.json](../lexicons/app/ch/poltr/review/note.json) |

## Frontend integration

### Argument feed

Reads `review_status` on every argument and renders:

- `approved` → green check + 🎉 "Community-bestätigt" milestone
- `rejected` → small red dot + "Community-verworfen" milestone
- `preliminary` → no badge

Both milestone variants share `MilestoneActivityCard` in [services/frontend/src/app/(app)/ballot/[id]/arguments/feed/page.tsx](../services/frontend/src/app/(app)/ballot/[id]/arguments/feed/page.tsx). Rejected arguments are visible to everyone.

### Gutachten view (per-ballot list)

The arguments page has a fourth view (`ClipboardCheck` icon in the
[ViewToggle](../services/frontend/src/components/view-toggle.tsx)) that lists the
peer reviews of one ballot:
[services/frontend/src/app/(app)/ballot/[id]/arguments/gutachten/page.tsx](../services/frontend/src/app/(app)/ballot/[id]/arguments/gutachten/page.tsx).

Backed by **`GET app.ch.poltr.peerreview.list`** (in
[reviews.py](../services/appview/src/routes/deliberation/reviews.py)):

- Query: `ballotRkey` (= CMS ballot id / route `[id]`), `scope` = `mine` (default) | `all`.
- `scope=mine` → reviews the viewer is involved in (invited, responded, or author
  of the reviewed argument); `scope=all` → every peer review of the ballot.
- One list item = one argument under (or past) review, with vote counts and
  per-viewer flags (`viewerInvited`, `viewerCheckedInAt`, `viewerResponded`).
- Sorted server-side: current first (`state` `open` + `provisional_closed`), then
  `closed`; newest first within each group. The page just splits on `state === 'closed'`
  into the **Aktuell** / **Abgeschlossen** sections.

Clicking a row opens the `peerreview` overlay entry (id = argument AT-URI), rendered
by [PeerReviewDetail](../services/frontend/src/components/peer-review-detail.tsx). It
loads status + the viewer's pending invitations + criteria in parallel: if the viewer
has an **open invitation** for this argument it renders the shared
[ReviewForm](../services/frontend/src/components/review-form.tsx) (criteria ok/beanstandet,
conditional duplicate row, ja/nein verdict, free text); otherwise the read-only status
view (state + vote counts). The status view (incl. right after submitting) also shows the
viewer's **personal conviction rating** below the stats — the same `RelevanceRating`
(0–100) as the argument overview, wired to the shared argument cache (`ballotRkey` from the
route param, `argRkey` from the AT-URI). The same `ReviewForm` powers the `/review`
dashboard, and implements the full lifecycle flow described next.

### Review form

Implemented in [ReviewForm](../services/frontend/src/components/review-form.tsx) (client fns in [agent.ts](../services/frontend/src/lib/agent.ts): `checkInPeerreview`, `peerreviewActivity`):

- On form mount: call `checkIn`. `409 too_late` / `409 closed` → show "this review is closed" and skip the form. Other errors don't hard-block (the submit endpoint is the authoritative gate). The `/review` dashboard mounts `ReviewForm` **lazily** — each invitation is a collapsed card with a "Begutachten" button, so check-in fires only for the review the user actually opens (not for every visible invitation on page load). The overlay mounts it eagerly (a single, deliberately opened review).
- During typing/interaction: throttled `activity` ping (one per 30 s). The response refreshes `graceUntil` + `state` in component state.
- When `state === 'provisional_closed'`: a client-side countdown derived from `graceUntil` via a 1 s `setInterval`; reset whenever an `activity` response moves the deadline. No polling.
- localStorage backup (`poltr.review.draft.<argumentUri>`) of the in-progress draft (assessments + vote), restored on mount and cleared on successful submit — so even an unhandled `409 review_closed` doesn't lose the user's selections.

## History

| Date | Event |
|---|---|
| pre-2026-06 | Background worker (`services/appview/src/arguments/peer_review.py`) polled every 60 s, iterated preliminary arguments × active users, rolled probabilistic invitations. Indexer used early-termination quorum logic (`approvals > QUORUM/2` → approved; symmetric for rejected) |
| 2026-06-01 | Indexer closure logic rewritten to wait-for-QUORUM semantics. AppView submit endpoint added a late-vote guard (`409 quorum_reached`). Worker replaced by activity-triggered hook in auth middleware. `DAILY_LIMIT` introduced as per-user cap. Candidate query capped invitations per argument at QUORUM — same value as the closure threshold — which made reviews with non-responders get stuck forever once the cap was reached |
| 2026-06 | **Check-in & grace-period closure landed.** New `app_peerreviews` table holds the lifecycle (`open` → `provisional_closed` → `closed`). Per-argument invitation cap dropped, decoupling QUORUM from invitation count: QUORUM now means *only* "responses needed before provisional close". Submit endpoint rewritten around explicit check-in instead of late-vote-block. `peerreview-finalize` cronjob added to promote provisional closures and write the outcome on `app_arguments.review_status`. Quorum is now per-review (captured at argument creation), so changing `APPVIEW_PEER_REVIEW_QUORUM` only affects new arguments |
| 2026-06 | **Early-termination re-added** in `checkReviewQuorum`. In addition to "quorum reached", the indexer now also flips to `provisional_closed` when one side has accumulated more votes than the other can catch up with given the remaining slots. Safe under the check-in/grace model because already-checked-in reviewers still finish (and their late votes can still flip the outcome inside the grace window) |

### Old terminal statuses

The 9 terminal review statuses on ballot 663-0 (6 approved + 3 rejected) were assigned under the original early-termination logic. Some have fewer than `QUORUM=10` responses and would not be terminal under current rules. The `WHERE review_status='preliminary'` guard in the finaliser means they remain frozen as-is and are not re-evaluated.

A one-time backfill could reset those to `preliminary` so the new closure logic decides them — call as needed:

```sql
UPDATE app_arguments
SET review_status = 'preliminary'
WHERE review_status IN ('approved', 'rejected')
  AND ballot_rkey = '663.0'
  AND (
    SELECT COUNT(*) FROM app_review_responses rr
    JOIN app_review_invitations ri
      ON ri.argument_uri = rr.argument_uri
     AND ri.invitee_did  = rr.reviewer_did
     AND ri.invited      = true
    WHERE rr.argument_uri = app_arguments.uri
  ) < 10;

-- Also reopen the peerreview lifecycle so the new closure logic can run:
UPDATE app_peerreviews
SET state = 'open', provisional_closed_at = NULL, grace_until = NULL, closed_at = NULL
WHERE argument_uri IN (
  SELECT uri FROM app_arguments
  WHERE ballot_rkey = '663.0' AND review_status = 'preliminary'
);
```
