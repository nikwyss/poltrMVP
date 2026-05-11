# Peer-Review of Arguments

Peer-review is the quality assurance mechanism for user-submitted arguments (PRO/CONTRA) on ballots. It ensures that only community-vetted arguments gain the `approved` status.

**Scope:** Only `app.ch.poltr.ballot.argument` records. No other record types are affected.

---

## Core Concept

Arguments are **always stored in the governance account's PDS repo**, even when submitted by individual users. The AppView writes the record to the governance repo on behalf of the user, including the user's DID as `authorDid` in the record.

New arguments start as **preliminary** ("vorläufig"). They are visible on the platform but labelled as such. They must undergo a peer-review process before being accepted.

```
User submits argument
       |
       v
  AppView writes to governance PDS (with authorDid)
       |
       v
  Firehose → Indexer indexes with review_status = 'preliminary'
       |
       v
  [PRELIMINARY]  ── visible with label, cross-posted to Bluesky
       |
       v
  Peer-review process (invitations, reviews)
       |
       +--> APPROVED  --> review_status flipped to 'approved'
       |                   cross-post updated (no prefix)
       |
       +--> REJECTED  --> review_status flipped to 'rejected'
                          author sees criteria feedback + justifications
```

---

## Argument Lifecycle

### States

| State | Location | Visible | Label |
|-------|----------|---------|-------|
| Preliminary | Governance PDS | Yes (with label) | `preliminary` |
| Approved | Governance PDS | Yes (no label) | — |
| Rejected | Governance PDS | Only to author | `rejected` |

### State Derivation

The `review_status` column on `app_arguments` is the source of truth. It is set by the **indexer** after it indexes a new `review.response` record and runs the quorum check (see [Decision](#decision-quorum)).

- Argument just created, no reviews yet → `preliminary` (DB default)
- Quorum reached with majority approval → `approved` (set by indexer)
- Quorum reached or mathematically impossible → `rejected` (set by indexer)

### Authorship

Since all arguments live in the governance repo, the repo DID (`did` column) is always the governance account. The actual author is tracked via:

- **Record field:** `authorDid` in the `app.ch.poltr.ballot.argument` record (publicly visible on PDS)
- **DB column:** `author_did` on `app_arguments` (used for profile joins, review filtering)

The full review history (invitations, individual reviews with criteria scores and justifications) is stored in the governance PDS and indexed by the appview.

---

## Feature Flag: `APPVIEW_PEER_REVIEW_ENABLED`

When `APPVIEW_PEER_REVIEW_ENABLED=false` (the default):

- The background loop sleeps without creating invitations
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

The appview background loop (poll interval: `APPVIEW_PEER_REVIEW_POLL_INTERVAL_SECONDS`, default 60s) iterates over preliminary arguments that haven't yet reached quorum invitations. For each eligible active user, it rolls a dice with configurable probability (default: **35%**).

**Rationale:** The probabilistic invitation diminishes the chance of manipulation. An attacker would need approximately 3x the number of users to dominate a peer-review compared to a system where all users are invited.

### Invitation Decisions Are Immutable

Every user considered for a review receives an invitation record — either positive (`invited: true`) or negative (`invited: false`, meaning "not selected"). **Once created, these records can never be overwritten, updated, or deleted:**

| Layer | Mechanism |
|---|---|
| **DB unique index** | `UNIQUE(argument_uri, invitee_did)` — unconditional (no `WHERE NOT deleted`). One decision per user per argument, forever |
| **DB insert** | `ON CONFLICT DO NOTHING` — if either the URI or the (argument, invitee) pair already exists, the insert is silently ignored |
| **No soft-delete** | The `deleted` column does not exist on `app_review_invitations`. There is no way to mark a decision as deleted |
| **Indexer delete handler** | Firehose delete events for invitations are logged and ignored (no-op) |
| **AppView pre-check** | DB existence check before calling `put_governance_record`, preventing PDS overwrites from race conditions |
| **Eligible users query** | Excludes all users with any existing record (positive or negative) |

This ensures the randomized selection is provably fair and tamper-proof: the governance account cannot retroactively change who was invited.

### Invitation Storage

Invitation records are stored in the **governance PDS** (`app.ch.poltr.review.invitation`). Each record contains:

- The argument URI under review
- The user's DID
- Whether they were invited (`true`) or not selected (`false`)
- Timestamp of the decision

This makes the invitation process fully transparent and auditable: anyone can query the governance repo to see who was considered and who was selected for any given peer-review.

### Continuous Invitation

There is **no deadline** and **no timeout** for peer-reviews. The system continuously invites new active users (at the configured probability) until the required number of reviews is collected and a decision is reached.

---

## Review Process

### What the Reviewer Does

The reviewer evaluates the argument on **multiple criteria** and then makes a final binary decision: **approve** or **reject**.

### Review Criteria

Criteria are **configurable** via `APPVIEW_PEER_REVIEW_CRITERIA` env var (JSON array). The initial set:

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

The appview enforces that only invited users can submit a review. When a user attempts to submit, the appview checks `app_review_invitations` for a matching record with `invited = true`. Uninvited submissions are rejected.

### Duplicate Prevention

Duplicate invitations and responses are prevented **structurally at the PDS level** using composed rkeys and `putRecord` (upsert).

**Rkey format:** `{argument_rkey}-{did_suffix}`

- `argument_rkey` — the rkey portion of the argument's AT URI (e.g. `7028`)
- `did_suffix` — the part after `did:plc:` of the invitee/reviewer DID (e.g. `3ch7iwf6od4szklpolupbv7o`)
- **Example:** `7028-3ch7iwf6od4szklpolupbv7o`

Since invitations and responses live in **different collections**, the same rkey format works for both.

For invitations, the DB-level `UNIQUE(argument_uri, invitee_did)` index provides an additional guarantee — even if the PDS record were somehow overwritten, the DB would ignore the duplicate.

---

## Decision (Quorum)

### Rules

All values below are configurable and stored in secrets.

| Parameter | Default | Where | Description |
|-----------|---------|-------|-------------|
| `APPVIEW_PEER_REVIEW_QUORUM` | 10 | appview-secrets, indexer-secrets | Number of reviews required |
| `APPVIEW_PEER_REVIEW_INVITE_PROBABILITY` | 0.35 | appview-secrets | Probability of inviting an active user |

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

The indexer updates `review_status` on `app_arguments` directly. Since arguments already live in the governance repo, no separate governance copy needs to be created.

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
```

---

## Cross-Posting to Bluesky

All argument cross-posts are made under the **governance account** on Bluesky.

| State | Cross-posted? | Details |
|-------|---------------|---------|
| Preliminary | Yes | Under governance account, with `[Preliminary]` prefix |
| Approved | Yes | Under governance account, no prefix |
| Rejected | No new cross-post | The preliminary cross-post remains |

When `APPVIEW_PEER_REVIEW_ENABLED=false`, the `[Preliminary]` prefix is omitted.

---

## Indexer: Governance-Only Filtering

The indexer only accepts `app.ch.poltr.ballot.argument` records from the governance repo. Records from user repos are silently ignored. This is enforced via the `PDS_GOVERNANCE_ACCOUNT_DID` environment variable (shared from `pds-secrets`).

The same governance-only filter applies to `app.ch.poltr.ballot.entry` (ballots) and `app.ch.poltr.review.invitation` (invitations).

---

## ATProto Records

### Peer-Review Records

All peer-review records are stored in the **governance account's PDS repo**.

#### `app.ch.poltr.review.invitation`

A decision record for whether a user was selected to review an argument.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| argument | string (at-uri) | yes | AT-URI of the argument under review |
| invitee | string (did) | yes | DID of the user considered for review |
| invited | boolean | yes | `true` = invited, `false` = not selected |
| createdAt | string (datetime) | yes | Timestamp of the decision |

- **Key:** `any` — composed rkey `{argument_rkey}-{did_suffix}` (see [Duplicate Prevention](#duplicate-prevention))
- **Stored in:** Governance PDS
- **Immutable:** Cannot be overwritten, updated, or deleted

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

- **Key:** `any` — composed rkey `{argument_rkey}-{did_suffix}` (see [Duplicate Prevention](#duplicate-prevention))
- **Stored in:** Governance PDS

### Modified Records

#### `app.ch.poltr.ballot.argument`

Arguments are stored exclusively in the governance PDS repo.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Argument title |
| body | string | yes | Argument body text |
| type | enum | yes | `PRO` or `CONTRA` |
| ballot | string (at-uri) | yes | AT-URI of the parent ballot entry |
| authorDid | string (did) | yes | DID of the user who authored this argument |
| createdAt | string (datetime) | yes | Timestamp |

---

## Database Tables (AppView Index)

### `app_arguments` (modified)

| Column | Type | Description |
|--------|------|-------------|
| did | text | Governance account DID (repo owner) |
| author_did | text | DID of the user who authored the argument |
| review_status | text | `preliminary` (default), `approved`, `rejected` |

- Index on `review_status`, `author_did`
- `review_status` is set by the indexer's post-index quorum check

### `app_review_invitations`

| Column | Type | Description |
|--------|------|-------------|
| uri | text PK | AT-URI of the invitation record |
| cid | text | CID |
| argument_uri | text | Argument under review |
| invitee_did | text | User's DID |
| invited | boolean | `true` = invited, `false` = not selected |
| created_at | timestamptz | When the decision was made |
| indexed_at | timestamptz | When the indexer processed it |

Unique constraint: `UNIQUE(argument_uri, invitee_did)` — unconditional, immutable. No `deleted` column.

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

Unique constraint: `UNIQUE(argument_uri, reviewer_did)` — unconditional, immutable. No `deleted` column.

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
APPVIEW_PEER_REVIEW_ENABLED: "false"          # Feature flag
APPVIEW_PEER_REVIEW_QUORUM: "10"              # Reviews required for decision
APPVIEW_PEER_REVIEW_INVITE_PROBABILITY: "0.35" # Dice roll per eligible user
APPVIEW_PEER_REVIEW_POLL_INTERVAL_SECONDS: "60" # Background loop interval
APPVIEW_PEER_REVIEW_CRITERIA: '[...]'          # JSON array of {key, label}
```

**indexer-secrets:**

```yaml
APPVIEW_PEER_REVIEW_QUORUM: "10"              # Must match appview value
PDS_GOVERNANCE_ACCOUNT_DID: "did:plc:..." # Required for governance-only filtering
```

### Review Criteria

Stored as `APPVIEW_PEER_REVIEW_CRITERIA` env var (JSON). Initial set:

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
| `services/indexer/src/record_handler.js` | Firehose handlers for review collections (governance-only filter) |
| `services/indexer/src/db.js` | DB inserts (immutable for invitations) + post-index quorum check |
| `services/appview/src/lib/governance_pds.py` | Shared governance PDS session + record creation |
| `services/appview/src/lib/peer_review.py` | Background loop: invitation decisions (positive + negative) |
| `services/appview/src/routes/review/__init__.py` | XRPC endpoints |
| `services/appview/src/routes/poltr/__init__.py` | Argument creation + listing (governance repo, author_did) |
| `services/appview/src/lib/crosspost.py` | Cross-posting under governance account |
| `services/front/src/types/ballots.ts` | TypeScript types |
| `services/front/src/lib/agent.ts` | Frontend API functions |
| `infra/scripts/postgres/migrate_arguments_to_governance.sql` | DB migration |
| `infra/scripts/cleanup_user_arguments.py` | PDS cleanup (delete old user-repo arguments) |

---

## Not in Scope (Future)

- **Revision flow:** Author cannot revise and resubmit a rejected argument (must create a new one)
- **Edit suggestions:** Reviewers cannot suggest text edits
- **Automated deduplication:** Only manual (reviewer criterion) for now
- **Final editing:** No additional editing step after approval
