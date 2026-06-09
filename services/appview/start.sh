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
# NOTE: do NOT enable --forwarded-allow-ips='*' — it trusts X-Forwarded-For from
# any direct caller, who could then spoof their rate-limit key. The real client
# IP is delivered instead via the secret-gated X-Poltr-Client-IP header from the
# frontend proxy (see _client_ip_key in src/core/fastapi.py / doc/SECURITY_AUTH.md #1).
exec uvicorn src.main:app --host 0.0.0.0 --port 3000
