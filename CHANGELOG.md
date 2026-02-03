# Changelog

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
