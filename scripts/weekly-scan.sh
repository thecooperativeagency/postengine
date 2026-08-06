#!/bin/bash
# PostEngine weekly Drive scan — Friday morning
# Fills review queue for the rest of this week + next week (weeks=2).
# Does NOT auto-approve or auto-publish.

set -euo pipefail

LOG="/tmp/postengine-weekly-scan.log"
ROOT="/Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager"
ENV_FILE="$ROOT/.env"
DB_PATH="/Users/lucfaucheux/.postengine/sqlite.db"
API="http://127.0.0.1:3456"
WEEKS="${POSTENGINE_SCAN_WEEKS:-2}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1" | tee -a "$LOG"
}

log "Starting weekly Drive scan (weeks=$WEEKS)..."

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [ -z "${ENGINE_DASHBOARD_PASSWORD:-}" ]; then
  log "ENGINE_DASHBOARD_PASSWORD is missing; aborting weekly scan."
  exit 1
fi

if ! curl -fsS -H "x-dashboard-password: $ENGINE_DASHBOARD_PASSWORD" "$API/api/dealerships" > /dev/null 2>&1; then
  log "PostEngine not responding on :3456 — kickstarting launchd service..."
  launchctl kickstart -k "gui/$(id -u)/com.postengine" 2>>"$LOG" || true
  sleep 12
fi

if ! curl -fsS -H "x-dashboard-password: $ENGINE_DASHBOARD_PASSWORD" "$API/api/dealerships" > /dev/null 2>&1; then
  log "PostEngine still not responding after kickstart; aborting."
  exit 1
fi

RESULT=$(curl -fsS -X POST \
  -H "x-dashboard-password: $ENGINE_DASHBOARD_PASSWORD" \
  -H "Content-Type: application/json" \
  -d "{\"weeks\": $WEEKS}" \
  "$API/api/drive/scan")
JOB_ID=$(printf '%s' "$RESULT" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("jobId",""))')

if [ -z "$JOB_ID" ]; then
  log "Drive scan did not return a job id. Result: $RESULT"
  exit 1
fi

log "Drive scan accepted as job $JOB_ID. Waiting for completion..."

for _ in $(seq 1 180); do
  STATUS=$(sqlite3 "$DB_PATH" "select status from engine_jobs where id = $JOB_ID;")
  SUMMARY=$(sqlite3 "$DB_PATH" "select coalesce(summary,'') from engine_jobs where id = $JOB_ID;")

  if [ "$STATUS" = "completed" ]; then
    log "Scan complete — $SUMMARY"
    exit 0
  fi

  if [ "$STATUS" = "failed" ] || [ "$STATUS" = "blocked" ]; then
    log "Scan ended with status $STATUS — $SUMMARY"
    exit 1
  fi

  sleep 10
done

log "Timed out waiting for weekly scan job $JOB_ID to finish."
exit 1
