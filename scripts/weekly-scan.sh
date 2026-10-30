#!/bin/bash
# PostEngine Drive scanner helper (Mac Mini crontab).
# Live schedule is Friday 08:00 America/Chicago, not Sunday.
# On Railway that job is scripts/railway-weekly-scan.mjs at 13:00 UTC Friday.
#
# This script curls localhost and a path that is not this repo layout
# (postengine/social-post-manager).
# See docs/RAILWAY_DEPLOY.md. Unload launchd com.postengine before Railway
# starts publishing, or both processes will post the same queue.

LOG="/tmp/postengine-weekly-scan.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting weekly Drive scan..." >> "$LOG"

# Load env vars
ENV_FILE="/Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager/.env"
export $(grep -v '^#' "$ENV_FILE" | xargs) 2>/dev/null

# Make sure PostEngine is running
if ! curl -s http://localhost:3456/api/dealerships > /dev/null 2>&1; then
  echo "[$DATE] PostEngine not running — starting it..." >> "$LOG"
  cd /Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager
  PORT=3456 npm run dev >> "$LOG" 2>&1 &
  sleep 10
fi

# Run the Drive scan
RESULT=$(curl -s -X POST http://localhost:3456/api/drive/scan -H "Content-Type: application/json")
COUNT=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('newPosts',0))" 2>/dev/null)

echo "[$DATE] Scan complete — $COUNT new draft posts created" >> "$LOG"
echo "[$DATE] Result: $RESULT" >> "$LOG"

# Send Telegram notification via OpenClaw
if [ "$COUNT" -gt 0 ]; then
  echo "[$DATE] Notifying Lance via Telegram..." >> "$LOG"
  # OpenClaw will pick this up via heartbeat or we notify directly
  echo "PostEngine weekly scan complete: $COUNT new draft posts ready for review. Open http://localhost:3456/#/queue to approve." > /tmp/postengine-notify.txt
fi

echo "[$DATE] Weekly scan done." >> "$LOG"
