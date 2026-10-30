#!/bin/bash
# Friday 10:45 AM CDT — ping Lance with review-queue link.
# Assumes weekly scan already ran earlier Friday morning.
# Prefer PostEngine Telegram creds; fall back to Hermes Ada bot if PE token is dead.

set -euo pipefail

LOG="/tmp/postengine-friday-reminder.log"
ROOT="/Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager"
ENV_FILE="$ROOT/.env"
HERMES_ENV="${HERMES_HOME:-$HOME/.hermes}/.env"
DB_PATH="/Users/lucfaucheux/.postengine/sqlite.db"
QUEUE_URL="${POSTENGINE_QUEUE_URL:-https://postengine.thecoopbrla.com/#/queue}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] $1" | tee -a "$LOG"
}

read_env_key() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  # Safe parse — do not source full .env (Hermes .env can break set -u)
  local line
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)
  [ -n "$line" ] || return 0
  printf '%s' "${line#*=}" | sed -e 's/^["'\'']//' -e 's/["'\'']$//' | tr -d '\r'
}

token_ok() {
  local t="$1"
  [ -n "$t" ] || return 1
  curl -fsS "https://api.telegram.org/bot${t}/getMe" >/dev/null 2>&1
}

TOKEN="$(read_env_key "$ENV_FILE" TELEGRAM_BOT_TOKEN)"
CHAT_ID="$(read_env_key "$ENV_FILE" TELEGRAM_CHAT_ID)"

if ! token_ok "$TOKEN"; then
  log "PostEngine Telegram token missing/invalid — falling back to Hermes bot."
  TOKEN="$(read_env_key "$HERMES_ENV" TELEGRAM_BOT_TOKEN)"
  CHAT_ID="$(read_env_key "$HERMES_ENV" TELEGRAM_HOME_CHANNEL)"
  if [ -z "$CHAT_ID" ]; then
    CHAT_ID="$(read_env_key "$HERMES_ENV" TELEGRAM_CHAT_ID)"
  fi
fi

if [ -z "$TOKEN" ] || [ -z "$CHAT_ID" ]; then
  log "No working Telegram token/chat — cannot send reminder."
  exit 1
fi

if ! token_ok "$TOKEN"; then
  log "Fallback Telegram token also invalid."
  exit 1
fi

QUEUED=$(sqlite3 "$DB_PATH" "select count(*) from posts where status='queued';")
SCHEDULED_NEXT=$(sqlite3 "$DB_PATH" "
  select count(*) from posts
  where status='scheduled'
    and scheduled_for is not null
    and date(scheduled_for) >= date('now','localtime')
    and date(scheduled_for) < date('now','localtime','+14 days');
")

BREAKDOWN=$(sqlite3 -separator ': ' "$DB_PATH" "
  select d.name, count(p.id)
  from posts p
  join dealerships d on d.id = p.dealership_id
  where p.status='queued'
  group by d.name
  order by d.name;
" | paste -sd ' · ' -)

if [ -z "$BREAKDOWN" ]; then
  BREAKDOWN="none yet"
fi

if [ "$QUEUED" -eq 0 ]; then
  TEXT="📅 Friday PostEngine check

No posts sitting in the review queue right now.

If photos landed late, open Generate on the dashboard, then come back here:
${QUEUE_URL}

Already scheduled (next ~2 weeks): ${SCHEDULED_NEXT}"
else
  TEXT="📅 Friday PostEngine — approve next week

${QUEUED} post(s) waiting in the review queue.
By store: ${BREAKDOWN}

Open the queue, read captions, Approve what you want for next week.
Nothing publishes until you approve.

➡️ ${QUEUE_URL}

(Already scheduled next ~2 weeks: ${SCHEDULED_NEXT})"
fi

log "Sending Friday queue reminder (queued=$QUEUED)..."

PAYLOAD=$(CHAT_ID="$CHAT_ID" TEXT="$TEXT" python3 - <<'PY'
import json, os
print(json.dumps({
  "chat_id": os.environ["CHAT_ID"],
  "text": os.environ["TEXT"],
  "disable_web_page_preview": False,
}))
PY
)

RESP=$(curl -fsS -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

OK=$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("ok", False))')
if [ "$OK" != "True" ]; then
  log "Telegram send failed: $RESP"
  exit 1
fi

log "Reminder sent."
exit 0
