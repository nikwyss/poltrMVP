# Bluesky Custom Feed for poltr

Expose poltr content (ballots, arguments) as a subscribable feed on bsky.app.

## How Bluesky Feed Generators work

A feed generator is a standalone HTTP service registered with Bluesky. It does **not** create content — it curates existing posts.

### The flow

```
Bluesky user subscribes to "poltr" feed on bsky.app
         │
         ▼
  Bluesky AppView calls getFeedSkeleton
         │
         ▼
  Feed generator service (e.g. app.poltr.info/xrpc/app.bsky.feed.getFeedSkeleton)
    queries poltr DB for cross-posted URIs
         │
         ▼
  Returns skeleton (list of app.bsky.feed.post AT-URIs)
         │
         ▼
  Bluesky AppView hydrates the URIs
    (post content, author info, embeds, like counts)
         │
         ▼
  User sees poltr content in their Bluesky feed
```

### What a skeleton looks like

The feed generator implements one XRPC method: `app.bsky.feed.getFeedSkeleton`. It returns a list of post URIs — nothing more:

```json
{
  "feed": [
    { "post": "at://did:plc:xxx/app.bsky.feed.post/abc123" },
    { "post": "at://did:plc:xxx/app.bsky.feed.post/def456" }
  ],
  "cursor": "1716000000000::abc123"
}
```

Bluesky's AppView fetches the full post data for each URI. The feed generator never touches or returns post content — it only decides **which** posts appear and in **what order**.

### Key constraint

Every post in the skeleton **must be an `app.bsky.feed.post` record** already indexed by Bluesky's relay. The feed generator cannot return custom Lexicon URIs (like `app.ch.poltr.ballot.entry`) — Bluesky wouldn't know how to render them.

**This means all poltr content that should appear in the feed must be cross-posted as `app.bsky.feed.post`.** Ballots are already cross-posted by the indexer. Arguments and other content types would need the same treatment.

## Implementation

### 1. Cross-post all relevant content

Ballots are already cross-posted by the indexer (`upsertBskyPost` in `services/indexer/src/pds_client.js`). The same pattern needs to be extended to arguments and any other content types that should appear in the feed.

Each cross-post creates an `app.bsky.feed.post` on the poltr PDS (under the governance account) with an `app.bsky.embed.external` link card pointing back to poltr.ch. The Bluesky relay picks these up and indexes them.

The cross-post URI and CID are stored in the database (e.g. `app_ballots.bsky_post_uri`, `app_ballots.bsky_post_cid`), which the feed generator queries.

### 2. Feed generator service

The feed generator is a lightweight HTTP endpoint. It can be a new route on the existing appview or a standalone service.

It needs to implement:

```
GET /xrpc/app.bsky.feed.getFeedSkeleton?feed=<feed-uri>&limit=<n>&cursor=<cursor>
```

Minimal implementation (Python/FastAPI example):

```python
@router.get("/xrpc/app.bsky.feed.getFeedSkeleton")
async def get_feed_skeleton(
    feed: str,          # at://governance-did/app.bsky.feed.generator/poltr
    limit: int = 50,
    cursor: str = None,
):
    # Parse cursor (timestamp-based pagination)
    cursor_ts = None
    if cursor:
        cursor_ts = datetime.fromisoformat(cursor)

    pool = await get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT bsky_post_uri, created_at
            FROM app_ballots
            WHERE bsky_post_uri IS NOT NULL AND NOT deleted
        """
        # Add arguments table with UNION ALL when ready:
        # UNION ALL
        # SELECT bsky_post_uri, created_at FROM app_arguments
        # WHERE bsky_post_uri IS NOT NULL AND NOT deleted

        if cursor_ts:
            query += " AND created_at < $1 ORDER BY created_at DESC LIMIT $2"
            rows = await conn.fetch(query, cursor_ts, limit)
        else:
            query += " ORDER BY created_at DESC LIMIT $1"
            rows = await conn.fetch(query, limit)

    feed_items = [{"post": row["bsky_post_uri"]} for row in rows]
    new_cursor = rows[-1]["created_at"].isoformat() if rows else None

    return {"feed": feed_items, "cursor": new_cursor}
```

The service also needs a `app.bsky.feed.describeFeedGenerator` endpoint:

```python
@router.get("/xrpc/app.bsky.feed.describeFeedGenerator")
async def describe_feed_generator():
    return {
        "did": GOVERNANCE_DID,  # or a did:web for the service
        "feeds": [
            {"uri": f"at://{GOVERNANCE_DID}/app.bsky.feed.generator/poltr"}
        ],
    }
```

### 3. Service identity (DID)

The feed generator needs its own identity. Two options:

| Option | Setup | Best for |
|--------|-------|----------|
| `did:web` | Add `/.well-known/did.json` to the feed service domain | Dedicated feed service |
| Governance account DID | Reuse the existing governance `did:plc` | Feed hosted on the appview |

If hosting the feed as a route on the appview (`app.poltr.info`), a `did:web:app.poltr.info` is the simplest approach. Create `/.well-known/did.json`:

```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:app.poltr.info",
  "service": [
    {
      "id": "#bsky_fg",
      "type": "BskyFeedGenerator",
      "serviceEndpoint": "https://app.poltr.info"
    }
  ]
}
```

### 4. Feed declaration record

Register the feed by creating an `app.bsky.feed.generator` record in the governance account's repo on the PDS:

```bash
# Via XRPC (with governance Bearer JWT)
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <governanceJwt>" \
  "http://localhost:2583/xrpc/com.atproto.repo.putRecord" \
  -d '{
    "repo": "<GOVERNANCE_DID>",
    "collection": "app.bsky.feed.generator",
    "rkey": "poltr",
    "record": {
      "$type": "app.bsky.feed.generator",
      "did": "did:web:app.poltr.info",
      "displayName": "poltr - Swiss Referenda",
      "description": "Swiss ballot entries and arguments from poltr.ch",
      "createdAt": "2026-02-16T00:00:00Z"
    }
  }'
```

The `rkey` (`poltr`) becomes part of the feed URI: `at://<GOVERNANCE_DID>/app.bsky.feed.generator/poltr`.

After this record exists, Bluesky users can find and subscribe to the feed on bsky.app.

### 5. Kubernetes deployment

If hosted as a route on the appview, no new deployment is needed. If standalone:

```yaml
# Addition to infra/kube/poltr.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feed-generator
  namespace: poltr
spec:
  replicas: 1
  selector:
    matchLabels:
      app: feed-generator
  template:
    spec:
      containers:
      - name: feed-generator
        image: <feed-generator-image>
        env:
        - name: INDEXER_POSTGRES_URL
          valueFrom:
            secretKeyRef:
              name: poltr-secrets
              key: INDEXER_POSTGRES_URL
```

## Content that needs cross-posting

| Content type | Cross-posted today? | Collection | DB table |
|-------------|-------------------|------------|----------|
| Ballots | Yes | `app.ch.poltr.ballot.entry` | `app_ballots.bsky_post_uri` |
| Arguments | No (needs implementation) | `app.ch.poltr.ballot.argument` (TBD) | TBD |
| Ratings | No (cross-liked, not cross-posted) | `app.ch.poltr.content.rating` | `app_likes.bsky_like_uri` |

Ratings don't need cross-posting for the feed — they're reactions, not content. Arguments would need the same cross-post mechanism as ballots: create an `app.bsky.feed.post` with a link card and store the URI.

## Summary

| Component | What it does | Exists? |
|-----------|-------------|---------|
| Cross-posting | Creates `app.bsky.feed.post` records on poltr PDS | Ballots: yes. Arguments: no. |
| Relay indexing | Bluesky relay picks up cross-posts from poltr PDS | Yes (federation is active) |
| Feed generator service | Returns skeleton of cross-post URIs | No (needs implementation) |
| Feed declaration record | `app.bsky.feed.generator` in governance repo | No (one-time setup) |
| Service identity | `did:web` or reuse governance DID | No (one-time setup) |

The feed generator itself is lightweight (a single DB query behind an HTTP endpoint). The main prerequisite is ensuring all content that should appear in the feed is cross-posted as `app.bsky.feed.post`.
