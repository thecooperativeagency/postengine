#!/bin/bash
# PostEngine Start Script
# Loads .env and starts the server

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

# Load environment variables from .env
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs) 2>/dev/null
fi

# Start PostEngine
cd "$SCRIPT_DIR"
PORT=${PORT:-3456} npm run dev
