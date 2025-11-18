# POLTR INDEXER

## Indexing
The indexer stores all records from the PDS in its own postgres Database.

## Delivering
It offers serveral endpoints to list, search etc records.

## Hydrating
Before returning the records to the user it hydrates them:

**Raw:**
```
{
  "text": "hello world",
  "$type": "app.bsky.feed.post",
  "createdAt": "2025-03-01T12:00:00Z"
}
```




**Hydrated:**
```
{
  "uri": "at://did/app.bsky.feed.post/3jv...",
  "cid": "bafy...",
  "value": {
    "text": "hello world",
    "createdAt": "2025-03-01T12:00:00Z"
  },
  "author": {
    "did": "did:plc:...",
    "handle": "alice.bsky.social",
    ...
  },
  "labels": [...],

  "viewer": {
    "like": "at://did/app.bsky.feed.like/...?",   // ← THIS!
    "repost": null,
    "followedBy": "at://did/.../follow/..."
  },

  "embedding": {...},
  "replyCount": 0,
  "likeCount": 42,
  "repostCount": 2
}
```




# TODO: 
**backfill** write a nightly task to backfill all records , that haventbeen synced via firehose. (there are always downtimes). You can use a cursore in redis or similar to know, when last backfill had happended.
