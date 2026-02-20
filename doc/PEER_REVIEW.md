# Peer-Review of Arguments

Peer-review is the quality assurance mechanism for user-submitted arguments (PRO/CONTRA) on ballots. It ensures that only community-vetted arguments are published under the governance account.

**Scope:** Only `app.ch.poltr.ballot.argument` records. No other record types are affected.

---

## Core Concept

Arguments submitted by users to their own PDS repo are **preliminary** ("vorläufig"). They are visible on the platform but labelled as such. They must undergo a peer-review process before being accepted.

Upon successful peer-review, the argument is **republished as an exact copy** to the **governance account's PDS repo**. From this point, the argument belongs to the community, not the individual author. The original record remains in the user's PDS as a receipt.

```
User submits argument
       |
       v
  [PRELIMINARY]  ── visible with label, cross-posted to Bluesky
       |
       v
  Peer-review process (invitations, reviews)
       |
       +--> APPROVED  --> exact copy to governance PDS
       |                   original stays as "receipt"
       |                   governance copy cross-posted to Bluesky
       |
       +--> REJECTED  --> original labelled "rejected"
                          author sees criteria feedback + justifications
```

---

## Argument Lifecycle

### States

| State | Location | Visible | Label |
|-------|----------|---------|-------|
| Preliminary | User's PDS | Yes (with label) | `preliminary` |
| Approved | Governance PDS (copy) + User's PDS (receipt) | Yes (governance copy, no label) | `peer-reviewed` on receipt |
| Rejected | User's PDS | Yes (with label) | `rejected` |

### State Derivation

The `review_status` column on `app_arguments` is the source of truth. It is set by the **indexer** after it indexes a new `review.response` record and runs the quorum check (see [Decision](#decision-quorum)).

- Argument just created, no reviews yet → `preliminary` (DB default)
- Quorum reached with majority approval → `approved` (set by indexer)
- Quorum reached or mathematically impossible → `rejected` (set by indexer)

The original argument record in the user's PDS is never modified. Status lives only in the appview's database.

### Links

| Column | On | Purpose |
|--------|----|---------|
| `original_uri` | Governance copy | Points back to the user's original argument |
| `governance_uri` | User's original | Points to the governance copy (set by appview after PDS write) |

The full review history (invitations, individual reviews with criteria scores and justifications) is stored in the governance PDS and indexed by the appview.

---

## Feature Flag: `PEER_REVIEW_ENABLED`

When `PEER_REVIEW_ENABLED=false` (the default):

- The background loop sleeps without creating invitations or governance copies
- The argument listing endpoint **omits `reviewStatus`** from responses — no badges shown
- The review filter is disabled — all arguments are shown regardless of `review_status`
- Cross-posting skips the `[Preliminary]` prefix — arguments posted normally
- The review endpoints still work (criteria, status) but there will be no invitations to act on

This allows deploying the code safely and enabling the feature when ready.

---

## Invitation Mechanism

### Who Gets Invited

All **active users** on the platform are potential reviewers, **except the author** of the argument under review. "Active" means the user has a valid session (`auth.auth_sessions` with `expires_at > NOW()`).

### Probability

The appview background loop (poll interval: `PEER_REVIEW_POLL_INTERVAL_SECONDS`, default 60s) iterates over preliminary arguments that haven't yet reached quorum invitations. For each eligible active user, it rolls a dice with configurable probability (default: **35%**).

**Rationale:** The probabilistic invitation diminishes the chance of manipulation. An attacker would need approximately 3x the number of users to dominate a peer-review compared to a system where all users are invited.

### Invitation Storage

Invitation records are stored in the **governance PDS** (`app.ch.poltr.review.invitation`). Each invitation references:

- The argument URI under review
- The invited user's DID
- Timestamp of invitation

This makes the invitation process fully transparent and auditable: anyone can query the governance repo to see who was invited for any given peer-review.

### Continuous Invitation

There is **no deadline** and **no timeout** for peer-reviews. The system continuously invites new active users (at the configured probability) until the required number of reviews is collected and a decision is reached.

---

## Review Process

### What the Reviewer Does

The reviewer evaluates the argument on **multiple criteria** and then makes a final binary decision: **approve** or **reject**.

### Review Criteria

Criteria are **configurable** via `PEER_REVIEW_CRITERIA` env var (JSON array). The initial set:

| Criterion | Description |
|-----------|-------------|
| Factual accuracy | Is the argument factually correct? |
| Relevance | Is the argument relevant to the ballot? |
| Clarity | Is the argument clearly written and comprehensible? |
| Unity of thought | Does the argument contain exactly one coherent idea? ("Einheit des Gedankens") |
| Non-duplication | Is this argument sufficiently distinct from existing arguments on the same ballot? |

### Per-Criterion Assessment

For each criterion, the reviewer provides a rating (1–5). These per-criterion assessments are stored as part of the review record. The weighting of criteria is **subjective** — the reviewer considers all criteria but decides for themselves how much each one matters for their final vote.

### Justification

- **Rejection:** A written justification is **compulsory**. The author must understand why the argument was rejected.
- **Approval:** A written justification is **optional**.

### Review Storage

Each review is stored in the **governance PDS** (`app.ch.poltr.review.response`). The review record contains:

- The argument URI under review
- The reviewer's DID
- Per-criterion assessments (array of `{key, label, rating}`)
- Final vote: `APPROVE` or `REJECT`
- Justification text (required for `REJECT`)
- Timestamp

Storing reviews in the governance PDS (not the reviewer's PDS) ensures:

- **Permanence:** Reviews survive even if a reviewer deletes their PDS repo
- **Non-reversibility:** Reviewers cannot retract their vote by deleting records
- **Transparency:** The full review history is publicly auditable in one place

### Access Control

The appview enforces that only invited users can submit a review. When a user attempts to submit, the appview checks `app_review_invitations` for a matching record. Uninvited or already-reviewed submissions are rejected.

---

## Decision (Quorum)

### Rules

All values below are configurable and stored in secrets.

| Parameter | Default | Where | Description |
|-----------|---------|-------|-------------|
| `PEER_REVIEW_QUORUM` | 10 | appview-secrets, indexer-secrets | Number of reviews required |
| `PEER_REVIEW_INVITE_PROBABILITY` | 0.35 | appview-secrets | Probability of inviting an active user |

- **Approval:** A majority of the quorum must approve. With quorum = 10, this means **6 or more approvals**.
- **Early rejection:** The argument is rejected as soon as it becomes **mathematically impossible** for the remaining reviews to produce a majority approval. For example, with quorum = 10: if 5 reviews are rejections, even if all 5 remaining are approvals, the result would be 5-5 (no majority) → reject immediately.
- **No timeout:** The review remains open indefinitely until the quorum is filled.

### Decision Formula

```
total_reviews = approvals + rejections
remaining = quorum - total_reviews

APPROVED  if  approvals > quorum / 2
REJECTED  if  approvals + remaining <= quorum / 2
PENDING   otherwise
```

### Where the Decision Happens

The quorum check runs in the **indexer**, triggered immediately after indexing each `app.ch.poltr.review.response` record from the firehose. This keeps the flow event-driven and consistent with the ATProto architecture (PDS → firehose → indexer → DB).

The indexer updates `review_status` on `app_arguments` but does **not** create the governance PDS copy (it doesn't have governance PDS credentials). The governance copy is created by the appview's background loop (next poll cycle, typically within 60s).

```
User submits review
       |
       v
  AppView writes review.response to governance PDS
       |
       v
  Firehose carries event to indexer
       |
       v
  Indexer indexes review.response into DB
       |
       v
  Indexer runs quorum check (post-index)
       |
       +--> quorum not reached: nothing
       |
       +--> quorum reached: UPDATE review_status on app_arguments
                |
                v
          AppView background loop (next cycle)
                |
                +--> approved: create governance copy on PDS, set governance_uri
                +--> rejected: nothing (status already set)
```

---

## Cross-Posting to Bluesky

| State | Cross-posted? | Details |
|-------|---------------|---------|
| Preliminary | Yes | Under author's account, with `[Preliminary]` prefix |
| Approved (governance copy) | Yes | Under governance account, no prefix |
| Rejected | No new cross-post | The preliminary cross-post remains |

When `PEER_REVIEW_ENABLED=false`, the `[Preliminary]` prefix is omitted.

---

## ATProto Records

### New Lexicon Records

All peer-review records are stored in the **governance account's PDS repo**.

#### `app.ch.poltr.review.invitation`

An invitation for a user to review a specific argument.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| argument | string (at-uri) | yes | AT-URI of the argument under review |
| invitee | string (did) | yes | DID of the invited reviewer |
| createdAt | string (datetime) | yes | Timestamp of invitation |

- **Key:** `tid`
- **Stored in:** Governance PDS

#### `app.ch.poltr.review.response`

A reviewer's evaluation of an argument.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| argument | string (at-uri) | yes | AT-URI of the argument under review |
| reviewer | string (did) | yes | DID of the reviewer |
| criteria | array | yes | Per-criterion assessments (see below) |
| vote | enum | yes | `APPROVE` or `REJECT` |
| justification | string | conditional | Required for `REJECT`, optional for `APPROVE` |
| createdAt | string (datetime) | yes | Timestamp of review |

**Criteria item:**

| Field | Type | Description |
|-------|------|-------------|
| key | string | Criterion identifier (e.g., `factual_accuracy`) |
| label | string | Human-readable label |
| rating | integer | Assessment value (1–5) |

- **Key:** `tid`
- **Stored in:** Governance PDS

### Modified Records

#### `app.ch.poltr.ballot.argument` (governance copy)

When an argument is approved, an exact copy is written to the governance PDS with one additional field:

| Field | Type | Description |
|-------|------|-------------|
| originalUri | string (at-uri) | AT-URI of the original argument in the author's PDS |

All other fields (`title`, `body`, `type`, `ballot`, `createdAt`) are identical to the original.

---

## Database Tables (AppView Index)

### `app_arguments` (modified)

New columns added to the existing table:

| Column | Type | Description |
|--------|------|-------------|
| review_status | text | `preliminary` (default), `approved`, `rejected` |
| original_uri | text | Governance copies: AT-URI of the user's original |
| governance_uri | text | User's originals: AT-URI of the governance copy |

- Index on `review_status`
- `review_status` is set by the indexer's post-index quorum check
- `governance_uri` is set by the appview when it creates the governance PDS copy

### `app_review_invitations`

| Column | Type | Description |
|--------|------|-------------|
| uri | text PK | AT-URI of the invitation record |
| cid | text | CID |
| argument_uri | text | Argument under review |
| invitee_did | text | Invited reviewer's DID |
| created_at | timestamptz | When the invitation was created |
| indexed_at | timestamptz | When the indexer processed it |
| deleted | boolean | Soft-delete flag |

Unique constraint: `(argument_uri, invitee_did) WHERE NOT deleted`

### `app_review_responses`

| Column | Type | Description |
|--------|------|-------------|
| uri | text PK | AT-URI of the review record |
| cid | text | CID |
| argument_uri | text | Argument under review |
| reviewer_did | text | Reviewer's DID |
| criteria | jsonb | Per-criterion assessments |
| vote | text | `APPROVE` or `REJECT` |
| justification | text | Reviewer's justification |
| created_at | timestamptz | When the review was submitted |
| indexed_at | timestamptz | When the indexer processed it |
| deleted | boolean | Soft-delete flag |

Unique constraint: `(argument_uri, reviewer_did) WHERE NOT deleted`

---

## XRPC Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `app.ch.poltr.review.criteria` | GET | session | Returns the configurable criteria list |
| `app.ch.poltr.review.pending` | GET | session | Lists pending invitations for the authenticated user |
| `app.ch.poltr.review.submit` | POST | session | Submits a review (writes to governance PDS) |
| `app.ch.poltr.review.status` | GET | session | Review status for an argument (author sees individual feedback) |

---

## Configuration

### Secrets

**appview-secrets:**

```yaml
PEER_REVIEW_ENABLED: "false"          # Feature flag
PEER_REVIEW_QUORUM: "10"              # Reviews required for decision
PEER_REVIEW_INVITE_PROBABILITY: "0.35" # Dice roll per eligible user
PEER_REVIEW_POLL_INTERVAL_SECONDS: "60" # Background loop interval
PEER_REVIEW_CRITERIA: '[...]'          # JSON array of {key, label}
```

**indexer-secrets:**

```yaml
PEER_REVIEW_QUORUM: "10"              # Must match appview value
```

### Review Criteria

Stored as `PEER_REVIEW_CRITERIA` env var (JSON). Initial set:

```json
[
  { "key": "factual_accuracy", "label": "Factual Accuracy" },
  { "key": "relevance", "label": "Relevance to Ballot" },
  { "key": "clarity", "label": "Clarity" },
  { "key": "unity_of_thought", "label": "Unity of Thought (Einheit des Gedankens)" },
  { "key": "non_duplication", "label": "Non-Duplication" }
]
```

---

## Implementation Files

| File | Role |
|------|------|
| `services/front/src/lexicons/app.ch.poltr.review.invitation.json` | Lexicon schema |
| `services/front/src/lexicons/app.ch.poltr.review.response.json` | Lexicon schema |
| `services/indexer/src/record_handler.js` | Firehose handlers for review collections |
| `services/indexer/src/db.js` | DB upserts + post-index quorum check |
| `services/appview/src/lib/governance_pds.py` | Shared governance PDS session + record creation |
| `services/appview/src/lib/peer_review.py` | Background loop: invitations + governance copies |
| `services/appview/src/routes/review/__init__.py` | XRPC endpoints |
| `services/appview/src/routes/poltr/__init__.py` | Modified argument listing |
| `services/appview/src/lib/crosspost.py` | Modified cross-posting |
| `services/front/src/types/ballots.ts` | TypeScript types |
| `services/front/src/lib/agent.ts` | Frontend API functions |
| `services/front/src/app/ballots/[id]/page.tsx` | Review status badges |
| `services/front/src/app/review/page.tsx` | Review dashboard UI |

---

## Not in Scope (Future)

- **Revision flow:** Author cannot revise and resubmit a rejected argument (must create a new one)
- **Edit suggestions:** Reviewers cannot suggest text edits
- **Automated deduplication:** Only manual (reviewer criterion) for now
- **Final editing:** The governance copy is an exact replica; no additional editing step
