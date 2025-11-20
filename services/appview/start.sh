#!/bin/sh
set -eu

echo "[start] launching indexer and main services"

if [ -f ./dist/indexer.js ]; then
  node ./dist/indexer.js &
else
  node src/indexer.js &
fi
INDEXER_PID=$!

echo "[start] indexer pid: $INDEXER_PID"

if [ -f ./dist/main.js ]; then
  node ./dist/main.js &
else
  node src/main.js &
fi
MAIN_PID=$!

echo "[start] main pid: $MAIN_PID"

term_handler() {
  echo "[start] termination signal caught; shutting down..."
  kill "$INDEXER_PID" "$MAIN_PID" 2>/dev/null || true
  wait "$INDEXER_PID" "$MAIN_PID" 2>/dev/null || true
  exit 0
}

trap term_handler INT TERM

# If either process exits, kill the other and exit with its status.
wait -n || EXIT_CODE=$?

echo "[start] one process exited; stopping remaining"
kill "$INDEXER_PID" "$MAIN_PID" 2>/dev/null || true
wait "$INDEXER_PID" "$MAIN_PID" 2>/dev/null || true

exit ${EXIT_CODE:-0}
