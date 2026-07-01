# POLTR Lexicons

Custom AT Protocol lexicons under the `app.ch.poltr.*` namespace.

Schema files: `services/frontend/src/lexicons/`

---

## Data Hierarchy

```
Ballot (app.ch.poltr.ballot.entry)
  │
  └── Argument (app.ch.poltr.ballot.argument)
        │
        └── Comment (app.ch.poltr.comment)
```

**Ballots** are the top-level discussion topics (Swiss referendum items). Each ballot is a custom poltr record (`app.ch.poltr.ballot.entry`) created by the community account and cross-posted to Bluesky as `app.bsky.feed.post`.

**Arguments** are structured positions on a ballot (pro/contra), lexicon `app.ch.poltr.ballot.argument`. User-authored arguments (`#sourceUser`) are **written self-signed into the user's OWN repo**; the internal write-side (writer) gates them and creates the canonical **community record** in the per-ballot community repo, carrying a `source.originUri`/`originCid` reference back to the user original. Official/organization arguments (`#sourceOfficial`/`#sourceOrganization`) are CMS-authored straight into the community repo. The community record is cross-posted as an `app.bsky.feed.post` reply to the ballot cross-post. See `doc/ATPROTO_NATIVE_DELIBERATION.md`.

**Comments** are reactions to arguments. They use a custom poltr lexicon (`app.ch.poltr.comment`) with a `title` and `body` field, and reference their parent argument via `argument` (AT URI). Comments are stored in `app_comments` with `argument_uri` linking them to their parent argument. The `comment_count` on `app_arguments` is kept in sync by the indexer.

---

## Records

### `app.ch.poltr.ballot.entry`

A Swiss ballot (referendum/initiative) entry. Created by the community account.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Ballot title |
| topic | string | | Topic / category |
| text | string | | Description text |
| officialRef | string | yes | Official reference number (also used as rkey) |
| voteDate | string (date) | yes | Date of the vote |
| language | enum | | `de-CH`, `fr-CH`, `it-CH`, `rm-CH` |

- **Key:** `any` (uses `officialRef` as rkey to prevent duplicates)

### `app.ch.poltr.content.rating`

A rating on poltr content (ballot, argument, post). Includes a 0–100 preference scale. Cross-posted to Bluesky as `app.bsky.feed.like` when preference > 0.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subject | object | yes | `{ uri: at-uri, cid: cid }` referencing the content |
| preference | integer | yes | Preference indication from 0 (neutral) to 100 (strong support) |
| createdAt | string (datetime) | yes | Timestamp |

- **Key:** `tid` (auto-generated)

### `app.ch.poltr.ballot.argument`

A structured argument for or against a Swiss ballot entry. Stored in the community repo. Cross-posted to Bluesky as an `app.bsky.feed.post` reply to the ballot's cross-post, under the community account.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Argument title |
| body | string | yes | Argument body text |
| type | enum | yes | `PRO` or `CONTRA` |
| ballot | string | yes | Ballot id / AT-URI of the parent ballot entry |
| source | union | yes | `#sourceUser` (`authorDid`), `#sourceOfficial`, or `#sourceOrganization`. The community copy additionally carries `originUri`/`originCid` (provenance to the user-repo original) |
| createdAt | string (datetime) | yes | Timestamp |

- **Key:** original = `tid`; community record = deterministic rkey (`sha256(originUri)[:24]`) for idempotent re-projection
- **Stored in:** *user-authored* → the **user's own repo** (self-signed original) **and** a **community copy** in the community repo. *official/org* → community repo only (CMS-authored).
- **Cross-post:** the community record is posted as `app.bsky.feed.post` reply to the ballot's Bluesky post under the community account.
- **DB table:** `app_arguments` (projected from the **community** record; `origin_uri`/`origin_cid` link to the user original)
- **Indexer:** user-repo originals are staged into `app_acceptance_queue` (not projected); the writer's community record is then projected as today.

### `app.ch.poltr.comment`

A comment on an argument in a Swiss ballot discussion.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Comment title |
| body | string | yes | Comment body text |
| argument | string (at-uri) | yes | AT-URI of the parent argument |
| createdAt | string (datetime) | yes | Timestamp |

- **Key:** `tid` (deterministic rkeys from import use xlsx row id)
- **DB table:** `app_comments` (indexed by `argument_uri`, `ballot_uri`, `ballot_rkey`, `did`)
- **Side effect:** Indexer refreshes `comment_count` on the parent `app_arguments` row on create/delete.

### `app.ch.poltr.actor.pseudonym`
Pseudonymous identity for a POLTR user, derived from a Swiss mountain.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| displayName | string | yes | Full pseudonym, e.g. "A. Eiger" |
| mountainName | string | yes | Mountain name from template |
| mountainFullname | string | | Full official mountain name |
| canton | string | yes | Swiss canton abbreviation, e.g. "BE" |
| height | number | yes | Mountain height in meters |
| color | string | yes | Hex color for avatar, e.g. "#a3b2c1" |
| createdAt | string (datetime) | | Timestamp |

- **Key:** `literal:self` (singleton per user)

---

## Peer Review

Peer review runs on three records. The **request** and **response** are user-authored (written self-signed into the user's own repo and pulled through the acceptance pipeline); the **invitation** is community-authored by the writer.

### `app.ch.poltr.peerreview.request`

A user's signal that they are active and willing to review. Written by appview into the **user's own repo** (at most once per active UTC day). The writer picks it up off the firehose and runs the assignment lottery, producing N `invitation` records. Carries no payload beyond the timestamp — its mere existence is the trigger.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| createdAt | string (datetime) | yes | Timestamp |

- **Key:** `tid` (auto-generated)
- **Stored in:** the user's own repo (self-signed)
- **Pipeline:** staged into `app_acceptance_queue` (`kind=request`); the writer runs `maybe_assign_reviews_for_user` (daily limit, anti-collusion lottery, slot budget).

### `app.ch.poltr.peerreview.invitation`

An invitation (or non-invitation) to review a specific argument, created by the writer under the community account. `invited=false` records the lottery outcome so the same (argument, reviewer) pair is not re-rolled.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| argument | string (at-uri) | yes | AT-URI of the community argument to review |
| invitee | string (did) | yes | DID of the invited reviewer |
| invited | boolean | yes | Whether the lottery selected this reviewer |
| createdAt | string (datetime) | yes | Timestamp |

- **Key:** deterministic via `compose_review_rkey(argumentUri, inviteeDid)` (idempotent, one per pair)
- **Stored in:** the community repo (community-authored by the writer)
- **DB table:** `app_peerreview_invitations`

### `app.ch.poltr.peerreview.response`

A reviewer's verdict on an argument. Written self-signed into the **reviewer's own repo**; the writer creates the canonical community response (deterministic rkey, with `originUri`/`originCid` provenance) in the argument's community repo and updates the review state / quorum.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| argument | string (at-uri) | yes | AT-URI of the community argument under review |
| reviewer | string (did) | yes | DID of the reviewer |
| criteria | array | yes | Structured review criteria (non-empty; every criterion assessed — UI default is unselected) |
| vote | string | yes | The verdict (APPROVE / REJECT) — the only binding signal |
| createdAt | string (datetime) | yes | Timestamp |

- **Key:** community record = `compose_review_rkey(argumentUri, reviewerDid)` (idempotent, one per pair → quorum dedup)
- **Stored in:** reviewer's own repo (original) **and** the community repo (community copy)
- **Pipeline:** staged into `app_acceptance_queue` (`kind=response`); projected into `app_peerreview_responses` with `origin_uri`/`origin_cid`.

---

## Future: Tooling & Publishing

### `@atproto/lex install`

The `@atproto/lex` package provides a CLI that fetches lexicon schemas from the Atmosphere network and manages them locally via a `lexicons.json` manifest with versioning. This could replace the manually maintained JSON files in `services/frontend/src/lexicons/` and help with type generation and keeping schemas in sync across services (front, appview, indexer).

### Lexicon Store (lexicon.store)

Publishing POLTR's lexicons to [lexicon.store](https://lexicon.store) would make them discoverable by third-party clients in the ATProto ecosystem. This requires:

1. Publishing schemas as `com.atproto.lexicon.schema` records in the PDS repo
2. Adding a `_lexicon` DNS TXT record on `ch.poltr.app` for authority verification

This is not urgent but becomes relevant once the lexicon schemas stabilize and external interoperability is a goal.
