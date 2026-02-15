# POLTR Lexicons

Custom AT Protocol lexicons under the `app.ch.poltr.*` namespace.

Schema files: `services/front/src/lexicons/`

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

### `app.ch.poltr.ballot.like`

A like on a ballot entry. One per user per ballot.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| subject | object | yes | `{ uri: at-uri, cid: cid }` referencing the ballot |
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
