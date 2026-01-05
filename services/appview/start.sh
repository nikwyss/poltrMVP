#!/bin/bash
set -e

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

# Start the application
exec uvicorn src.main:app --host 0.0.0.0 --port 3000
