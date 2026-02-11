# Ballots in POLTR

Ballot entries represent Swiss referendum items (Vorlagen/Abstimmungen) stored as ATProto records in the PDS.

## Lexicon

**Collection:** `app.ch.poltr.ballot.entry`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Ballot title |
| voteDate | string (date) | yes | Voting date (ISO format) |
| officialRef | string | yes | Official reference number (e.g. "413.2") |
| topic | string | no | Topic/category |
| text | string | no | Description or body text |
| language | enum | no | `de-CH`, `fr-CH`, `it-CH`, `rm-CH` |

## Uniqueness via `officialRef` as rkey

The PDS has no custom uniqueness constraints. The only uniqueness it enforces is the AT-URI: `at://did/collection/rkey`.

To prevent duplicate ballots, the `officialRef` (official ballot ID) is used as the record key (`rkey`). This makes the AT-URI deterministic:

```
at://did:plc:xxx/app.ch.poltr.ballot.entry/413.2
```

- **Create** uses `putRecord` (not `createRecord`) with `rkey: officialRef`
- Writing the same `officialRef` again overwrites the existing record instead of creating a duplicate
- The lexicon declares `"key": "any"` (not `"tid"`) to allow custom rkeys

### rkey constraints

ATProto rkeys must match `[a-zA-Z0-9._:~-]{1,512}`. Official ballot references like `413.2` are valid.

We use as rkey the offical BFS numbering. e.g. 

.1 Hauptvorlage
.2 Gegenentwurf
.3 Stichfrage

552.1;28.11.2010;Ausschaffungsinitiative...
552.2;28.11.2010;Gegenentwurf zur Ausschaffungsinitiative...
552.3;28.11.2010;Stichfrage zu Ausschaffungsinitiative und Gegenentwurf;...

## Related Records

- **Likes** (`app.ch.poltr.ballot.like`): Reference a ballot by its AT-URI. Like count is denormalized on `app_ballots.like_count`.
- **Embeds** (`app.ch.poltr.ballot.embed`): Embed a ballot view in other contexts.

## Data Flow

```
Frontend (putRecord)
  -> PDS (stores in user's repo)
  -> Firehose
  -> Indexer (upserts into app_ballots table)
  -> AppView (serves via app.ch.poltr.ballot.list)
```

The PDS is the source of truth. The AppView indexes an ephemeral copy via the firehose, which can be rebuilt at any time.


  Now a ballot with officialRef: "413.2" produces the deterministic URI at://did:plc:xxx/app.ch.poltr.ballot.entry/413.2. Writing it again just overwrites
   — no duplicates possible.