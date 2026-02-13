# Federation & Bluesky Integration

## Current Architecture

POLTR uses its own AT Protocol namespace (`app.ch.poltr.*`) with custom lexicons:

- `app.ch.poltr.ballot.entry` - ballot/referendum entries
- `app.ch.poltr.ballot.like` - likes on ballots
- `app.ch.poltr.ballot.embed` - ballot embeds
- `app.ch.poltr.actor.pseudonym` - user pseudonyms

All records live in user repos on `pds.poltr.info`. The POLTR AppView (`app.poltr.info`) indexes these via the PDS firehose. Bluesky does not see any of this because:

1. The PDS is not federated with the Bluesky relay network
2. Even if federated, Bluesky's AppView only indexes `app.bsky.*` records

## PDS Federation (Prerequisite)

For any Bluesky integration, `pds.poltr.info` must be federated with the Bluesky relay (`bsky.network`). This means:

- The PDS must be publicly reachable
- It must serve the `com.atproto.sync.subscribeRepos` websocket firehose
- Bluesky must add it to the relay allowlist (request via Bluesky)

Without federation, the PDS is invisible to Bluesky regardless of which lexicons are used.

## Integration Options Evaluated

### Option 1: Cross-post with `embed.external` (Recommended)

Write a standard `app.bsky.feed.post` with an `app.bsky.embed.external` link card pointing back to POLTR. Every Bluesky client already renders these as preview cards.

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Volksinitiative: Autobahnausbau - Stimme jetzt ab!",
  "embed": {
    "$type": "app.bsky.embed.external",
    "external": {
      "uri": "https://poltr.ch/ballots/123",
      "title": "Autobahnausbau",
      "description": "Bundesbeschluss über den Ausbau...",
      "thumb": "<image blob>"
    }
  },
  "createdAt": "2026-01-01T00:00:00Z"
}
```

**Pros:**
- Works today, no Bluesky changes needed
- Full Bluesky discussion infrastructure (replies, likes, reposts, quotes)
- Content stays on POLTR, link card points back
- Indexer can follow reply threads back into POLTR

**Cons:**
- Not a native ballot display on Bluesky, just a link card
- Need to decide who posts (user account vs governance account)

### Option 2: Custom Feed Generator

Build a Bluesky feed generator that curates POLTR ballot posts into a subscribable "Swiss Referenda" feed on Bluesky.

**Pros:** Discoverability on Bluesky, users can pin the feed
**Cons:** Doesn't enable discussion on its own, needs Option 1 as prerequisite

### Option 3: Custom Embed Types (Not Yet Viable)

AT Protocol supports open unions for embeds - a custom `app.ch.poltr.ballot.embed` could be attached to Bluesky posts. However, Bluesky currently shows **an empty embed** for unknown types. A generic fallback display is planned but not implemented yet.

**Status:** Wait for Bluesky to ship custom embed fallback, then reconsider.

### Option 4: Use Bluesky Lexicons Natively

Replace POLTR custom lexicons with `app.bsky.feed.post` and `app.bsky.feed.like`. Use tags/facets to identify POLTR content.

**Pros:** Full native Bluesky compatibility
**Cons:** Lose custom schema (cantons, ballot metadata, structured voting data), constrained by Bluesky's record format

## Recommended Approach

### Phase 1: Cross-posting with `embed.external`

When a ballot is created on POLTR, also write an `app.bsky.feed.post` with `embed.external` to the user's repo. This creates the anchor for discussion.

```
User creates ballot on POLTR
       │
       ▼
POLTR writes app.bsky.feed.post with embed.external
       │
       ├──► Bluesky renders as link preview card
       │    Users can reply, like, repost natively
       │
       ▼
POLTR indexer picks up replies where
root/parent points to the cross-posted record
       │
       ▼
Both platforms show the full discussion
```

### Phase 2: Bidirectional Indexing

Extend the POLTR indexer to:
- Subscribe to the Bluesky relay (or PDS firehose)
- Index any `app.bsky.feed.post` where `reply.root` or `reply.parent` points to a cross-posted POLTR ballot post
- Display Bluesky replies as arguments/comments on POLTR

### Phase 3: Feed Generator (Optional)

Build a custom Bluesky feed ("Swiss Referenda") that curates all POLTR ballot posts and their discussions for Bluesky users.

### Phase 4: Custom Embeds (Future)

Once Bluesky ships the custom embed fallback mechanism, upgrade cross-posts to include rich `app.ch.poltr.ballot.embed` data alongside the `embed.external` fallback. Clients that understand the POLTR lexicon can render a native ballot view.

## Open Decision: Post Author

Who should create the cross-posted Bluesky post?

| Approach | Pros | Cons |
|----------|------|------|
| **User's own account** | Organic, distributed, users own their content | User might not want Bluesky posts, requires user consent |
| **Governance account** (`smartinfo.poltr.info`) | Centralized, easy to manage, consistent | Less organic, single point of failure |
| **Both** | User chooses, governance account as fallback | More complexity |

## References

- [Custom Schemas | Bluesky](https://docs.bsky.app/docs/advanced-guides/custom-schemas)
- [Lexicons, Pinned Posts, and Interoperability | Bluesky](https://docs.bsky.app/blog/pinned-posts)
- [AT Protocol Lexicon Guide](https://atproto.com/guides/lexicon)
