# POLTR INDEXER

## Indexing
The indexer stores all records from the PDS in its own postgres Database.



# TODO: 
**backfill** write a nightly task to backfill all records , that haventbeen synced via firehose. (there are always downtimes). You can use a cursore in redis or similar to know, when last backfill had happended.

## Docker

Build the image:
```bash
docker build -t poltr-appview .
```

Run the container (both indexer and main service start):
```bash
docker run --rm -p 3000:3000 poltr-appview
```

The container uses `start.sh` to launch `src/indexer.js` and `src/main.js` concurrently. If either exits, the other is terminated so the container lifecycle remains consistent.

### Notes
- This image installs only production dependencies (`npm ci --omit=dev`).
- `tini` is used as PID 1 for correct signal handling.
- Adjust exposed ports in `Dockerfile` if the main service or indexer listen on different ports.
- For scaling, consider splitting the indexer and API into separate services.



## VISION: index also bluesky comments (related to poltr)



BGS/Jetstream = server that publishes a big global firehose

Your indexer = client that subscribes to one or more firehoses

So your setup can be:

             (1) your own PDS firehose
pds.poltr.info  ───────────────┐
                               │
                               ▼
                        app.poltr.info
                     (your indexer/appview)
                               ▲
                               │
jetstream / relay  ────────────┘
          (2) global firehose

Concretely

Keep your current indexer logic for:

wss://pds.poltr.info/xrpc/com.atproto.sync.subscribeRepos

Add a second consumer in the same service that connects to:

Jetstream / relay endpoint (SSE/WebSocket URL)

In the handler for the global stream, you:

filter strictly to what you care about (e.g. replies referencing your proposal URIs, or records using app.ch.poltr.*)

write those into your Postgres tables (e.g. external_replies)