# Interoperability: poltr PDS <-> Bluesky

Complete matrix of all cross-PDS interaction flows.

## Configurations

These configurations are implemented or at least implementable.

- **`LOGIN with external accounts (NOT IMPLEMENTED)`** — Shall it be allowed to login to Poltr with external atproto accounts? NO.

- **`LOGIN with Poltr-Accounts to external plattform (DISABLED)`** — Shall it be allowed to login to Poltr with external atproto accounts? For this aim, one would have to use the "create APP-Passwort" Logik. Its disabled at the moment.
<br />Enable it with <code>NEXT_PUBLIC_APP_PASSWORD_ENABLED</code>


- **`MIRROR (ENABLED)`** — Poltr content is mirrored to Bluesky as `app.bsky.feed.post`. This enables: a) Bluesky users can subscribe to a poltr feed, b) Bluesky users can comment/like/repost ballots, arguments, and comments. Extends the discussion to the wider Bluesky audience. Open question: which content types are mirrored (ballots, arguments, ratings)? (this excludes "comments", as they are already in `app.bsky.feed.post`)

- **`REVERSE (ENABLED)`** — Bluesky posts are  periodically imported back into poltr. Limit: Only enabled for **active ballots** (`app_ballots.active = 1`). The indexer polls the Bluesky public API (`app.bsky.feed.getPostThread`) for each active ballot's cross-post URI on a configurable interval (default 10 min). The full reply thread tree (up to depth 10) is walked recursively and upserted into `app_comments` (origin = `extern`). Engagement counts (likes, reposts, replies) are updated on the ballot row.



```
Indexer (bsky_poller.js)
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

Controlled by environment variables: `BSKY_POLL_ENABLED` (default `false`), `BSKY_POLL_INTERVAL_MS` (default `600000`).

### What `REVERSE` does NOT capture

| Content type | Why missed | Severity |
|-------------|-----------|----------|
| Replies beyond depth 10 | `getPostThread` limited to `depth=10` | Low — very deep threads are rare |
| Quote-posts and their reply trees | Quote-posts create a new thread root not linked to the ballot thread | Medium — could add a separate poll for quote-post URIs |
| Activity on inactive ballots | Only ballots with `active = 1` are polled | By design — activate ballots to enable |
| Real-time updates | Polling interval means up to 10 min delay | Low — acceptable for discussion import |


## FULL MATRIX
<table>
<thead>
<tr>
  <th rowspan="3">Action</th>
  <th rowspan="3">Platform</th>
</tr>
<tr>
  <th colspan="2">Account: pds.poltr</th>
  <th colspan="2">Account: pds.bluesky</th>
</tr>
<tr>
  <th>Target: pds.poltr</th>
  <th>Target: pds.bluesky <br />(poltr-related)</th>
  <th>Target: pds.poltr</th>
  <th>Target: pds.bluesky <br />(poltr-related)</th>
</tr>
</thead>
<tbody>

<!-- READ -->
<tr>
  <td rowspan="2"><b>Read</b></td>
  <td><b>poltr.ch</b></td>
  <td>✅ <b>Native</b></td>
  <td>✅ <b>Implemented by "REVERSE"</b><br /> For active ballots, the indexer periodically polls <code>getPostThread</code> and imports Bluesky replies into <code>app_comments</</td>
  <td colspan="2">❌ <b>Not implemented.</b> Bluesky-native users cannot log into poltr.ch. Would require cross-PDS auth or public access.</td>
</tr>
<tr>
  <td><b>bsky.app</b></td>
  <td colspan="2">⚡ <b>Not enabled.</b> Poltr-users cannot log into bluesky. Would require enabled app-password.</td>

  <td>✅ <b>Implemented by "MIRROR"</b> <br/>Indexer auto-creates mirrored <code>app.bsky.feed.post</code> (ballots and arguments; comments do not need mirroring as they already stored as app.bsky.feed.post). Also, there is an extra blueskay-feed for poltr content.</td>
  <td>✅ <b>Native</b></td>
</tr>

<!-- LIKE / RATE -->
<tr>
  <td rowspan="2"><b>Like / Rate</b></td>
  <td><b>poltr.ch</b></td>
  <td>✅ <b>Native.</b> Creates <code>app.ch.poltr.content.rating</code> (0–100 preference).  <br/><br/><code>MIRROR:</code>If positive, the rating is cross-posted as like. </td>
  <td>✅ <b>Implemented by "REVERSE"</b><br /> For active ballots, reverse-imported Bluesky replies could be rated on poltr.ch. (0-100)  <br/><br/><code>MIRROR:</code>If positive, the rating is cross-posted as like. </td>

  <td colspan="2">❌ <b>Not implemented.</b> Bluesky-native users cannot log into poltr.ch. Would require cross-PDS auth or public access.</td>
  <tr>

  <td><b>bsky.app</b></td>
  <td colspan="2">⚡ <b>Not enabled.</b> Poltr-users cannot log into bluesky. Would require enabled app-password.</td>
  <td>✅ <b>Implemented by "MIRROR"</b><br /> Bluesky user may like cross-posted content on bsky.app.</td>
  <td>✅ <b>Native</b><br><code>REVERSE (EXTENSION)</code>: For active ballots, like counts might be captured via <code>getPostThread</code> polling and stored on <code>bsky_like_count</code>.</td>
</tr>

<!-- POST / REPLY -->
<tr>
  <td rowspan="2"><b>Post / Reply</b></td>
  <td><b>poltr.ch</b></td>
  <td>✅ <b>Native</b></td>
  <td>✅ <b>Native</b></td>
  <td colspan="2">❌ <b>Not implemented.</b> Bluesky-native users cannot log into poltr.ch. Would require cross-PDS auth or public access.</td>
</tr>
<tr>
  <td><b>bsky.app</b></td>
  <td colspan="2">⚡ <b>Not enabled.</b> Poltr-users cannot log into bluesky. Would require enabled app-password.</td>
  <td>✅ <b>Implemented by "MIRROR"</b><br /> Bluesky user may reply to cross-posted content on bsky.app.</td>
  <td>✅ <b>Native</b><br><code>REVERSE</code>: For active ballots, the replies are  captured via <code>getPostThread</code> polling and stored on poltr <code>bsky_like_count</code>.</td>
</tr>


</tbody>
</table>

## Legend

| Symbol | Status | Meaning |
|--------|--------|---------|
| ✅ | **Implemented** | Fully working end-to-end |
| ⚡ | **Not enabled** | Mechanism is not enabled |
| ❌ | **Not implemented** | No mechanism exists |
| `MIRROR` | Option tag | This capability depends on the mirroring option |
| `REVERSE` | Option tag | This capability depends on the reverse-mirroring option (active ballots only) |
| `REVERSE (EXTENSION)` | Option tag | This capability depends on the capacity of the reverse-mirroring option |

## Gaps summary

### `MIRROR` — poltr content on Bluesky
Only ballots are cross-posted today. Arguments, comments, and ratings need the same cross-post mechanism. Once all content types are mirrored, a [Bluesky feed generator](BLUESKY_FEED.md) can expose them as a subscribable feed on bsky.app.

### `REVERSE` — Bluesky reactions back to poltr (active ballots only)
Implemented via periodic polling (`bsky_poller.js`). Scoped to ballots with `active = 1` in `app_ballots`. The indexer calls `getPostThread` on the Bluesky public API for each active ballot's cross-post URI. Captures:
1. Full reply thread tree (up to depth 10) — imported into `app_comments` with `origin='extern'`
2. Engagement counts (likes, reposts, replies) — stored on `app_ballots.bsky_*_count` and per-reply on `app_comments.bsky_*_count`

Controlled by `BSKY_POLL_ENABLED` (default `false`) and `BSKY_POLL_INTERVAL_MS` (default 10 min). Not captured: quote-post reply trees, threads deeper than 10 levels.

### Bluesky-native users on poltr.ch
No auth path for Bluesky-native users to interact on poltr.ch. Would require cross-PDS OAuth or public/anonymous access.
