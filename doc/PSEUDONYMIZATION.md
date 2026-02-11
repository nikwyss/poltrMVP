# Pseudonymization in POLTR

Each POLTR user receives a pseudonymous identity based on a Swiss mountain name, following the "Demokratiefabrik" concept. This ensures anonymity while providing recognizable, consistent identities.

## Pseudonym Format

A pseudonym consists of:
- **Random letter** (A-Z) as a first-name initial
- **Swiss mountain name** drawn from a database of 4,294 mountains (>= 2,000m)
- **Random avatar color** (hex, luma-constrained for readability)

Example: **"A. Eiger"** with color `#a3b2c1`

The mountain's metadata (canton, height, full name) is stored alongside for display purposes.

## Architecture

```
create_account()
  -> draw random mountain from auth.mountain_templates (PostgreSQL)
  -> generate random letter + color
  -> write app.bsky.actor.profile record to PDS (displayName)
  -> write app.ch.poltr.actor.pseudonym record to PDS (full pseudonym data)

Firehose -> Indexer
  -> index pseudonym records into public.app_profiles (ephemeral)
```

The PDS is the source of truth. The AppView indexes an ephemeral copy via the firehose, which can be rebuilt at any time.

## Database

### auth.mountain_templates (seed data)

Reference table with 4,294 Swiss mountains. Populated via `infra/scripts/postgres/seed-mountains.sql`.

| Column   | Type          | Description                    |
|----------|---------------|--------------------------------|
| id       | serial PK     | Auto-increment ID              |
| name     | varchar(150)  | Short name (e.g. "Eiger")      |
| fullname | varchar(250)  | Full name (e.g. "Eiger")       |
| canton   | varchar(20)   | Canton abbreviation (e.g. "BE")|
| height   | numeric(7,1)  | Height in meters               |

### public.app_profiles (indexed from firehose)

Ephemeral table indexed by the firehose indexer. Rebuildable from PDS records.

| Column            | Type          | Description                     |
|-------------------|---------------|---------------------------------|
| did               | text PK       | User DID                        |
| display_name      | varchar(200)  | Full pseudonym (e.g. "A. Eiger")|
| mountain_name     | varchar(150)  | Mountain short name             |
| mountain_fullname | varchar(250)  | Mountain full name              |
| canton            | varchar(20)   | Canton abbreviation             |
| height            | numeric(7,1)  | Height in meters                |
| color             | varchar(10)   | Hex color (e.g. "#a3b2c1")     |
| created_at        | timestamptz   | When pseudonym was created      |
| indexed_at        | timestamptz   | When record was indexed         |

## ATProto Lexicon

Collection: `app.ch.poltr.actor.pseudonym` (key: `literal:self`)

```json
{
  "displayName": "A. Eiger",
  "mountainName": "Eiger",
  "mountainFullname": "Eiger",
  "canton": "BE",
  "height": 3967.0,
  "color": "#a3b2c1",
  "createdAt": "2026-01-15T10:30:00Z"
}
```

Lexicon definition: `services/front/src/lexicons/app.ch.poltr.actor.pseudonym.json`

## Flow

### Account Creation

1. PDS account is created with a random handle (e.g. `user3kf9x2.poltr.info`)
2. A random mountain is drawn from `auth.mountain_templates` (`ORDER BY random() LIMIT 1`)
3. A random letter (A-Z) and luma-constrained color are generated
4. `app.bsky.actor.profile` record is written to PDS with `displayName` (e.g. "A. Eiger")
5. `app.ch.poltr.actor.pseudonym` record is written to PDS with full pseudonym data
6. The `displayName` is stored in the session cookie

### Indexing

The firehose indexer watches for `app.ch.poltr.actor.pseudonym` records:
- On `create`/`update`: upserts into `public.app_profiles`
- On `delete`: removes from `public.app_profiles`

## Key Files

| File | Role |
|------|------|
| `services/appview/src/auth/pseudonym_generator.py` | Generates pseudonyms (random mountain + letter + color) |
| `services/appview/src/lib/atproto_api.py` | `pds_set_profile()` and `pds_write_pseudonym_record()` |
| `services/appview/src/auth/login.py` | Calls generator + PDS writes during `create_account()` |
| `services/indexer/src/record_handler.js` | Handles pseudonym collection from firehose |
| `services/indexer/src/db.js` | `upsertProfileDb()` and `deleteProfile()` |
| `infra/scripts/postgres/db-setup.sql` | Table definitions |
| `infra/scripts/postgres/seed-mountains.sql` | Mountain seed data (4,294 rows) |
| `infra/scripts/postgres/seed-mountains.py` | Script to regenerate seed SQL from xlsx |

## Seeding Mountains

To regenerate the seed SQL from the source data:

```bash
python3 infra/scripts/postgres/seed-mountains.py
```

This parses `doc/templates/berge_vorlage.xlsx` and writes `infra/scripts/postgres/seed-mountains.sql`.

To apply the seed data:

```bash
psql -U allforone -d appview -f infra/scripts/postgres/seed-mountains.sql
```
