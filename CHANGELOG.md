# Changelog

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
- **CMS connectivity fix**: `CMS_URL` must use internal K8s service name (`http://cms.poltr.svc.cluster.local`) for server-side CMS fetches from within the cluster

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
