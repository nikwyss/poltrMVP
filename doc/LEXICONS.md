# POLTR Lexicons

Custom AT Protocol lexicons under the `app.ch.poltr.*` namespace.

Schema files: `services/front/src/lexicons/`

---

## Data Hierarchy

```
Ballot (app.ch.poltr.ballot.entry)
  │
  ├── Comment (app.bsky.feed.post)          ← direct reply to ballot cross-post
  │     └── Comment (app.bsky.feed.post)    ← nested replies
  │
  └── Argument (app.ch.poltr.ballot.argument, TBD)
        │
        ├── Comment (app.bsky.feed.post)    ← reply to argument cross-post
        │     └── Comment (app.bsky.feed.post)
        └── ...
```

**Ballots** are the top-level discussion topics (Swiss referendum items). Each ballot is a custom poltr record (`app.ch.poltr.ballot.entry`) created by the governance account and cross-posted to Bluesky as `app.bsky.feed.post`.

**Arguments** are structured positions on a ballot (pro/contra). They use a dedicated poltr lexicon (`app.ch.poltr.ballot.argument`, to be defined) and are cross-posted as `app.bsky.feed.post` replies to the ballot cross-post.

**Comments** use the standard Bluesky post lexicon (`app.bsky.feed.post`). They are replies to either a ballot or an argument cross-post. This means comments are native Bluesky posts — no custom lexicon needed. Comments are stored in `app_comments` with `argument_uri` linking them to their ancestor argument (null if replying directly to the ballot).

---

## Records

### `app.ch.poltr.ballot.entry`

A Swiss ballot (referendum/initiative) entry. Created by the governance account.

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

## Future: Tooling & Publishing

### `@atproto/lex install`

The `@atproto/lex` package provides a CLI that fetches lexicon schemas from the Atmosphere network and manages them locally via a `lexicons.json` manifest with versioning. This could replace the manually maintained JSON files in `services/front/src/lexicons/` and help with type generation and keeping schemas in sync across services (front, appview, indexer).

### Lexicon Store (lexicon.store)

Publishing POLTR's lexicons to [lexicon.store](https://lexicon.store) would make them discoverable by third-party clients in the ATProto ecosystem. This requires:

1. Publishing schemas as `com.atproto.lexicon.schema` records in the PDS repo
2. Adding a `_lexicon` DNS TXT record on `ch.poltr.app` for authority verification

This is not urgent but becomes relevant once the lexicon schemas stabilize and external interoperability is a goal.
