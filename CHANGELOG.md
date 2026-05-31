# Changelog

## 2026-05-26

### PDS error handling overhaul (`services/appview`, `services/front`)
- **Categorized, sanitized PDS errors.** New `services/appview/src/atproto/errors.py`: `PDSError` with categories `auth_required`→401, `pds_unavailable`→503 (+`Retry-After`), `invalid_request`→400, `internal`→500; `from_response()`/`from_network_error()` map the PDS's own XRPC errors and transport failures. The DID + raw PDS text go **only to server logs**, never to the client
- **De-duplicated handling.** `atproto/atproto_api.py` + `atproto/governance.py` user/governance write helpers now raise `PDSError` instead of `RuntimeError`; `core/fastapi.py` registers **one** shared `PDSError` exception handler; the 5 PDS-write endpoints (comment/argument/rating/unrating/review.submit) dropped their copy-pasted `try/except … "pds_error"` blocks
- **Contract change:** clients now receive `{"error":"auth_required|pds_unavailable|invalid_request|internal"}` with the matching HTTP status (the only consumer is our own frontend)
- **Frontend feedback + rollback.** New `lib/pdsError.ts` (`toPdsError` → typed error; dispatches `poltr:session-expired` on 401 — now also for likes/ratings, which previously bypassed it) and `lib/toast.ts` (`notifyPdsError`). Added `sonner` + `<Toaster>` in `app/layout.tsx`. Write helpers (`lib/ballots.ts`, `lib/agent.ts`) throw structured `PdsError`. Rating-commit and comment-like now **roll back** the optimistic UI on failure + toast; the comment composer keeps the typed text + shows an inline `Alert`. New `errors` i18n namespace (`messages/{de,en}.json`)

### PDS storage-full incident: peer-review invitation runaway (`services/appview`, `services/indexer`, `infra`)
- **Root cause.** The peer-review invitation loop (`arguments/peer_review.py`, every 60 s) re-wrote review-invitation records via `putRecord` (deterministic rkey) on every cycle because its dedup table `app_review_invitations` was only fed by the indexer (create-only) and that feedback had gaps. Each rewrite emitted a fresh firehose commit; **~225 k redundant events accumulated in `sequencer.sqlite` (945 MB)** and filled the 1 GiB `pds-data` volume → all repo ops (incl. `createSession`) returned 500. The actual repos stayed tiny (3.4 MB) — *many commits, no data*
- **Fix.** `peer_review.py` now writes invitations via **`createRecord`** at a deterministic rkey (immutable; a duplicate write is rejected *before* any commit → a runaway is structurally impossible) and **synchronously inserts the dedup row** into `app_review_invitations` (indexer-independent). `governance.create_governance_record()` gained an optional `rkey` param. The indexer stays create-only for invitations (immutability)
- **One-time remediation (ops).** Pruned ~210 k stale `append` events from the sequencer (kept the last 20 k + all identity/account/sync; `integrity_check` ok; **945 MB→86 MB, `/data` 100%→9%**); reconciled leftover PDS invitation records into `app_review_invitations`. `infra/kube/secrets.yaml`: `APPVIEW_PEER_REVIEW_ENABLED` toggled off during remediation, back on after the fixed appview image was deployed

### Indexer backfill fix + PDS disk monitoring (`infra/kube`)
- **Backfill cronjob fixed** (`indexer.yaml`): Service `targetPort` + `containerPort` 3000→**3001**. The admin/backfill HTTP server listens on `BACKFILL_PORT=3001`, but the Service targeted 3000, so `indexer-backfill-nightly`'s curl to `:80` failed with connection-refused
- **Disk early-warning** — new `infra/kube/pds-monitoring.yaml`: weekly CronJob `pds-disk-alert` (+ minimal SA/Role/RoleBinding) reads `df /data` in the PDS pod via `kubectl exec` and emails an alert (appview SMTP creds) when usage ≥ 70 %. Public images only (no ghcr build needed)

### Repo policy: no AI co-author trailers
- Commits must **never** carry `Co-Authored-By: Claude …` (or any Anthropic/AI co-author). Documented in `CLAUDE.md`; enforced by a `commit-msg` hook (`.githooks/commit-msg`, via `core.hooksPath`) that strips such lines

## 2026-05-25

### Argument relevance rating: 1–100 slider wired to per-user PDS ratings (`services/appview`, `services/front`)
- **Generic content rating, fully wired.** The pre-existing `app.ch.poltr.content.rating` record (carrying a `preference` field) is now used as a generic, scale-agnostic preference signal on any subject. Convention: **`preference` is always stored normalised to the canonical 0–100 scale** (a binary "like" = `preference=100`); differing input scales (binary, 5-grade, 100) are normalised by the caller. Differentiation by content kind comes from the `subject` strongRef, not from separate record types
- **AppView write (`routes/ballots/ballots.py` `create_like`)**: now clamps `preference` to 0–100 and writes via the new `pds_put_record_session()` (`atproto/atproto_api.py`) at a **deterministic rkey = the subject's rkey**, so re-rating overwrites in place (idempotent, immune to indexer lag). One rating per (user, subject). Still written into the user's own PDS repo
- **AppView read**: `argument.list` + `argument.get` viewer subqueries now also return `preference` → new `viewer.preference` field in `_serialize_argument_row` (undefined when the user hasn't rated). No DB change — `app_likes.preference` already existed
- **Frontend**: new `rateContent(uri, cid, preference)` in `lib/ballots.ts`. The `RelevanceRating` slider (`components/relevance-rating.tsx`) gained an `onCommit` callback fired on pointer-release / +–-buttons; the argument detail view persists via `rateContent`, seeding the initial value from `viewer.preference`. The booklet card reads the real `viewer.preference` (placeholder hashing removed). `ArgumentWithMetadata.viewer.preference` added to `types/ballots.ts`
- **Note**: ratings on arguments mean `like_count` (count of rating rows) now reads as "number of ratings". Aggregate average relevance (for the Auswertung section) is not yet implemented

## 2026-05-13

### Argument sources: official BK arguments alongside user-submitted ones (`lexicons`, `services/appview`, `services/indexer`, `services/cms`, `services/front`, `infra`)
- **Lexicon `app.ch.poltr.ballot.argument` extended** with a closed `source` union (3 refs): `#sourceUser` (existing user-authored args; `authorDid` moved inside), `#sourceOfficial` (Bundeskanzlei leaflet, `documentRef` + `section`), `#sourceOrganization` (parties/associations/NGOs, `orgKey` — schema reserved, publish path not yet wired up). Top-level legacy `authorDid` tolerated as backward-compat fallback. New file: `lexicons/app/ch/poltr/ballot/argument.json`
- **DB migration** (`infra/scripts/postgres/migrate-argument-sources.sql`): `app_arguments` gains `source_type` (`user|official|organization`, default `user`), `source_org_key`, `source_doc_ref`, `source_section`, `source_verified_did`; `author_did` relaxed to nullable; consistency check ensures user → `author_did NOT NULL`, organization → `source_org_key NOT NULL`. Indexes on `source_type` + partial on `source_org_key`. Mirrored in `infra/scripts/postgres/db-setup.sql`
- **Indexer**: `upsertArgumentDb` parses the `source` union into the flat DB columns. Legacy records (no `source`, top-level `authorDid`) treated as `sourceUser`. Curated content (`official`/`organization`) inserted with `review_status='approved'` — bypasses peer review entirely
- **AppView**: `argument.create` wraps the caller's DID as `source: { $type: '…#sourceUser', authorDid }` on the record. `argument.list` accepts a `source` query param (`user|official|organization|all`) and reconstructs the `source` union in the response. Peer-review filter on the list endpoint exempts `official`/`organization` rows
- **CMS `OfficialArguments` collection** (`services/cms/src/collections/OfficialArguments.ts`): curated arguments are entered in Payload. `afterChange` hook calls `publishImportedArgument()` which loads the ballot's governance creds (NaCl SecretBox), opens a PDS session, writes the record with `sourceOfficial`, and persists `pds_uri`/`pds_cid` back to the CMS row. `sourceOrganization` option in the collection is commented-out until that path is built
- **Frontend `/ballot/[id]/new_arguments`**: experimental two-section view — "Offizielle Argumente" (warm off-white bg, `★` marker, 3px left accent on cards) above "Community" (dashed border, `◐` marker). Sticky PRO/CONTRA column header; mobile interleaves cards. `ArgumentSource` discriminated union added to `types/ballots.ts`; `listArguments(..., source?)` accepts the new query param; `author` is now optional on `ArgumentWithMetadata` because curated args have no pseudonym
- **Wiki updates**: `Arguments-and-Comments.md` gains a "Argument Sources" section + curated-content note; `ATProto-Integration.md` lexicon table updated to the union shape; `Peer-Review.md` notes the curated-content bypass
- **Tooling**:
  - `infra/scripts/backfill_argument_sources.py`: idempotent rewrite of legacy user arguments on the PDS — applied to all 99 existing records, each now carries `source: sourceUser` and the top-level `authorDid` is removed
  - `infra/scripts/import_bk_arguments.py`: parses a markdown dump of leaflet arguments and bulk-publishes the missing ones via PDS `createRecord` + direct CMS row insert (bypasses the CMS hook). Idempotent on case-insensitive title match. Used to import the 11 remaining BK 663 (Klimaschutz-Initiative) arguments
- **Operations fixes**:
  - `infra/kube/indexer.yaml`: removed stale `env: APPVIEW_CROSSPOST_ENABLED` reference (the indexer doesn't read that var — it was a copy-paste from appview, and the missing key was blocking pod startup)
  - **Payload hook deadlock fix** in `Ballots.ts` and `OfficialArguments.ts`: the `afterChange` → `payload.update(same collection)` pattern was deadlocking the Postgres adapter (outer tx held the row lock; inner update on a new connection waited for it). Both hooks now pass `req` (share transaction) plus `context: { skipPublishHook: true }` (short-circuits the recursive afterChange)

## 2026-05-10

### Login/Registration separation and AppView restructure (`services/appview`, `services/eidproto`)
- **Login without PDS**: `login_account()` is now a pure AppView operation — no PDS call needed. PDS access token is obtained lazily on first record write via stored app password
- **Registration split into 3 phases**: (1) Prepare handle/password/pseudonym, (2) PDS provisioning (`provision_pds_account()` in `participation/provisioning.py`), (3) DB writes + session
- **Removed refresh tokens**: `refresh_token` column dropped from `auth_sessions`. `_ensure_fresh_token()` re-logs in via app password instead of refreshing. Simpler, no long-lived tokens in DB
- **eID verification**: gets a fresh access token before sending to eidproto, no refresh token needed
- **eidproto cleanup**: removed `refresh_token` from API contract, JWT state, and `writeEidRecord()`
- **Renamed**: `login_pds_account()` → `login_account()`, `login.py` split into `login.py` (session) + `register.py` (registration)
- **AppView restructure**: `src/lib/` split into `src/core/` (shared: db, config, email) and `src/participation/` (ATProto: governance, crosspost, peer review, PDS API, provisioning)
- **Routes restructure**: `routes/poltr/` + `routes/review/` merged into `routes/participation/` (ballots.py, reviews.py). `routes/actor/` + `routes/feed/` + `routes/ozone/` merged into `routes/atproto/` (actor.py, feed.py, ozone.py, wellknown.py). Deleted `routes/bluesky/` (dead code). Background loops (`crosspost`, `peer_review`) started via `participation/__init__.py` instead of directly from `core/fastapi.py`

### Ballots moved to CMS (`services/cms`, `services/appview`, `services/indexer`)
- **Ballots are CMS content**: No longer ATProto records. Created and managed in Payload CMS admin UI. New `Ballots` collection with title, description, topic, voteDate, officialRef, language, status
- **Governance account on publish**: `afterChange` hook creates a PDS governance account (`ballot-{id}.id.poltr.ch`) when ballot status changes to "published". Credentials encrypted and stored in AppView `governance_accounts` table
- **AppView proxies CMS**: `ballot.list` and `ballot.get` endpoints now fetch from CMS REST API (`/api/ballots`) and enrich with argument/comment counts from AppView DB
- **Indexer**: Removed `COLLECTION_BALLOT` handler and `app_ballots` DB functions — ballots no longer come from the PDS firehose
- **Bluesky poller rewritten**: Now polls cross-posted **argument** threads instead of ballot threads. Imports external Bluesky replies as comments (`origin = 'extern'`) linked to the argument. Removed ballot-level polling, `getActiveBallots`, `updateBallotBskyCounts`. Optimized: batch-checks reply counts via `getPosts` (25/call) before fetching full threads — only fetches when reply count changed. Age-based frequency: fresh arguments (<48h) polled every cycle, stale arguments every 6th cycle. New `bsky_reply_count` column on `app_arguments`
- **Crosspost simplified**: Removed ballot crossposting (`_crosspost_ballots`). Arguments are cross-posted as standalone Bluesky posts (no longer as replies to a ballot post). Removed `_create_bsky_cross_like`
- **`governance_accounts` moved to `auth` schema**: Table contains encrypted credentials, belongs with `auth_creds`. Indexer gets column-level `SELECT` on `did`, `handle`, `ballot_rkey` only (no access to passwords)
- **CMS new dependencies**: `pg` (PostgreSQL client), `tweetnacl` (NaCl encryption for password storage)
- **CMS new env vars**: `APPVIEW_POSTGRES_URL`, `PDS_INTERNAL_URL`, `PDS_ADMIN_PASSWORD`, `APPVIEW_PDS_CREDS_MASTER_KEY_B64`, `PDS_PUBLIC_HANDLE`

### Security hardening (`services/appview`, `services/front`)
- **Session token hashing**: DB stores `SHA-256(session_token)` instead of plaintext. Cookie has the original. DB leak no longer exposes usable session tokens
- **PDS access token removed from DB**: `access_token` column dropped from `auth_sessions`. Tokens live only in an in-memory cache (1h TTL). DB leak no longer exposes PDS bearer tokens
- **Logout invalidates all sessions**: New `ch.poltr.auth.logout` endpoint deletes all sessions for the user's DID (`DELETE WHERE did = $1`). Logging out on one device logs out all devices
- **Frontend ATProto removal**: Removed `@atproto/api`, `@atproto/oauth-client-browser`, `@atproto/lexicon` dependencies. Deleted OAuth callback, lexicon validation, direct PDS calls. Frontend only communicates with AppView via proxy
- **Removed env vars**: `NEXT_PUBLIC_PDS_URL`, `NEXT_PUBLIC_REDIRECT_URI`, `NEXT_PUBLIC_CLIENT_ID_BASE`, `NEXT_PUBLIC_HANDLE_RESOLVER` — frontend no longer knows about PDS

### Frontend: Home shows ballots, new Profile page (`services/front`)
- **Home page**: Shows current ballots (no archived). Empty state with link to archived ballots
- **Profile page** (`/profile`): Moved from home — pseudonym explanation, DID, handle, eID verification, app password
- **Navigation**: Profile link added to user dropdown menu
- **Default locale**: Changed from `en` to `de`

## 2026-05-09

### Per-ballot governance accounts (`services/appview`, `services/indexer`, `infra`)
- **One PDS account per ballot**: Each ballot (Abstimmungsvorlage) now gets its own governance account on the PDS. The account's repo is a self-contained archive: ballot entry, arguments, review invitations/responses, and Bluesky cross-posts
- **Handle schema**: `ballot-{rkey}.id.poltr.ch`
- **New `governance_accounts` table**: Stores DID, handle, ballot_rkey, and encrypted password (using `APPVIEW_PDS_CREDS_MASTER_KEY_B64`) per ballot account
- **`governance_pds.py` rewritten**: All functions (`create_governance_record`, `put_governance_record`) now require an explicit `did` parameter. Password loaded from DB on-demand. New functions: `create_ballot_account()`, `get_did_for_ballot()`, `get_did_for_ballot_uri()`, `is_governance_did()`
- **Argument creation**: Looks up governance DID from ballot before writing to PDS
- **Review system**: `submit_review` and peer-review invitation loop resolve governance DID from the argument's `did` column
- **Crossposting**: Each ballot's Bluesky cross-posts are made from its own governance account
- **Indexer multi-DID support**: Replaced single `GOVERNANCE_DID` env var with `isGovernanceDid()` set loaded from `governance_accounts` table (refreshed every 60s)
- **Import script updated**: `import_peerreviews.py` now loads credentials from DB via `BALLOT_RKEY` + `DB_URL` + `MASTER_KEY_B64` instead of `GOV_HANDLE`/`GOV_PASSWORD`
- **Removed env vars**: `PDS_GOVERNANCE_ACCOUNT_DID` and `PDS_GOVERNANCE_PASSWORD` removed from K8s secrets, poltr.yaml, and all code
- **Portability**: Ballots can be independently exported, deleted, or moved between PDS instances

## 2026-03-15

### Short code authentication (`services/appview`, `services/front`, `infra`)
- **Short code alongside magic link**: users now receive a 6-character code in the login/registration email as an alternative to clicking the magic link
- **New endpoint `ch.poltr.auth.verifyShortCode`**: accepts `{email, code, purpose}`, with atomic failed-attempt tracking (max 5), constant-time comparison, and rate limiting
- **Updated email template**: shows short code in large monospaced font alongside the existing magic link
- **Frontend code input UI**: added to the "check your email" page with character filtering (no ambiguous chars 0/O/1/I/L), error display with remaining attempts
- **DB schema**: added `short_code` and `failed_attempts` columns to `auth_pending_logins` and `auth_pending_registrations`

### Frontend translations (`services/front`)
- Added multilingual translation support to the frontend

## 2026-03-08

### Argument reimport to governance repo (`infra`)
- **Updated `import_arguments.py`**: arguments are now written to the governance repo (`admin.id.poltr.ch`) with `authorDid` set to a random non-admin user. No longer writes to individual user repos. Simplified auth: uses governance account credentials directly instead of decrypting per-user app passwords
- **New `cleanup_arguments_reimport.sql`**: DB cleanup script that deletes all arguments, comments, review invitations, review responses, and related likes, then resets ballot counts. Run before reimporting
- **Updated `.env`**: governance account set to `admin.id.poltr.ch`

## 2026-03-07

### Immutable pseudonyms — no PDS record (`services/appview`, `services/indexer`)
- **Pseudonyms written directly to `app_profiles`** at registration via `INSERT ... ON CONFLICT DO NOTHING` — no longer stored as PDS record (`app.ch.poltr.actor.pseudonym`)
- **Removed `COLLECTION_PSEUDONYM` from indexer**: firehose events for pseudonym records are ignored. Removed `upsertProfileDb` and `deleteProfile` from `db.js`
- **Immutability**: pseudonym is set once at registration and can never be changed or deleted by the user

### Arguments stored in governance repo (`services/appview`, `services/indexer`, `infra`)
- **Arguments now written to governance PDS repo** instead of individual user repos. The `create_argument` endpoint uses `create_governance_record()` and includes `authorDid` in the record to track the actual author
- **New `author_did` column** on `app_arguments` table — the `did` column now always holds the governance account DID, while `author_did` holds the user who authored the argument
- **Removed dual-record pattern**: dropped `original_uri` and `governance_uri` columns. No more governance copy creation after peer review approval — arguments live in the governance repo from the start
- **Cross-posts under governance account**: argument Bluesky cross-posts are now made from the governance account, not the user's account. Removed user session cache from crosspost loop
- **Updated lexicon** `app.ch.poltr.ballot.argument`: added required `authorDid` field
- **Indexer governance-only filter**: ballots, arguments, and review invitations are only indexed from the governance repo (`PDS_GOVERNANCE_ACCOUNT_DID` env var added to indexer deployment)
- **Migration script**: `infra/scripts/postgres/migrate_arguments_to_governance.sql`
- **Cleanup script**: `infra/scripts/cleanup_user_arguments.py` — deletes old argument records from user repos on the PDS (dry-run by default)

### Immutable peer-review decisions (`services/indexer`, `services/appview`, `infra`)
- **Invitation decisions are immutable**: both positive (`invited: true`) and negative (`invited: false`) decisions are stored. Once created, they can never be overwritten, updated, or deleted
- **Review responses are immutable**: `app.ch.poltr.review.response` records use `ON CONFLICT DO NOTHING` and cannot be soft-deleted. Quorum check only runs on actual new inserts
- **Updated lexicon** `app.ch.poltr.review.invitation`: added required `invited` boolean field
- **DB schema changes**:
  - `app_review_invitations`: added `invited` column, removed `deleted` column, unique index `(argument_uri, invitee_did)` is now unconditional
  - `app_review_responses`: removed `deleted` column, unique index `(argument_uri, reviewer_did)` is now unconditional
- **Indexer**: delete events for invitations and review responses are logged and ignored (no-op)
- **AppView**: peer review loop now creates records for both selected and non-selected users; DB pre-check prevents race conditions on PDS writes
- **Updated doc**: `doc/PEER_REVIEW.md` fully rewritten, `doc/LEXICONS.md` and `doc/ARCHITECTURE.md` updated

## 2026-03-02

### Comment Detail Page + Feed Navigation (`services/front`, `services/appview`)
- **New page `/feed/[id]/comment`** (`services/front/src/app/feed/[id]/comment/page.tsx`): Comment thread detail view. Shows full ancestor chain (compact gray strips, indented per level), focal comment (white bg, blue left border, prominent), and direct replies (full `CommentNode` threading). Reply input at bottom posts as reply to the focal comment. Marks item as seen on navigation
- **New endpoint `GET /xrpc/app.ch.poltr.comment.get`** (`services/appview/src/routes/poltr/__init__.py`): Returns a single comment by AT URI plus its parent argument info (`uri`, `rkey`, `title`, `body`, `type`, `likeCount`, `commentCount`, `reviewStatus`, `ballotRkey`). 404 if deleted or not found
- **New agent function `getComment()`** (`services/front/src/lib/agent.ts`): Wrapper around the new endpoint
- **Replaced inline expansion with page navigation** (`services/front/src/app/feed/[id]/page.tsx`): Clicking a comment/reply card now navigates to `/feed/[id]/comment?uri=…`; clicking an argument/milestone card navigates to `/ballots/[id]`. Removed `expandedUri` state, `handleToggleExpand`, and all inline `ArgumentComments` rendering. Removed `buildThreadTree`, `CommentNode`, `ArgumentComments`, and `ReplyInput` components (now only defined in the comment detail page)

### Activity Tab — Feed View Upgrade (`services/front`, `services/appview`, `infra/scripts/postgres`)
- **New DB table `app_activity_seen`** (`infra/scripts/postgres/db-setup.sql`): Persists per-user seen state for activity items. Primary key `(did, activity_uri)`, indexed on `did`
- **New endpoint `GET /xrpc/app.ch.poltr.activity.list`** (`services/appview/src/routes/poltr/__init__.py`): Returns a paginated, chronological activity feed for a ballot. Uses a CTE UNION of 4 activity types (new_argument, milestone, comment, reply). Supports `filter` (all/comments/arguments), ISO timestamp `cursor` pagination, and viewer context (like state + seen state)
- **New endpoint `POST /xrpc/app.ch.poltr.activity.markSeen`** (`services/appview/src/routes/poltr/__init__.py`): Marks a batch of activity URIs as seen for the authenticated user via `INSERT … ON CONFLICT DO NOTHING`
- **New `ActivityItem` TypeScript type** (`services/front/src/types/ballots.ts`): Covers all 4 activity types with actor, argument, comment, parent, and viewer sub-objects
- **New agent functions `listActivity`, `markActivitySeen`** (`services/front/src/lib/agent.ts`): Thin wrappers around the two new XRPC endpoints
- **Redesigned `/feed/[id]` page** (`services/front/src/app/feed/[id]/page.tsx`): Replaced virtualised argument list with an Activity Tab. Key changes:
  - 4 distinct card types (CommentActivityCard, ReplyActivityCard, NewArgumentActivityCard, MilestoneActivityCard) with colour-coded backgrounds
  - Blue dot unseen indicator + shadow elevation for unseen items
  - ArgumentContextBox reusable component (gray bg, blue left border) for argument context in comment/reply/milestone cards
  - Filter dropdown (All Activity / Arguments / Comments) replaces old PRO/CONTRA filter tabs + sort select
  - Click-to-expand inline comment section per card; marks item as seen on expand (optimistic update + DB persist)
  - "Load More" cursor-based pagination
  - Removed VirtualArgumentFeed and ArgumentCard components

## 2026-02-25

### Sliding Window Session Expiry (`services/appview`)
- **Session now extends on every request** (`src/auth/middleware.py`): Changed from fixed 7-day expiry to sliding window — `expires_at` is reset to `NOW() + APPVIEW_SESSION_LIFETIME_DAYS` on each authenticated request. Users stay logged in as long as they are active within any 7-day window; inactive sessions still expire and require magic-link re-auth

## 2026-02-23

### Peer Review Import & Structural Duplicate Prevention (`infra/scripts`, `services/appview`, `services/front`)
- **Added `import_peerreviews.py`** (`infra/scripts/`): Imports historical peer-review data from Demokratiefabrik xlsx dumps (`content_peerreview.xlsx`, `content_peerreview_progression.xlsx`) into PDS as `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` records on the governance account
  - Reads 99 INSERT peer review procedures and 2,562 individual invitation/response rows
  - Maps old `user_id` to PDS DIDs deterministically via `hash(user_id) % len(users)` (sorted by DID)
  - Scans existing argument records to build `content_id → AT URI` map
  - Uses `putRecord` with composed rkeys (`{content_id}-{did_suffix}`) for idempotent re-runs
  - Maps old binary criteria (0/1) to rating scale (1/5), `response=1` → `APPROVE`, `response=0` → `REJECT`
  - Env vars: `PDS_HOST`, `GOV_HANDLE`, `GOV_PASSWORD`, `BALLOT_URI`, `MAX_RESPONSES`, `DRY_RUN`, `PEERREVIEW_XLSX`, `PROGRESSION_XLSX`
- **Structural duplicate prevention for peer review** (`services/appview/src/lib/governance_pds.py`): Added `put_governance_record()` (upsert with explicit rkey) and `compose_review_rkey()` helper (`{arg_rkey}-{did_suffix}`). Duplicate invitations/responses are now impossible at the PDS level — `putRecord` overwrites rather than creating a second record
- **Refactored invitation creation** (`services/appview/src/lib/peer_review.py`): `_invite_for_argument()` now uses `put_governance_record` with composed rkey instead of `create_governance_record`
- **Refactored review submission** (`services/appview/src/routes/review/__init__.py`): `submit_review()` now uses `put_governance_record` with composed rkey. Existing DB duplicate check remains as fast-path guard
- **Updated lexicon key type** (`services/front/src/lexicons/`): Changed `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` from `"key": "tid"` to `"key": "any"` to allow composed rkeys
- **Updated docs** (`doc/PEER_REVIEW.md`): Documented composed rkey format, structural duplicate prevention mechanism, updated lexicon key types from `tid` to `any`, added import script to implementation files table

### Comment-on-Comment Threading (`infra/scripts`)
- **Added nested reply support to `import_comments.py`**: Previously, comments whose `parent_id` referenced another comment were silently skipped. Now uses two-pass parsing: Pass 1 reads all COMMENT rows into a dict; Pass 2 classifies each as root (parent is argument), nested (parent is another comment), or orphan (skip). Walks up the `parent_id` chain to resolve the root argument AT-URI for nested replies. Topological sort (Kahn's algorithm) ensures parents are created before children on the PDS. Tracks `comment_id → AT-URI` and `comment_id → DID` mappings during import. Sets `record.parent` to the direct parent comment's AT-URI for nested replies. Excludes parent comment's author when randomly assigning users to nested replies
- **Changed `create_comment()` return type**: Now returns the AT-URI string (or `None` on failure) instead of `bool`, enabling parent URI tracking for child comments

### Pseudonym Profile Fix (`services/appview`, `services/front`)
- **Re-enabled pseudonym record write** (`services/appview/src/auth/login.py`): The `app.ch.poltr.actor.pseudonym` PDS record write was commented out — new registrations wrote `app.bsky.actor.profile` but never the pseudonym record that the indexer watches. Re-enabled the write so the indexer populates `app_profiles` (display name, canton, color) on registration. Cast `height` to `int()` since ATProto DAG-CBOR rejects float values
- **Updated pseudonym lexicon** (`services/front/src/lexicons/app.ch.poltr.actor.pseudonym.json`): Changed `height` type from `"number"` to `"integer"` to match DAG-CBOR encoding constraint
- **Backfilled existing users**: Wrote `app.ch.poltr.actor.pseudonym` records for all 5 existing non-admin users from PDS profile + mountain template data, populating `app_profiles` so the feed view shows pseudonym names instead of "Anonym"

### Indexer Hotfix (runtime)
- **Deployed `parent_uri` support via ConfigMap**: The running indexer image (commit `61d7c56`) predated the `parent_uri` column support added in `75ba38f`. Patched the deployment with a ConfigMap volume mount for `db.js` to enable `parent_uri` indexing without a full image rebuild. To be removed after next CI deploy

## 2026-02-22

### Argument/Comment Feed View (`services/front`, `services/appview`, `services/indexer`)
- **Added feed view at `/feed/[id]`** (`services/front/src/app/feed/[id]/page.tsx`): New social-media-style single-column argument feed (max 640px, centered). Each argument renders as a card with colored canton avatar, pseudonym, relative timestamp, PRO/CONTRA pill badge, like toggle with optimistic UI, comment count, and share button. Left accent line (green/red 3px) per argument type
- **Restored classic view at `/ballots/[id]`**: Original 2-column PRO/CONTRA grid preserved as the default ballot detail page. Added "Feed View" button linking to `/feed/[id]`; feed page has "Classic View" button linking back
- **Added threaded inline comments**: Comments load lazily below each argument card. Flat API response is threaded client-side via `parentUri`. Shows first 3 top-level comments + 1 nested reply each, with "Show N more" expand. Smaller sizing for comments (28px avatar, 13px text). External Bluesky comments display handle + butterfly badge
- **Added filter/sort toolbar**: Sticky bar with filter tabs (Alle/Pro/Contra) and sort dropdown (Zufall/Top/Neu/Diskutiert). Re-fetches arguments on change
- **Added inline reply input**: Collapsed "Write a comment..." text input below each argument's comment thread, expands to textarea + Send on focus. Supports threaded replies via parent URI
- **Added "Add Argument" modal**: Overlay with PRO/CONTRA toggle, title input, body textarea, submit button. Creates `app.ch.poltr.ballot.argument` record on PDS
- **Added mobile FAB**: Floating "+" button (bottom-right, brand blue) on screens < 640px, hidden on desktop where toolbar button is shown instead
- **Enhanced `app.ch.poltr.argument.list` endpoint** (`services/appview/src/routes/poltr/__init__.py`): Added `sort` query param (`random`/`top`/`new`/`discussed`), `type` filter (`PRO`/`CONTRA`), and LEFT JOIN on `app_profiles` to include author `displayName`, `canton`, `color` in response
- **Added `app.ch.poltr.comment.list` endpoint** (GET): Returns flat comment list for an argument URI with author profile data (intern via `app_profiles` join, extern via stored handle/display_name), viewer like subquery, and `parentUri` for client-side threading
- **Added `app.ch.poltr.comment.create` endpoint** (POST): Creates comment records on PDS with optional `parent` URI for threaded replies. Validates argument exists
- **Added `app.ch.poltr.argument.create` endpoint** (POST): Creates argument records on PDS. Validates ballot exists and type is PRO/CONTRA
- **Fixed `refreshLikeCount`** (`services/indexer/src/db.js`): Now updates `app_arguments.like_count` and `app_comments.like_count` in addition to `app_ballots.like_count` — previously likes on arguments/comments were indexed but counts never persisted
- **Added `parent_uri` to intern comments** (`services/indexer/src/db.js`): `upsertCommentDb` now reads `record.parent` and stores it in `parent_uri` column, enabling threading for native comments (previously only set for extern Bluesky comments)
- **Updated comment lexicon** (`services/front/src/lexicons/app.ch.poltr.comment.json`): Added optional `parent` property (AT URI format) for threaded replies
- **Expanded `ArgumentWithMetadata.author`** (`services/front/src/types/ballots.ts`): Added `displayName?`, `canton?`, `color?` fields
- **Added `CommentRecord` and `CommentWithMetadata` types** (`services/front/src/types/ballots.ts`)
- **Enhanced `listArguments()`** (`services/front/src/lib/agent.ts`): Added `sort` and `type` params
- **Added API functions** (`services/front/src/lib/agent.ts`): `listComments()`, `createComment()`, `createArgument()`
- **Added `likeContent`/`unlikeContent` aliases** (`services/front/src/lib/ballots.ts`): Aliases for `likeBallot`/`unlikeBallot` (underlying API already accepts any subject URI)
- **Added `formatRelativeTime()`** (`services/front/src/lib/utils.ts`): Returns "jetzt", "5min", "2h", "3d", or falls back to `formatDate()` for older items

## 2026-02-21

### Comments on Arguments (`services/front`, `services/indexer`, `infra/scripts`)
- **Added lexicon** (`services/front/src/lexicons/app.ch.poltr.comment.json`): New `app.ch.poltr.comment` record type with `title`, `body`, `argument` (AT-URI reference to parent argument), and `createdAt`
- **Added `title` column** to `app_comments` table (`infra/scripts/postgres/db-setup.sql`)
- **Added indexer support** (`services/indexer/src/record_handler.js`, `services/indexer/src/db.js`): Handles `app.ch.poltr.comment` create/update/delete events from firehose — `upsertCommentDb()` (derives `ballot_uri`/`ballot_rkey` from parent argument, origin `'intern'`), `markCommentDeleted()`; both refresh `comment_count` on the parent `app_arguments` row via `refreshCommentCount()`
- **Added `import_comments.py`** (`infra/scripts/`): Imports COMMENT entries from `dump/content.xlsx` into PDS as `app.ch.poltr.comment` records
  - Scans existing arguments to resolve `parent_id` (xlsx) → argument AT URI
  - Assigns comments to random non-admin PDS users; reuses same account on re-import
  - Uses `putRecord` with deterministic rkeys (xlsx row id) for idempotent re-imports
  - Same env vars as `import_arguments.py`: `PDS_HOST`, `PDS_ADMIN_PASSWORD`, `BALLOT_URI`, `MAX_IMPORTS`, `XLSX_PATH`, `INDEXER_POSTGRES_URL`, `APPVIEW_PDS_CREDS_MASTER_KEY_B64`
- **Updated docs** (`doc/LEXICONS.md`): Added `app.ch.poltr.comment` record documentation; updated data hierarchy diagram

### Ballot-level Counts (`services/indexer`, `infra/scripts`)
- **Added `argument_count` and `comment_count` columns** to `app_ballots` table (`infra/scripts/postgres/db-setup.sql`)
- **Added indexer refresh functions** (`services/indexer/src/db.js`): `refreshBallotArgumentCount()` called on argument create/delete; `refreshBallotCommentCount()` called on comment create/delete

## 2026-02-20 (Peer Review)

### Peer-Review System for Arguments (`services/appview`, `services/indexer`, `services/front`, `infra`)

Community-driven quality gate for user-submitted arguments. Arguments start as "preliminary", undergo probabilistic peer-review by active users, and if approved, get republished as exact copies to the governance account's PDS. Controlled by `APPVIEW_PEER_REVIEW_ENABLED` feature flag (default: off). See `doc/PEER_REVIEW.md` for the full design.

- **Database schema** (`infra/scripts/postgres/db-setup.sql`): Added `review_status`, `original_uri`, `governance_uri` columns to `app_arguments`; created `app_review_invitations` and `app_review_responses` tables with unique constraints and indexes
- **Lexicons** (`services/front/src/lexicons/`): Added `app.ch.poltr.review.invitation` and `app.ch.poltr.review.response` record schemas
- **Secrets** (`infra/kube/secrets.yaml.dist`): Added `APPVIEW_PEER_REVIEW_ENABLED`, `APPVIEW_PEER_REVIEW_QUORUM`, `APPVIEW_PEER_REVIEW_INVITE_PROBABILITY`, `APPVIEW_PEER_REVIEW_POLL_INTERVAL_SECONDS`, `APPVIEW_PEER_REVIEW_CRITERIA` to appview-secrets; added `APPVIEW_PEER_REVIEW_QUORUM` to indexer-secrets
- **Indexer** (`services/indexer/src/`): Added firehose handlers for `review.invitation` and `review.response` collections; modified `upsertArgumentDb` to derive initial `review_status` from `originalUri` field; added post-index quorum check in `upsertReviewResponseDb` — updates `review_status` to `approved`/`rejected` when decision formula is met
- **Governance PDS helper** (`services/appview/src/lib/governance_pds.py`): Extracted shared governance session management from crosspost.py; added `create_governance_record()` helper used by crosspost, peer-review invitations, and governance copy creation
- **Peer-review background loop** (`services/appview/src/lib/peer_review.py`): Two responsibilities per poll cycle: (1) invite eligible active users for preliminary arguments with configurable probability, (2) create governance PDS copies for newly approved arguments (where indexer set `review_status = 'approved'` but `governance_uri` is not yet set)
- **Review endpoints** (`services/appview/src/routes/review/__init__.py`): 4 XRPC endpoints — `review.pending` (list invitations for user), `review.submit` (write review to governance PDS; quorum check happens in indexer via firehose), `review.status` (vote counts + quorum progress; author sees individual feedback), `review.criteria` (configurable criteria list from env)
- **Modified argument listing** (`services/appview/src/routes/poltr/__init__.py`): Added `reviewStatus` to response when peer review is enabled; filters rejected arguments to author-only visibility; when `APPVIEW_PEER_REVIEW_ENABLED=false`, omits `reviewStatus` and shows all arguments without filtering
- **Modified crosspost** (`services/appview/src/lib/crosspost.py`): Refactored to use shared `governance_pds.py`; preliminary arguments cross-posted with `[Preliminary]` prefix under author (only when peer review enabled); approved governance copies cross-posted under governance account
- **Frontend types** (`services/front/src/types/ballots.ts`): Added `ReviewCriterion`, `ReviewCriterionRating`, `ReviewInvitation`, `ReviewStatus`, `ReviewResponse` interfaces; added `reviewStatus` to `ArgumentWithMetadata`
- **Frontend API** (`services/front/src/lib/agent.ts`): Added `getReviewCriteria()`, `getPendingReviews()`, `submitReview()`, `getReviewStatus()`
- **Frontend UI** (`services/front/src/app/`): Added review status badges (amber "Preliminary", green "Peer-reviewed", red "Rejected") on argument cards in ballot detail; created `/review` dashboard page with criteria rating sliders (1–5), approve/reject toggle, justification textarea; added Peer Review navigation button

## 2026-02-20

### Ballot Arguments (`services/indexer`, `services/front`, `infra/scripts`)
- **Added lexicon** (`services/front/src/lexicons/app.ch.poltr.ballot.argument.json`): New `app.ch.poltr.ballot.argument` record type with `title`, `body`, `type` (PRO/CONTRA), `ballot` (AT-URI reference), and `createdAt`
- **Added `app_arguments` table** (`infra/scripts/postgres/db-setup.sql`): Stores arguments with `ballot_uri`/`ballot_rkey` foreign references, `bsky_post_uri`/`bsky_post_cid` for cross-posts, `like_count`, `comment_count`, soft-delete support; indexed on `ballot_uri`, `ballot_rkey`, `did`, `type`
- **Added indexer support** (`services/indexer/src/record_handler.js`, `services/indexer/src/db.js`): Handles `app.ch.poltr.ballot.argument` create/update/delete events from firehose — `upsertArgumentDb()`, `markArgumentDeleted()` (returns bsky_post_uri for cleanup)

### Argument Cross-Posting to Bluesky (`services/indexer`)
- **Added `createBskyArgumentPost()`** (`services/indexer/src/pds_client.js`): Posts arguments as `app.bsky.feed.post` replies to the ballot's cross-posted Bluesky post. Authenticates as the argument author (not governance) using stored app passwords from `auth.auth_creds`
- **Added `deleteBskyPost()`** (`services/indexer/src/pds_client.js`): Deletes cross-posts by extracting the DID from the AT-URI and authenticating as that user; falls back to governance account for older posts
- **Added DB helpers** (`services/indexer/src/db.js`): `getArgumentBskyPostUri()`, `setArgumentBskyPostUri()` for tracking argument cross-post URIs
- **Wired up cross-post lifecycle** (`services/indexer/src/record_handler.js`): On argument create, cross-posts as reply if ballot has a Bluesky post; on argument delete, removes the cross-post

### Argument Import Script (`infra/scripts`)
- **Added `import_arguments.py`**: Imports PRO/CONTRA arguments from `dump/content.xlsx` into PDS as `app.ch.poltr.ballot.argument` records
  - Assigns arguments to random non-admin PDS users to simulate real platform behaviour
  - Authenticates using stored app passwords from `auth.auth_creds` (no `updateAccountPassword` — preserves credentials)
  - Uses `putRecord` with deterministic rkeys (xlsx row id) for idempotent re-imports
  - Scans all repos for existing arguments before import to reuse the same account on re-import (prevents duplicates)
  - Env vars: `PDS_HOST`, `PDS_ADMIN_PASSWORD`, `BALLOT_URI`, `MAX_IMPORTS`, `XLSX_PATH`, `INDEXER_POSTGRES_URL`, `APPVIEW_PDS_CREDS_MASTER_KEY_B64`
- **Updated `import_proposals.py`**: Added `BALLOT_ANR` env var to import a single ballot by BFS number

### Indexer Auth Access (`infra/scripts/postgres/db-setup.sql`)
- **Granted indexer read access to `auth.auth_creds`**: Required for decrypting user app passwords for Bluesky cross-posts (`GRANT USAGE ON SCHEMA auth TO indexer; GRANT SELECT ON auth.auth_creds TO indexer`)

## 2026-02-16

### Bluesky Feed Generator (`services/appview`, `infra/kube`)
- **Added `app.bsky.feed.getFeedSkeleton` endpoint** (`src/routes/feed/__init__.py`): Returns a skeleton of cross-posted ballot post URIs for the poltr feed. Queries `app_ballots` for rows with `bsky_post_uri IS NOT NULL AND NOT deleted`, ordered by `created_at DESC`. Uses composite `created_at::rkey` cursor for stable pagination. Validates feed URI, supports `limit` (1–100, default 50) and `cursor` params.
- **Added `app.bsky.feed.describeFeedGenerator` endpoint** (`src/routes/feed/__init__.py`): Returns the feed generator DID (`did:web:app.poltr.info`) and the poltr feed URI
- **Updated `/.well-known/did.json`** (`src/wellknown.py`): Added `BskyFeedGenerator` service entry so Bluesky can discover the feed generator at `https://app.poltr.info`
- **Added `APPVIEW_FEED_GENERATOR_DID`** to `appview-secrets` (`infra/kube/secrets.yaml`): Defaults to `did:web:app.poltr.info`
- **Manual step required**: Create `app.bsky.feed.generator` record (rkey `poltr`) in governance account repo on PDS — see `doc/BLUESKY_FEED.md`

## 2026-02-15b

### Bluesky Cross-Post Fix (`services/indexer`, `services/appview`)
- **Fixed cross-post not triggering**: `PDS_GOVERNANCE_ACCOUNT_DID` and `PDS_GOVERNANCE_PASSWORD` were missing/wrong in both K8s secrets and local `.env` — updated to match `admin.id.poltr.ch` (`did:plc:3ch7iwf6od4szklpolupbv7o`)
- **Fixed TID rkey format**: Switched `upsertBskyPost` from `putRecord` (plain rkey) to `createRecord` (auto-generated TID rkey). Bluesky's AppView only indexes `app.bsky.feed.post` records with TID-format rkeys
- **Upsert support for cross-posts**: On ballot update, deletes the previous cross-post and creates a new one; passes `existingPostUri` from DB to avoid orphaned posts
- **Added `bsky_post_uri` column** to `app_ballots` (was missing from live DB, already in `db-setup.sql`)
- **AppView session re-login fallback** (`src/lib/atproto_api.py`): When both access and refresh tokens are expired, `_ensure_fresh_token` now falls back to re-authenticating using the encrypted PDS password stored in `auth_creds` instead of failing with "Failed to refresh session"

## 2026-02-15

### Bluesky Cross-Likes (`services/appview`, `services/indexer`)
- **New `_create_bsky_cross_like()` function** (`src/routes/poltr/__init__.py`): When a user likes a ballot entry on POLTR, automatically creates a corresponding `app.bsky.feed.like` on Bluesky targeting the cross-posted Bluesky post (best-effort, non-blocking)
- **Updated unlike endpoint**: Deletes the mirrored Bluesky like when user unlikes on POLTR
- **Added `bsky_post_cid` column** to `app_ballots` (`db-setup.sql`): Stores CID of cross-posted Bluesky post (needed for like targeting)
- **Added `bsky_like_uri` column** to `app_likes` (`db-setup.sql`): Tracks mirrored Bluesky like URI for deletion on unlike
- **Updated indexer cross-post** (`pds_client.js`, `record_handler.js`, `db.js`): Now stores both URI and CID when cross-posting ballot entries to Bluesky

### AppView Token Refresh Refactor (`services/appview`)
- **New `_ensure_fresh_token()` helper** (`src/lib/atproto_api.py`): Extracted duplicate PDS token refresh logic into reusable function. Now used by `pds_create_app_password()`, `pds_create_record()`, and `pds_delete_record()`

### Account Limit Enforcement (`services/appview`)
- **New `MAX_PDS_ACCOUNTS` config** (`src/config.py`): Environment variable (default: 50) to cap account creation. Bluesky relay throttles at 100 accounts per PDS hostname
- **Updated `create_account()`** (`src/auth/login.py`): Returns 503 `"account_limit_reached"` when limit hit

### Indexer Backfill Rewrite (`services/indexer`)
- **Rewrote `runBackfill()`** (`src/backfill_handler.js`): Replaced multi-batch iterator with single-pass idle-timeout approach using Firehose + MemoryRunner. Runs until no new events for `BACKFILL_IDLE_TIMEOUT_SEC` (default 10s), then auto-cleans up
- **Added MemoryRunner to main firehose** (`src/main.js`): Cursor now persisted on every event via `runner.setCursor()`. Removed manual workaround for `@bluesky-social/sync` getCursor bug
- **Added `/health` endpoint** (`src/main.js`): Returns firehose connection state and current cursor
- **Added `FIREHOSE_ENABLED` env var**: Can disable firehose for testing
- **Updated dependencies** (`package-lock.json`): Express 4.22.1, Fastify 5.7.4, body-parser 1.20.4

### Removed Unused Ballot Embed Lexicon (`services/front`)
- **Deleted `app.ch.poltr.ballot.embed.json`**: Unused lexicon schema — cross-posting uses `app.bsky.embed.external` (link cards) instead
- **Cleaned up** `src/lib/lexicons.ts`, `src/types/ballots.ts`: Removed related types and validation functions

### Test Registration Script (`infra/scripts`)
- **Added `test_registration.py`**: Step-by-step diagnostic tool that creates a test account, traces the full federation chain (PDS → PLC → relay → Bluesky AppView), identifies exactly where the chain breaks, with interactive pauses and automatic cleanup

### Documentation
- **Added `doc/pds-relay-probleme.md`** (German): Operational runbook covering three PDS-relay failure modes — throttling on first boot (race condition), sequence gap after reset, and throttling risk on restore
- **Updated `doc/FEDERATION.md`**: Removed `app.ch.poltr.ballot.embed`, documented cross-likes to Bluesky
- **Updated `doc/BALLOTS.md`**: Documented cross-post and cross-like behavior
- **Updated `doc/LEXICONS.md`**: Removed `app.ch.poltr.ballot.embed` section
- **Updated `CLAUDE.md`**: Added "PDS — Critical: Do Not Break Relay Federation" safety section

### Misc
- **Updated `infra/scripts/import_proposals.py`**: Removed 1-year date filter — now imports all historical ballots

## 2026-02-14

### PDS Rename: `pds.poltr.info` → `pds2.poltr.info`
- **Context**: The hostname `pds.poltr.info` is permanently throttled on the Bluesky relay (`bsky.network`). Throttling is hostname-based and cannot be fixed from our side. Renaming to `pds2.poltr.info` gives a clean relay reputation.
- **Updated code defaults** (11 files): All hardcoded `pds.poltr.info` references updated to `pds2.poltr.info` in appview config, auth routes, frontend pages/Dockerfile/.env, indexer service/Dockerfile, pds_reset.py, test_registration.py, and GitHub Actions workflow.
- **Updated K8s manifests**: `PDS_HOSTNAME` in `secrets.yaml.dist` (pds-secrets + indexer-secrets), Ingress host in `poltr.yaml`.
- **Updated documentation**: Bulk replaced `pds.poltr.info` → `pds2.poltr.info` across CLAUDE.md, README.md, FEDERATION.md, DOMAINS.md, ARCHITECTURE.md, bluesky-interoperability.md, pds-relay-probleme.md.
- **What does NOT change**: K8s service name `pds`, internal URL `http://pds.poltr.svc.cluster.local`, PVC name `pds-data`, TLS cert (`*.poltr.info` wildcard).
- **Manual steps required**: Generate new `did:plc` via `pds_reset.py`, K8s reset procedure, DNS update (`*.id.poltr.ch` CNAME → `pds2.poltr.info`), rebuild frontend Docker image.

## 2026-02-13

### PDS Hard Reset Script (`infra/scripts`)
- **Added `pds_reset.py`** (`infra/scripts/pds_reset.py`): Two-mode script for PDS identity reset. Mode 1 (default): generates new secp256k1 key pair, derives `did:key`, builds and signs PLC genesis operation (DAG-CBOR + SHA-256 + secp256k1), computes `did:plc`, registers at `plc.directory`, and prints new secret values, K8s reset checklist, and DB cleanup SQL. Mode 2 (`--verify`): post-reset verification that checks PDS health, `describeServer`, PLC resolution, `requestCrawl`, creates a test account, writes a profile, and — critically — verifies the relay reports `active: true` (not throttled). Cleanup deletes the test account.
- **Context**: All 22 existing accounts were permanently `RepoInactive: throttled` by the Bluesky relay, creating broken stubs on the Bluesky AppView (`createdAt: 0001-01-01`). A new PDS server DID with clean relay reputation is required.

### Bluesky Federation Fix (`services/appview`)
- **Added relay repo indexing barrier** (`src/lib/atproto_api.py`): New `wait_for_relay_repo_indexed()` polls `bsky.network/xrpc/com.atproto.sync.getLatestCommit` until the relay confirms it has indexed the repo commit (up to 30s). This is the critical fix: the Bluesky AppView creates permanent broken stub entries when it processes an `#identity` event before the corresponding repo commit (containing the profile record) is available on the relay.
- **Added PLC resolution barrier** (`src/lib/atproto_api.py`): New `wait_for_plc_resolution()` polls plc.directory until the DID is resolvable (up to 10s) before writing records.
- **Added handle-toggle workaround** (`src/lib/atproto_api.py`): New `pds_admin_toggle_handle()` forces a second `#identity` event on the PDS firehose after account creation, giving the AppView a second chance to index the account (see [atproto#4379](https://github.com/bluesky-social/atproto/discussions/4379))
- **Updated registration flow** (`src/auth/login.py`): After `createAccount`, the flow now: (1) waits for PLC resolution, (2) writes minimal + full profile records, (3) requests relay crawl, (4) **waits for relay to confirm repo is indexed**, (5) only then toggles handle to emit the `#identity` event — ensuring the AppView sees the repo data before processing the identity event
- **Fixed relay rev comparison** (`src/lib/atproto_api.py`, `src/auth/login.py`): `wait_for_relay_repo_indexed()` now compares commit revs instead of just checking for any 200 response. Previously, the relay could return 200 for an older commit (from initial account creation, before the profile was written), causing the handle toggle to fire while the relay still lacked the profile data. Now `pds_put_record()` returns the commit rev, and the relay wait verifies the relay has that exact rev or newer before proceeding.

## 2026-02-12

### Bluesky Cross-Post for Ballot Entries (`services/indexer`)
- **Added PDS client module** (`services/indexer/src/pds_client.js`): Authenticates as the governance account on the PDS and creates `app.bsky.feed.post` records with `app.bsky.embed.external` embedding a link card back to POLTR
- **Updated record handler** (`services/indexer/src/record_handler.js`): On new `app.ch.poltr.ballot.entry` from the governance DID, auto-creates a corresponding Bluesky post (non-blocking — indexing continues on failure)
- **Added `bsky_post_uri` column** (`infra/scripts/postgres/db-setup.sql`, `services/indexer/src/db.js`): Tracks cross-posted Bluesky post URIs on `app_ballots` to prevent duplicates
- **New env vars**: `PDS_INTERNAL_URL`, `PDS_GOVERNANCE_ACCOUNT_DID`, `PDS_GOVERNANCE_PASSWORD`, `FRONTEND_URL`
- **Updated K8s secrets** (`infra/kube/secrets.yaml.dist`): Added `PDS_GOVERNANCE_ACCOUNT_DID` to `pds-secrets`; added `PDS_GOVERNANCE_PASSWORD` and `FRONTEND_URL` to `indexer-secrets`
- **Updated indexer deployment** (`infra/kube/poltr.yaml`): Indexer now pulls `PDS_INTERNAL_URL` and `PDS_GOVERNANCE_ACCOUNT_DID` from `pds-secrets`

### Handle Domain Migration (`id.poltr.ch`)
- **Added TLS certificate for `*.id.poltr.ch`** (`infra/cert/cert-manager-wildcard.yaml`): New Certificate resource using DNS-01 challenge via existing `letsencrypt-prod-dns` ClusterIssuer
- **Added Ingress TLS + routing for `*.id.poltr.ch`** (`infra/kube/poltr.yaml`): New TLS entry with `poltr-handle-tls` secret; new host rule routing `*.id.poltr.ch` to PDS (placed before `*.poltr.info` catch-all)
- **Updated `PDS_SERVICE_HANDLE_DOMAINS`** (`infra/kube/secrets.yaml`, `secrets.yaml.dist`): Changed from `.poltr.info` to `.id.poltr.ch` — new accounts get `@user.id.poltr.ch` handles
- **Manual steps required**: DNS CNAME `*.id.poltr.ch → pds.poltr.info` must be created in Infomaniak Panel; existing accounts need handle migration

## 2026-02-11

### Indexer Fixes (`services/indexer`)
- **Added `getCursor` to firehose subscription** (`src/main.js`): Firehose now resumes from last known cursor on restart, preventing missed events during pod downtime
- **Fixed graceful shutdown** (`src/main.js`): Changed `firehose.stop()` to `firehose.destroy()` to match the `@bluesky-social/sync` API

### Pseudonymization (`app.ch.poltr.actor.pseudonym`)
- **Added lexicon schema** (`services/front/src/lexicons/app.ch.poltr.actor.pseudonym.json`): New record type for pseudonymous identities with `displayName`, `mountainName`, `mountainFullname`, `canton`, `height`, `color`, and `createdAt`
- **Added `auth.mountain_templates` table** (`infra/scripts/postgres/db-setup.sql`): Seed/reference table with 4,294 Swiss mountains (name, fullname, canton, height >= 2,000m)
- **Added `app_profiles` table** (`infra/scripts/postgres/db-setup.sql`): Ephemeral indexed table keyed by DID, stores pseudonym data from firehose
- **Added mountain seed data** (`infra/scripts/postgres/seed-mountains.sql`): 4,294 INSERT statements generated from `doc/templates/berge_vorlage.xlsx`; generator script at `infra/scripts/postgres/seed-mountains.py`
- **Rewrote pseudonym generator** (`services/appview/src/auth/pseudonym_generator.py`): `generate_pseudonym()` draws random mountain from DB, generates random letter (A-Z) and luma-constrained hex color
- **Added PDS write functions** (`services/appview/src/lib/atproto_api.py`): `pds_set_profile()` writes `app.bsky.actor.profile` with displayName; `pds_write_pseudonym_record()` writes `app.ch.poltr.actor.pseudonym` record via `com.atproto.repo.putRecord`
- **Integrated in account creation** (`services/appview/src/auth/login.py`): `create_account()` now generates pseudonym, writes profile + pseudonym records to PDS, and passes displayName to session cookie
- **Added indexer support** (`services/indexer/src/record_handler.js`, `services/indexer/src/db.js`): Handles `app.ch.poltr.actor.pseudonym` events from firehose — `upsertProfileDb()` on create/update, `deleteProfile()` on delete
- **Added documentation** (`doc/PSEUDONYMIZATION.md`): Describes concept, architecture, database schema, ATProto lexicon, and data flow

## 2026-02-10

### Ballot Likes Feature (`app.ch.poltr.ballot.like`)
- **Added Lexicon schema** (`services/front/src/lexicons/app.ch.poltr.ballot.like.json`): New record type for liking ballot entries, with `subject` (uri + cid) and `createdAt` fields
- **Added `app_likes` table** (`infra/scripts/postgres/db-setup.sql`): Stores individual likes with `uri`, `cid`, `did`, `subject_uri`, `subject_cid`, soft-delete support; indexed on `subject_uri` and `did`
- **Added `like_count` column to `app_ballots`**: Denormalized count for fast reads, maintained by the indexer
- **Added indexer DB helpers** (`services/indexer/src/db.js`): `upsertLikeDb`, `markLikeDeleted`, `refreshLikeCount` — upsert/delete likes and recount after each mutation
- **Updated record handler** (`services/indexer/src/record_handler.js`): Routes `app.ch.poltr.ballot.like` events to like helpers, `app.ch.poltr.ballot.entry` to ballot helpers, ignores other collections
- **Updated AppView API** (`services/appview/src/routes/poltr/__init__.py`): `app.ch.poltr.ballot.list` now returns `likeCount` from the denormalized column and `viewer.liked` (boolean) via an `EXISTS` subquery against the authenticated user's DID

## 2026-02-07

### services/front
- **Moved auth calls server-side via Next.js API routes**: Session token now lives in an `httpOnly` cookie instead of `localStorage`, eliminating XSS exposure
- **Added `api/auth/verify-login/route.ts`**: Proxies login verification to AppView, sets session as `httpOnly` cookie
- **Added `api/auth/verify-registration/route.ts`**: Same pattern for registration verification
- **Added `api/auth/logout/route.ts`**: Clears the `poltr_session` cookie
- **Added `api/auth/session/route.ts`**: Session validity check for AuthContext hydration
- **Added `api/xrpc/[...path]/route.ts`**: Catch-all XRPC proxy — forwards all AppView calls server-side, reads `poltr_session` cookie and sends as `Authorization: Bearer` header
- **Updated all client pages**: `page.tsx`, `verify-login`, `register`, `verify-registration` now use relative `/api/...` URLs instead of direct AppView calls
- **Updated `lib/agent.ts`**: All XRPC calls (`listProposals`, `createAppPassword`, `initiateEidVerification`) route through `/api/xrpc/...` proxy; removed `localStorage` session token logic
- **Updated `lib/AuthContext.tsx`**: On mount verifies session via `/api/auth/session`; logout calls `/api/auth/logout`; removed all `session_token` localStorage references
- **`APPVIEW_URL` server-only env var**: API routes use `APPVIEW_URL` with fallback to `NEXT_PUBLIC_API_URL` for local dev compatibility
- **Hardened `RichText` component**: Whitelisted heading tags to `h1`–`h6` (prevents arbitrary tag injection), restricted link `href` to `http(s)://`, `mailto:`, `tel:`, and relative paths (blocks `javascript:` URIs)
- **Extracted `useAppPassword` hook**: Moved app password state and logic from `home/page.tsx` to `lib/useAppPassword.ts`
- **Reorganized auth pages under `app/auth/`**: Moved `register`, `verify-login`, `verify-registration`, `magic-link-sent`, `callback` into `auth/` subfolder (URLs now `/auth/...`); updated all internal links and import paths
- **Updated `README.md`**: Rewrote project structure, documented `app/auth/` vs `app/api/auth/` distinction, corrected tech stack (was still referencing Vite/Nginx)

- **Fixed `lib/proposals.ts`**: Changed `sessionStorage.getItem('user')` to `localStorage.getItem('poltr_user')` — `createProposal`, `deleteProposal`, `updateProposal` were broken
- **Cleaned up Dockerfile**: Removed hardcoded env defaults, removed `NEXT_PUBLIC_API_URL` (no longer used client-side); `NEXT_PUBLIC_*` build args now passed from CI
- **Untracked `.env.local` from git**: Added `**/.env.*` to `.gitignore`, kept `!**/.env.example`

### services/appview
- **Updated email template links**: Magic link URLs now point to `/auth/verify-login` and `/auth/verify-registration`

### CI/CD
- **Added `NEXT_PUBLIC_*` build args to GitHub Actions**: Frontend Docker build now receives public env vars (redirect URI, client ID base, PDS URL, handle resolver) via `build-args`

### Infrastructure
- **Added `APPVIEW_URL` to `front-secrets`**: Runtime server-only env var for API route proxying to AppView
- **Restructured repo root**: Consolidated `k8s/`, `setup/`, `issues/` into `infra/` with subfolders (`kube/`, `cert/`, `deployer/`, `scripts/`, `openstack/`); moved docs to `doc/`; renamed `ARCHIV` to `archive`
- **Removed root `package.json`/`node_modules`**: Unused workspace root with only `concurrently` devDependency
- **Cleaned up `.gitignore`**: Updated all paths for new structure; ignored entire `infra/openstack/` directory

### Documentation
- **Rewrote root `README.md`**: Updated repo structure, services table, doc links, quick start (was still referencing Vite, broken links to moved files)
- **Updated `doc/TODO.md`**: Moved completed items (CMS, backfill, auth, etc.) to Done section
- **Updated `doc/ARCHITECTURE.md`**: Added server-side auth proxy to frontend section, data flow, and security notes
- **Updated `CLAUDE.md`**: Fixed frontend tech stack (Next.js, not Vite)

## 2026-02-05

### Infrastructure: Load Balancer Removal
- **Switched from OpenStack LoadBalancer to hostPort**: ingress-nginx now binds directly to ports 80/443 on the node via hostPort, eliminating the OpenStack LB
- **Assigned floating IP to node**: `83.228.203.147` moved from LB to node `ext1-pck-uvgx6be-pjt-pwlbk-g6tz7`
- **Added security group rules**: Opened TCP 80 and 443 on the node's security group for public access
- **Cost savings**: ~10 CHF/month (from ~17 to ~7 CHF/month)
- **Added `doc/LOAD_BALANCING.md`**: Documents current dev/test setup and go-live restore procedure with all OpenStack resource IDs

### services/front
- **Fixed RichText build error**: Changed `JSX.IntrinsicElements` to `React.JSX.IntrinsicElements` in `src/components/RichText.tsx` (React 19 namespace change)
- **CMS connectivity fix**: `CMS_INTERNAL_SERVER_URL` must use internal K8s service name (`http://cms.poltr.svc.cluster.local`) for server-side CMS fetches from within the cluster

### k8s/poltr.yaml
- **Added CMS service**: Deployment, Service, and Ingress for Payload CMS at `cms.poltr.info`
- **Updated ingress**: Added `cms.poltr.info` host rule

### Documentation
- **Rewrote `doc/ARCHITECTURE.md`**: Updated with all 10 services (added CMS, Ozone, Ozone Redis, Verifier, eID Proto), ingress routing table, internal service DNS, PVCs, secrets, ConfigMaps, CronJobs
- **Updated frontend tech stack**: Corrected from React+Vite+Nginx to Next.js 16 + standalone Node.js

## 2026-02-04

### services/front
- **Embedded CMS into frontend**: Added `[slug]/page.tsx` catch-all route for CMS pages with `generateStaticParams` for SSG
- **Added CMS client library** (`src/lib/cms.ts`): Fetches pages, blocks, media, settings from Payload CMS with ISR (60s revalidation)
- **Added RichText renderer** (`src/components/RichText.tsx`): Lightweight Lexical JSON renderer for Payload CMS content (bold, italic, headings, lists, links, images, quotes)

### services/cms
- **Fixed CMS pod**: Corrected deployment configuration and health checks

## 2026-02-03

### services/cms (NEW)
- **Set up Payload CMS 3.x**: Headless CMS for managing frontend content
- **Collections**:
  - `Users` - Admin authentication
  - `Media` - Image/file uploads with alt text
  - `Pages` - Full pages with title, slug, rich text content, SEO metadata, draft/published status
  - `Blocks` - Reusable content blocks for homepage, header, footer, sidebar, banner, modal placements
- **Stack**: Payload 3.74.0, Next.js 15.4.11, React 19, PostgreSQL (shared database)
- **Port**: Runs on port 3002

### services/front
- **Refactored to Next.js**: Migrated frontend from Vite/React to Next.js App Router
- **Added CMS client** (`src/lib/cms.ts`): API helper for fetching pages, blocks, media, and settings from Payload CMS
- **ISR support**: Content cached with 60-second revalidation

### services/appview
- **Restructured API routes**: Reorganized XRPC endpoint handlers for better maintainability

## 2026-02-02

### Ozone Moderation Service
- **Fixed handle verification**: Added Ingress path routing for `/.well-known/atproto-did` to PDS for `ozone.poltr.info`
- **Created new moderation account**: `moderation.poltr.info` (`did:plc:5ecl3anpfxtmn2szxsm2mjhf`)
- **Registered labeler service**: Added `#atproto_labeler` service to DID via PLC operation
- **Updated OZONE_SERVER_DID**: Changed from `did:web:ozone.poltr.info` to `did:plc:5ecl3anpfxtmn2szxsm2mjhf`
- **Updated OZONE_ADMIN_DIDS**: Added moderation account to admin list
- **Deleted old account**: Removed `ozone.poltr.info` from PDS

### k8s/poltr.yaml
- **Added `.well-known/atproto-did` routing**: For `ozone.poltr.info`, routes handle verification requests to PDS while other requests go to Ozone service

### Documentation
- **Added `doc/CREATE_MODERATION_ACCOUNT.md`**: Step-by-step guide for creating Ozone moderation accounts with PLC operations

## 2026-01-29

### services/eidproto
- **Fixed Dockerfile**: Changed from `npm ci` to `pnpm install` since the project uses pnpm as package manager
- **Generated `pnpm-lock.yaml`**: Required for reproducible builds

### services/appview
- **Added Bluesky proxy** (`src/bsky_proxy.py`): Forwards `app.bsky.*` XRPC requests to Bluesky's upstream AppView (`api.bsky.app`), allowing the AppView to extend Bluesky while maintaining compatibility
- **Added birthDate to account creation**: Set to `1970-01-01` by default for Bluesky compatibility (required field for age verification)
- **Implemented admin account creation flow**:
  - Added `_pds_admin_create_invite_code()` helper function
  - Updated `pds_api_admin_create_account()` to first generate a single-use invite code via admin auth, then create the account with that code
  - Uses internal K8s URL (`http://pds.poltr.svc.cluster.local`) for admin operations
  - This works with `PDS_INVITE_REQUIRED=true` on the PDS
- **Fixed birthDate preference for Bluesky compatibility**:
  - Added `set_birthdate_on_bluesky()` function to set birthDate on Bluesky's AppView
  - Called automatically when user creates an App Password (= wants to use Bluesky)
  - Uses correct preference type: `app.bsky.actor.defs#personalDetailsPref` (not `#birthDate`)
  - Format: `"1970-01-01T00:00:00.000Z"` (ISO with time)
  - Checks if birthDate already exists before setting
- **Fixed user session response**: Now returns full user object with `did`, `handle`, `displayName` instead of just DID string
- **Fixed frontend VerifyMagicLink**: Changed from `data.user.email` to `data.user.did`

### k8s/secrets.yaml.dist
- **Updated PDS AppView config**: Changed from custom AppView to Bluesky's official AppView for federation:
  ```yaml
  PDS_BSKY_APP_VIEW_URL: "https://api.bsky.app"
  PDS_BSKY_APP_VIEW_DID: "did:web:api.bsky.app"
  ```

### Documentation
- **Added `issues/bluesky-interoperability.md`**: Documents the birthDate/age verification problem with Bluesky, including hardcoded AppView DIDs, attempted solutions, and the final working approach

### Architecture Notes
- **PDS config** points to Bluesky's AppView (`api.bsky.app`) so official Bluesky clients work
- **Custom frontend** can call `app.poltr.info` directly for poltr-specific features (`app.ch.poltr.*`)
- **AppView proxy** forwards standard Bluesky requests upstream while handling custom routes locally
- **birthDate flow**: Account on own PDS → App Password creation → birthDate set on Bluesky → User can login to Bluesky without age prompt
