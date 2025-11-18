#!/bin/sh
set -eu

echo "[start] launching indexer and main services"

node src/indexer.js &
INDEXER_PID=$!

echo "[start] indexer pid: $INDEXER_PID"

node src/main.js &
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
