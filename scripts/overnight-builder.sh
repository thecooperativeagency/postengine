#!/bin/bash
# overnight-builder.sh
# Picks the top QUEUED task from TASKS.md, spawns Claude Code to build it,
# commits results, and sends Lance a Telegram summary.

WORKSPACE="/Users/lucfaucheux/.openclaw/workspace"
TASKS_FILE="$WORKSPACE/TASKS.md"
LOG_FILE="/tmp/overnight-builder-$(date +%Y%m%d).log"

echo "[$(date)] Overnight builder started" >> "$LOG_FILE"

# Check time — only run between 10PM and 6AM CDT
HOUR=$(date +%H)
if [ "$HOUR" -ge 6 ] && [ "$HOUR" -lt 22 ]; then
  echo "[$(date)] Outside overnight window (6AM-10PM). Exiting." >> "$LOG_FILE"
  exit 0
fi

# Find top QUEUED task
TASK_TITLE=$(grep -m1 "## \[QUEUED\]" "$TASKS_FILE" | sed 's/## \[QUEUED\] //')

if [ -z "$TASK_TITLE" ]; then
  echo "[$(date)] No QUEUED tasks found. Exiting." >> "$LOG_FILE"
  exit 0
fi

echo "[$(date)] Picked up task: $TASK_TITLE" >> "$LOG_FILE"

# Extract spec for this task (lines between this task header and next ##)
SPEC=$(awk "/## \[QUEUED\] $(echo $TASK_TITLE | sed 's/[[\.*^$()+?{|]/\\&/g')/,/^## \[/" "$TASKS_FILE" | grep -v "^## \[" | head -20)
REPO_LINE=$(echo "$SPEC" | grep "Repo:")
REPO=$(echo "$REPO_LINE" | sed 's/.*Repo: //' | tr -d ' ')
SPEC_TEXT=$(echo "$SPEC" | grep -A5 "Spec:" | sed 's/- \*\*Spec:\*\* //')
DONE_WHEN=$(echo "$SPEC" | grep "Done when:" | sed 's/.*Done when:\*\* //')

echo "[$(date)] Repo: $REPO" >> "$LOG_FILE"
echo "[$(date)] Spec: $SPEC_TEXT" >> "$LOG_FILE"

# Mark task as IN_PROGRESS
sed -i '' "s/## \[QUEUED\] $TASK_TITLE/## [IN_PROGRESS] $TASK_TITLE/" "$TASKS_FILE"
cd "$WORKSPACE" && git add TASKS.md && git commit -m "Task in progress: $TASK_TITLE" 2>/dev/null

# Determine working directory
if echo "$REPO" | grep -q "github.com"; then
  REPO_NAME=$(echo "$REPO" | sed 's|github.com/[^/]*/||')
  WORKDIR="$HOME/Projects/$REPO_NAME"
  if [ ! -d "$WORKDIR" ]; then
    echo "[$(date)] Cloning repo $REPO..." >> "$LOG_FILE"
    git clone "https://github.com/$( echo $REPO | sed 's|github.com/||')" "$WORKDIR" 2>> "$LOG_FILE"
  fi
else
  # New repo — create in Projects
  SAFE_NAME=$(echo "$TASK_TITLE" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9-')
  WORKDIR="$HOME/Projects/$SAFE_NAME"
  mkdir -p "$WORKDIR"
  cd "$WORKDIR" && git init 2>/dev/null
fi

echo "[$(date)] Working in: $WORKDIR" >> "$LOG_FILE"

# Build the Claude Code prompt
PROMPT="You are building for Lance Faucheux at The Cooperative Agency.

TASK: $TASK_TITLE

SPEC:
$SPEC_TEXT

DONE WHEN:
$DONE_WHEN

Instructions:
- Build this completely and correctly
- Commit all changes to git with clear commit messages
- If it's a new repo, initialize with a proper README.md
- Do not ask questions — make reasonable decisions and build
- When done, run: openclaw system event --text \"Overnight build complete: $TASK_TITLE\" --mode now"

# Run Claude Code in background
echo "[$(date)] Spawning Claude Code..." >> "$LOG_FILE"
cd "$WORKDIR" && claude --permission-mode bypassPermissions --print "$PROMPT" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo "[$(date)] Claude Code finished successfully" >> "$LOG_FILE"
  # Mark task DONE
  sed -i '' "s/## \[IN_PROGRESS\] $TASK_TITLE/## [DONE] $TASK_TITLE/" "$TASKS_FILE"
  STATUS="✅ DONE"
else
  echo "[$(date)] Claude Code exited with code $EXIT_CODE" >> "$LOG_FILE"
  # Mark task FAILED
  sed -i '' "s/## \[IN_PROGRESS\] $TASK_TITLE/## [FAILED] $TASK_TITLE/" "$TASKS_FILE"
  STATUS="❌ FAILED (exit $EXIT_CODE)"
fi

# Commit TASKS.md update
cd "$WORKSPACE" && git add TASKS.md && git commit -m "Task $STATUS: $TASK_TITLE" 2>/dev/null

# Send Telegram summary via OpenClaw
openclaw system event --text "🦞 Overnight build $STATUS

Task: $TASK_TITLE
Dir: $WORKDIR
Log: $LOG_FILE

Check the repo and let me know what you think." --mode now 2>/dev/null

echo "[$(date)] Overnight builder finished" >> "$LOG_FILE"
