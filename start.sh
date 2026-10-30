#!/bin/bash
# PostEngine Start Script
# Loads .env and starts the already-built server (no rebuild on every boot).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
NODE_BIN="${POSTENGINE_NODE_BIN:-/opt/homebrew/bin/node}"
PORT_VALUE="${PORT:-3456}"

cd "$SCRIPT_DIR"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-$PORT_VALUE}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH:-}"

if [ ! -x "$NODE_BIN" ]; then
  echo "PostEngine node binary not found/executable: $NODE_BIN" >&2
  exit 1
fi

if [ ! -f "$SCRIPT_DIR/dist/index.cjs" ]; then
  echo "PostEngine build missing at $SCRIPT_DIR/dist/index.cjs — run npm run build first." >&2
  exit 1
fi

exec "$NODE_BIN" "$SCRIPT_DIR/dist/index.cjs"
