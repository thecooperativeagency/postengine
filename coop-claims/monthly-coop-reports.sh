#!/bin/bash
# Monthly co-op organic traffic report generator
# Runs on the 14th of each month, builds reports for the previous month
# Crontab: 0 8 14 * * /Users/lucfaucheux/.openclaw/workspace/coop-claims/monthly-coop-reports.sh

set -e

PREV_MONTH=$(date -v-1m +"%B")   # e.g. "June"
PREV_YEAR=$(date -v-1m +"%Y")    # e.g. "2026"

PROMPT="Create the organic traffic co-op PDF reports for ${PREV_MONTH} ${PREV_YEAR} for both BHBMW and BMWJ. Use the workflow in coop-claims/README.md. Pull GA4 organic data, generate HTML, render PDFs with Chrome headless, and save everything to the appropriate folders under coop-claims/. Open the PDFs when done."

cd /Users/lucfaucheux/.openclaw/workspace

echo "[$(date)] Starting monthly co-op report generation for ${PREV_MONTH} ${PREV_YEAR}" >> coop-claims/cron.log

claude --print --dangerously-skip-permissions "$PROMPT" >> coop-claims/cron.log 2>&1

echo "[$(date)] Finished." >> coop-claims/cron.log
