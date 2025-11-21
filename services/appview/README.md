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

## Docker

Build the image:
```bash
docker build -t poltr-indexer .
```

Run the container (both indexer and main service start):
```bash
docker run --rm -p 3000:3000 poltr-indexer
```

The container uses `start.sh` to launch `src/indexer.js` and `src/main.js` concurrently. If either exits, the other is terminated so the container lifecycle remains consistent.

### Notes
- This image installs only production dependencies (`npm ci --omit=dev`).
- `tini` is used as PID 1 for correct signal handling.
- Adjust exposed ports in `Dockerfile` if the main service or indexer listen on different ports.
- For scaling, consider splitting the indexer and API into separate services.

## VS Code workspace

There is a local `.vscode/` config with recommended extensions, tasks and launch configs:

- Run `Tasks: Run Task` → `npm: build` to build the TypeScript `dist/` directory.
- Run `Tasks: Run Task` → `npm: dev` for a background dev server using `tsx`.
- Use the `Run and Debug` panel to launch either the compiled `dist/main.js` or the TypeScript `src/main.ts` for debugging.

Install the recommended extensions if prompted: ESLint, Prettier, Node tools.
