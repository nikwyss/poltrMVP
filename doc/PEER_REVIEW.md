# Peer Review

User-submitted arguments go through a community peer-review step before they reach the regular argument feed. This document describes the mechanism end-to-end: who gets invited, when, how the closure decision is made, and how to operate the system.

## Goal

For each user-submitted argument, collect votes from a small panel of randomly-selected community members and let the majority decide whether the argument is community-approved (`review_status='approved'`) or rejected (`review_status='rejected'`). Curated content (`source_type IN ('official','organization')`) bypasses peer review entirely.

The mechanism aims to make collusion expensive: even if a small clique tried to coordinate on pushing a specific argument through, the probability-based selection means roughly `1 / INVITE_PROBABILITY` times as many of them would need to act in concert to land on the panel.

## Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│ User submits argument                                                 │
│   → record on user PDS (app.ch.poltr.ballot.argument)                 │
│   → indexer writes row, review_status = 'preliminary'                  │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Other users make authenticated requests                               │
│   → auth middleware fires peer_review_assign hook (throttled 30 s)    │
│   → eligible candidates get probabilistically selected                │
│   → invitation record (invited=true | false) on governance PDS         │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Invited reviewer submits app.ch.poltr.review.response                 │
│   → AppView validates: has invitation, no prior response, quorum not  │
│     yet reached                                                       │
│   → record on governance PDS                                           │
│   → indexer indexes + runs quorum check                                │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Once QUORUM valid responses are collected:                            │
│   majority → review_status = 'approved'                                │
│   tie / minority → review_status = 'rejected'                          │
└────────────────────────────────────────────────────────────────────────┘
```

## Assignment: activity-triggered, not worker-polled

There is **no background worker** for reviewer selection. The check is triggered by user activity in the auth middleware:

| Trigger | Where |
|---|---|
| Every authenticated request (`verify_session_token`) | [services/appview/src/auth/middleware.py:90](../services/appview/src/auth/middleware.py#L90) |
| → `fire_and_forget(did)` | [peer_review_assign.py](../services/appview/src/arguments/peer_review_assign.py) |

The hook is fire-and-forget (`asyncio.create_task`), so the user's request never waits on it.

### Why activity-triggered instead of worker-polled

A worker-based design (the previous implementation) had to repeatedly evaluate every active user against every preliminary argument on a fixed interval. This had two practical problems for POLTR:

1. **Magic-link sessions are long-lived** — explicit logins are rare. A pure on-login hook would never fire for users who keep their cookie. Middleware-on-every-request catches all real activity, login or not.
2. **Worker work is wasted on inactive users** — slots assigned to users who never come back never get filled. Activity-driven assignment automatically self-limits to the engaged subset of the user base.

The previous worker file (`services/appview/src/arguments/peer_review.py`) was deleted. See [History](#history).

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

    candidates = SELECT preliminary arguments WHERE
                   source_type = 'user'
                 AND author != did
                 AND no existing invitation for (argument, did)
                 AND argument has < QUORUM active invitations
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
- **Quorum-aware**: candidate query excludes arguments that already have `QUORUM` active invitations.
- **Bounded effort**: each hook call considers at most 100 candidates and writes at most `DAILY_LIMIT` active invitations (currently 3).
- **Throttled per user**: 30 s between hook executions for the same did, using an in-memory cache. Lost on pod restart, which is harmless — the next request just re-runs the hook once.

## Submission

Reviewers submit through `POST /xrpc/app.ch.poltr.review.submit` ([reviews.py:124](../services/appview/src/routes/deliberation/reviews.py#L124)). The endpoint validates:

| Check | Failure response |
|---|---|
| `argumentUri`, `criteria`, valid `vote` present | `400 invalid_request` |
| `justification` present if `vote='REJECT'` | `400 invalid_request` |
| Invitation exists with `invited=true` for this (argument, reviewer) | `403 not_invited` |
| No prior response from this reviewer | `409 already_reviewed` |
| `QUORUM` valid responses haven't already been collected | `409 quorum_reached` |

The last check is critical: it closes the ballot at submit-time, mirroring the indexer's closure semantics. Even if a late vote slipped past the AppView (e.g. a direct PDS write bypassing AppView), the indexer's `WHERE review_status='preliminary'` guard prevents it from flipping a terminal status.

## Closure

Located in [indexer/src/db.js::checkReviewQuorum](../services/indexer/src/db.js):

```sql
SELECT
  COUNT(*) FILTER (WHERE vote='APPROVE') AS approvals,
  COUNT(*) FILTER (WHERE vote='REJECT')  AS rejections,
  COUNT(*)                               AS total
FROM app_review_responses rr
JOIN app_review_invitations ri
  ON ri.argument_uri = rr.argument_uri
 AND ri.invitee_did  = rr.reviewer_did
 AND ri.invited      = true               -- only active invitations count
WHERE rr.argument_uri = $1
```

Decision:

| Condition | Result |
|---|---|
| `total < QUORUM` | stay `preliminary` |
| `total = QUORUM` and `approvals > rejections` | `approved` |
| `total = QUORUM` and `approvals ≤ rejections` (incl. tie) | `rejected` |

Ties count as rejection — the proposal must earn its acceptance.

The `JOIN ... invited=true` is defense-in-depth: a stray response without a matching active invitation never sways the quorum.

## Configuration

| Env var | Default | Where applied |
|---|---|---|
| `APPVIEW_PEER_REVIEW_ENABLED` | `false` | Master switch for the assignment hook. When false, no new invitations are written |
| `APPVIEW_PEER_REVIEW_QUORUM` | `10` | Both: candidate filter ("< QUORUM active invitations") and closure threshold |
| `APPVIEW_PEER_REVIEW_DAILY_LIMIT` | `3` | Max active invitations a user can receive in any sliding 24 h window |
| `APPVIEW_PEER_REVIEW_INVITE_PROBABILITY` | `0.35` | Per-candidate dice roll. Lower → more anti-collusion friction, slower quorum convergence |
| `APPVIEW_PEER_REVIEW_HOOK_THROTTLE_SECONDS` | `30` | In-memory per-user throttle |

`APPVIEW_PEER_REVIEW_QUORUM` is read by **two services** (AppView and Indexer). They must be set consistently in both. The indexer reads it from `process.env`, the AppView from `os.getenv`; both default to 10.

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

Two concurrent requests for the same user pass the `last_check` throttle if they hit within the same 30 s window after a previous check. Both then read the same `recent_active` count and may each write up to `slots_left` invitations. In the worst case the user ends up with `2 × DAILY_LIMIT` invitations on that one day. Accepted as low-probability and low-impact; the throttle dict-write happens before the SQL work, so the second request almost always sees a fresh timestamp and skips. If it ever becomes an issue, an advisory lock on `(did,)` would close it.

### Empty candidate set

If no preliminary user-arguments are open at the moment of a hook call, the user simply doesn't get any invitations from that call. The throttle still updates, so the next opportunity is 30 s later. With user activity throughout the day this becomes effectively "checked many times per day", so they get assigned promptly once a new argument enters the system.

### Pool exhaustion

If a user is rolled against every open argument and all rolls miss, they accumulate `invited=false` entries for everything. They won't be re-rolled — that's the dedup point of the pool. New arguments added afterwards will trigger fresh rolls. With `INVITE_PROBABILITY=0.35` and 99 arguments, the probability of zero hits across the whole pool is `(0.65)^99 ≈ 6×10⁻¹⁹` — effectively impossible.

### Inactive users at the time of argument creation

When a new argument enters the system, it has zero invitations. The assignment hook only fires when *some* user is active. If a steady trickle of activity exists across the user base, the argument will quickly get rolled against many users. If no one is active for hours, the argument waits — which is the right behavior (no point assigning slots to users who aren't there).

### Quorum-vs-Daily-Limit interaction

`DAILY_LIMIT × user_count × INVITE_PROBABILITY` should comfortably exceed `QUORUM × new_arguments_per_day`. Otherwise some arguments will never reach quorum. Rule of thumb for current defaults (3, P=0.35, Q=10): you want at least ~10 actively-clicking users per new argument per day.

## Data model

| Table | Purpose | Where written | Closure-relevant filter |
|---|---|---|---|
| `app_review_invitations` | Tracks pool membership + active invitations | AppView (assign hook), Indexer (firehose) | `WHERE invited=true` |
| `app_review_responses` | Reviewer's vote + criteria scores | AppView (submit endpoint), Indexer (firehose) | joined to `invitations` with `invited=true` |
| `app_arguments.review_status` | Terminal state | Indexer (`checkReviewQuorum`) | `WHERE review_status='preliminary'` on update |

`(argument_uri, invitee_did)` is structurally unique because `compose_review_rkey` generates the same rkey from the same inputs — PDS's `createRecord` rejects duplicates before any commit is created.

Same for `(argument_uri, reviewer_did)` on responses.

## Implementation pointers

| Concern | File |
|---|---|
| Activity-triggered assignment | [services/appview/src/arguments/peer_review_assign.py](../services/appview/src/arguments/peer_review_assign.py) |
| Middleware hook | [services/appview/src/auth/middleware.py:90](../services/appview/src/auth/middleware.py#L90) |
| Submit endpoint + late-vote block | [services/appview/src/routes/deliberation/reviews.py:124](../services/appview/src/routes/deliberation/reviews.py#L124) |
| Quorum closure | [services/indexer/src/db.js — `checkReviewQuorum`](../services/indexer/src/db.js) |
| Rkey composer | [services/appview/src/atproto/governance.py — `compose_review_rkey`](../services/appview/src/atproto/governance.py) |
| Lexicons | [lexicons/app/ch/poltr/review/invitation.json](../lexicons/app/ch/poltr/review/invitation.json), [response.json](../lexicons/app/ch/poltr/review/response.json), [note.json](../lexicons/app/ch/poltr/review/note.json) |
| Listing the user's open reviews (read endpoint) | [services/appview/src/routes/deliberation/reviews.py](../services/appview/src/routes/deliberation/reviews.py) |

## Frontend integration

The argument feed reads `review_status` on every argument and renders:

- `approved` → green check + 🎉 "Community-bestätigt" milestone
- `rejected` → small red dot + "Community-verworfen" milestone
- `preliminary` → no badge

Both milestone variants share `MilestoneActivityCard` in [services/front/src/app/(app)/ballot/[id]/arguments/feed/page.tsx](../services/front/src/app/(app)/ballot/[id]/arguments/feed/page.tsx). Rejected arguments are visible to everyone — the previous "hide rejected from non-authors" filter was removed.

## History

| Date | Event |
|---|---|
| pre-2026-06 | Background worker (`services/appview/src/arguments/peer_review.py`) polled every 60 s, iterated preliminary arguments × active users, rolled probabilistic invitations. Indexer used early-termination quorum logic (`approvals > QUORUM/2` → approved; symmetric for rejected) |
| 2026-06-01 | Indexer closure logic rewritten to wait-for-QUORUM semantics. AppView submit endpoint added late-vote guard. Worker replaced by activity-triggered hook in auth middleware. `DAILY_LIMIT` introduced as per-user cap |

### Migration note

The 9 terminal review statuses on ballot 663-0 (6 approved + 3 rejected) were assigned under the old early-termination logic. Some of them have fewer than `QUORUM=10` responses and would not be terminal under current rules. The `WHERE review_status='preliminary'` filter in `checkReviewQuorum` means they remain frozen as-is and are not re-evaluated.

A one-time backfill could reset those to `preliminary` so the new closure logic decides them — call this as needed:

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
```
