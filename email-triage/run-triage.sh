#!/bin/bash
# Email Triage Cron Runner
# Runs every 30 minutes via cron

LOG_FILE="$HOME/.openclaw/workspace/email-triage/cron.log"
TRIAGE_DIR="$HOME/.openclaw/workspace/email-triage"

cd "$TRIAGE_DIR" || exit 1

# Timestamp
echo "=== $(date '+%Y-%m-%d %H:%M:%S') ===" >> "$LOG_FILE"

# Run sweep (last 30 min of emails)
python3 triage-engine.py --sweep --scan 50 --days 1 >> "$LOG_FILE" 2>&1

echo "" >> "$LOG_FILE"
