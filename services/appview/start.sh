#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Activate virtual environment
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/venv" ]; then
    source "$SCRIPT_DIR/venv/bin/activate"
elif [ -d "$SCRIPT_DIR/.venv" ]; then
    source "$SCRIPT_DIR/.venv/bin/activate"
fi

# Start the application.
# --proxy-headers + --forwarded-allow-ips='*' make uvicorn honor the ingress's
# X-Forwarded-For so request.client.host (and thus the rate limiter) sees the
# real client IP, not the ingress pod IP. Safe because the pod is only reachable
# via the in-cluster ingress. See doc/SECURITY_AUTH.md #1.
exec uvicorn src.main:app --host 0.0.0.0 --port 3000 \
    --proxy-headers --forwarded-allow-ips='*'
