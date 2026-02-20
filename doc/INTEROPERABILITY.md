# Interoperability: poltr PDS <-> Bluesky

Complete matrix of all cross-PDS interaction flows.

## Data Flow

```
                    MIRROR (poltr → Bluesky)
 ┌──────────────────────────────────────────────────────────────────┐
 │                                                                  │
 │  poltr.ch                poltr PDS              Bluesky          │
 │  ┌──────────┐           ┌──────────┐           ┌──────────┐     │
 │  │ Frontend │──write──► │  Records │──relay───► │ bsky.app │     │
 │  │          │           │          │  (firehose)│          │     │
 │  │ ballots  │           │ ballot   │            │ cross-   │     │
 │  │ args     │           │ entry    │            │ posted   │     │
 │  │ comments │           │ rating   │            │ feed.post│     │
 │  │ ratings  │           │ feed.post│            │          │     │
 │  └──────────┘           └──────────┘            └──────────┘     │
 │       ▲                      ▲                       ▲           │
 │       │                      │                       │           │
 │       │                 ┌──────────┐                 │           │
 │       │                 │ Indexer  │            ┌──────────┐     │
 │       │                 │          │◄─firehose──│  poltr   │     │
 │       │                 │ upsert   │  (own PDS) │  PDS     │     │
 │       │                 └──────────┘            └──────────┘     │
 │       │                      │                       ▲           │
 │       │                      ▼                       │           │
 │       │                 ┌──────────┐            ┌──────────┐     │
 │       └─── serves ◄────│PostgreSQL│            │ AppView  │     │
 │                         │          │            │ crosspost│     │
 │                         │ ballots  │───poll────►│ .py      │     │
 │                         │ comments │            │          │     │
 │                         │ likes    │◄──update───│ creates  │     │
 │                         └──────────┘  bsky_uri  │ feed.post│     │
 │                                                 └──────────┘     │
 │                              ▲                                   │
 │                              │                                   │
 └──────────────────────────────┼───────────────────────────────────┘
                                │
 ┌──────────────────────────────┼───────────────────────────────────┐
 │                              │                                   │
 │  REVERSE (Bluesky → poltr)   │                                   │
 │                              │                                   │
 │                         ┌──────────┐            ┌──────────┐     │
 │                         │ Poller   │──GET──────►│ Bluesky  │     │
 │                         │ (bsky_   │  getPost   │ Public   │     │
 │                         │ poller.js│  Thread    │ API      │     │
 │                         │          │◄───────────│          │     │
 │                         │ upsert   │ thread +   └──────────┘     │
 │                         │ counts   │ counts                      │
 │                         └──────────┘                             │
 │                              │                                   │
 │                              ▼                                   │
 │                         ┌──────────┐                             │
 │                         │PostgreSQL│                             │
 │                         │          │                             │
 │                         │ app_     │  (origin='extern')          │
 │                         │ comments │                             │
 │                         │ bsky_*_  │                             │
 │                         │ count    │                             │
 │                         └──────────┘                             │
 │                                                                  │
 └──────────────────────────────────────────────────────────────────┘
```

## Configurations

These configurations are implemented or at least implementable.

- **`LOGIN with external accounts (NOT IMPLEMENTED)`** — Shall it be allowed to login to Poltr with external atproto accounts? NO.

- **`LOGIN with Poltr-Accounts to external plattform (DISABLED)`** — Shall it be allowed to login to Poltr with external atproto accounts? For this aim, one would have to use the "create APP-Passwort" Logik. Its disabled at the moment.
<br />Enable it with <code>NEXT_PUBLIC_APP_PASSWORD_ENABLED</code>


- **`MIRROR (ENABLED)`** — Poltr content is mirrored to Bluesky as `app.bsky.feed.post`. All crossposting is handled by the **AppView** (`services/appview/src/lib/crosspost.py`) as a background asyncio task. Ballots are posted under the governance account; arguments are posted under the argument author's account (as replies to the ballot post). Comments do not need mirroring as they are already stored as `app.bsky.feed.post`. This enables: a) Bluesky users can subscribe to a poltr feed, b) Bluesky users can comment/like/repost ballots and arguments. Controlled by `CROSSPOST_ENABLED` and `CROSSPOST_POLL_INTERVAL_SECONDS` (default 30s) env vars on the AppView.

- **`REVERSE (ENABLED)`** — Bluesky posts are  periodically imported back into poltr. Limit: Only enabled for **active ballots** (`app_ballots.active = 1`). The indexer polls the Bluesky public API (`app.bsky.feed.getPostThread`) for each active ballot's cross-post URI on a configurable interval (default 10 min). The full reply thread tree (up to depth 10) is walked recursively and upserted into `app_comments` (origin = `extern`). Engagement counts (likes, reposts, replies) are updated on the ballot row.

Hence: No auth path for Bluesky-native users to interact on poltr.ch. Would require cross-PDS OAuth or public/anonymous access.

```
MIRROR — AppView (crosspost.py)
  │  every CROSSPOST_POLL_INTERVAL_SECONDS (default 30s)
  │
  ├─ SELECT ballots without bsky_post_uri
  │    → createRecord(app.bsky.feed.post) under governance account
  │    → UPDATE app_ballots SET bsky_post_uri, bsky_post_cid
  │
  ├─ SELECT arguments without bsky_post_uri (whose ballot has bsky_post_uri)
  │    → createRecord(app.bsky.feed.post) under author's account (reply to ballot)
  │    → UPDATE app_arguments SET bsky_post_uri, bsky_post_cid
  │
  └─ Errors logged per-record, never crash the process

REVERSE — Indexer (bsky_poller.js)
  │  every BSKY_POLL_INTERVAL_MS (default 600s)
  │
  ├─ SELECT active ballots with bsky_post_uri
  │
  ├─ For each ballot (2s delay between requests):
  │    GET public.api.bsky.app/xrpc/app.bsky.feed.getPostThread
  │      ?uri=<bsky_post_uri>&depth=10
  │    │
  │    ├─ Root post → UPDATE app_ballots SET bsky_like_count, bsky_repost_count, bsky_reply_count
  │    │
  │    └─ Walk replies recursively → UPSERT into app_comments (origin='extern')
  │         ├─ text, author handle/displayName preserved on first insert
  │         └─ engagement counts updated on every poll cycle
  │
  └─ Errors logged per-ballot, never crash the process
```

Controlled by environment variables:
- **MIRROR:** `CROSSPOST_ENABLED` (default `false`), `CROSSPOST_POLL_INTERVAL_SECONDS` (default `30`) — on the AppView.
- **REVERSE:** `BSKY_POLL_ENABLED` (default `false`), `BSKY_POLL_INTERVAL_MS` (default `600000`) — on the Indexer.

### What `REVERSE` does NOT capture

| Content type | Why missed | Severity |
|-------------|-----------|----------|
| Replies beyond depth 10 | `getPostThread` limited to `depth=10` | Low — very deep threads are rare |
| Quote-posts and their reply trees | Quote-posts create a new thread root not linked to the ballot thread | Medium — could add a separate poll for quote-post URIs |
| Activity on inactive ballots | Only ballots with `active = 1` are polled | By design — activate ballots to enable |
| Real-time updates | Polling interval means up to 10 min delay | Low — acceptable for discussion import |


## Mirroring Poltr to Bluesky (bsky.app)
Whether one allows discussion to be monitored and continued on Bluesky depends on the option "MIRROR".
(One exception: comments are natively understood by Bluesky.)

All crossposting is handled by the **AppView** (`services/appview/src/lib/crosspost.py`) as a background asyncio poll loop. The AppView polls the database for ballots/arguments without a `bsky_post_uri`, creates the corresponding `app.bsky.feed.post` records on the PDS, and stores the resulting URI back in the database.

The following matrix tables visualize interactions where cross-platform logins are disabled: Poltr accounts cannot login at Bluesky and vice versa.

<table>
<thead>
<tr>
  <th>Action</th>
  <th>Poltr-Content on Bluesky</th>
</tr>
</thead>
<tbody>

<tr>
  <td> <b>Read</b></td>

  <td>The AppView (<code>crosspost.py</code>) auto-creates mirrored <code>app.bsky.feed.post</code> records for ballots and arguments. Ballots are posted under the governance account; arguments are posted under the author's account as replies to the ballot post. Comments do not need mirroring as they are already stored as <code>app.bsky.feed.post</code>. Additionally, a <a href="BLUESKY_FEED.md">Bluesky feed generator</a> can expose poltr content as a subscribable feed on bsky.app.</td>
</tr>

<tr>
  <td><b>Like / Rate</b></td>
  <td>Bluesky users may like cross-posted content on bsky.app.</td>
</tr>

<tr>
  <td><b>Post / Reply</b></td>
  <td>Bluesky user may reply to cross-posted content on bsky.app.</td>
</tr>

</tbody>
</table>

## Reverse Mirroring Bluesky to Poltr (poltr.ch)
Whether the discussion on Bluesky is connected back to poltr hinges on the option "REVERSE". This option makes poltr.ch automatically import likes and posts created on Bluesky that are related to poltr content. The reverse polling is handled by the **Indexer** (`services/indexer/src/bsky_poller.js`).

<table>
<thead>
<tr>
  <th>Action</th>
  <th>Poltr-related Bluesky-Content on Poltr</th>
</tr>

<tr>
  <td><b>Read</b></td>
  <td>For active ballots, the indexer periodically polls <code>getPostThread</code> and imports Bluesky replies into <code>app_comments</code>. Additionally, a <a href="BLUESKY_FEED.md">Bluesky feed generator</a> can expose poltr content as a subscribable feed on poltr.ch.</td>
</tr>

<tr>
  <td><b>Like / Rate</b></td>
<td>Like counts from Bluesky are imported to Poltr (aggregated counts only, not individual like records). Poltr users can rate the content for themselves.</td>
</tr>

<tr>
  <td><b>Post / Reply</b></td>
  <td>Also on Bluesky generated content can be replied on Poltr.</td>
</tr>

</tbody>
</table>

## Gaps summary

### `MIRROR` — poltr content on Bluesky
Ballots and arguments are cross-posted by the AppView (`crosspost.py`). Ballots are posted under the governance account; arguments are posted under the author's account as replies to the ballot post. Ratings are not yet cross-posted as Bluesky likes.

### `REVERSE` — Bluesky reactions back to poltr (active ballots only)
Implemented via periodic polling in the **Indexer** (`bsky_poller.js`). Scoped to ballots with `active = 1` in `app_ballots`. The indexer calls `getPostThread` on the Bluesky public API for each active ballot's cross-post URI. Captures:
1. Full reply thread tree (up to depth 10) — imported into `app_comments` with `origin='extern'`
2. Engagement counts (likes, reposts, replies) — stored on `app_ballots.bsky_*_count` and per-reply on `app_comments.bsky_*_count`

Controlled by `BSKY_POLL_ENABLED` (default `false`) and `BSKY_POLL_INTERVAL_MS` (default 10 min) on the Indexer. Not captured: quote-post reply trees, threads deeper than 10 levels.


