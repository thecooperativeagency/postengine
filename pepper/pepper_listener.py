#!/usr/bin/env python3
"""
Pepper Slack Socket Mode Listener
==================================
Runs 24/7 on the Mac Mini. Holds a Socket Mode connection to Slack
using Pepper's app-level token. Captures @-mentions of Pepper into a
queue file so a Perplexity cron can pick them up.

Architecturally parallel to Luc's listener — independent process,
independent tokens, independent queue.

Environment variables required:
    PEPPER_APP_TOKEN   — xapp-... (Socket Mode app-level token)
    PEPPER_BOT_TOKEN   — xoxb-... (bot user OAuth token)

Optional:
    PEPPER_QUEUE_PATH  — defaults to ~/pepper_queue.jsonl
    PEPPER_LOG_PATH    — defaults to ~/pepper_listener.log

Install:
    pip install slack-sdk

Run:
    python3 pepper_listener.py
"""

import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from slack_sdk.socket_mode import SocketModeClient
from slack_sdk.socket_mode.request import SocketModeRequest
from slack_sdk.socket_mode.response import SocketModeResponse
from slack_sdk.web import WebClient

# ------------------------------------------------------------------
# Config
# ------------------------------------------------------------------
APP_TOKEN = os.environ.get("PEPPER_APP_TOKEN", "").strip()
BOT_TOKEN = os.environ.get("PEPPER_BOT_TOKEN", "").strip()
QUEUE_PATH = Path(os.environ.get(
    "PEPPER_QUEUE_PATH",
    str(Path.home() / "pepper_queue.jsonl"),
))
LOG_PATH = Path(os.environ.get(
    "PEPPER_LOG_PATH",
    str(Path.home() / "pepper_listener.log"),
))

PEPPER_BOT_USER_ID = "U0ATMQB7NCW"  # Pepper's bot user id
MENTION_PATTERN = re.compile(rf"<@{PEPPER_BOT_USER_ID}>")

# ------------------------------------------------------------------
# Logging
# ------------------------------------------------------------------
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("pepper_listener")

# ------------------------------------------------------------------
# Startup checks
# ------------------------------------------------------------------
if not APP_TOKEN or not APP_TOKEN.startswith("xapp-"):
    log.error("PEPPER_APP_TOKEN missing or not an xapp- token")
    sys.exit(1)
if not BOT_TOKEN or not BOT_TOKEN.startswith("xoxb-"):
    log.error("PEPPER_BOT_TOKEN missing or not an xoxb- token")
    sys.exit(1)

QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
QUEUE_PATH.touch(exist_ok=True)

web_client = WebClient(token=BOT_TOKEN)

# Verify bot token works
try:
    auth = web_client.auth_test()
    log.info(
        "Bot token OK — posting as %s (bot_id=%s team=%s)",
        auth["user"], auth["bot_id"], auth["team"],
    )
except Exception as e:
    log.error("auth.test failed: %s", e)
    sys.exit(1)

socket_client = SocketModeClient(app_token=APP_TOKEN, web_client=web_client)

# ------------------------------------------------------------------
# Queue writer
# ------------------------------------------------------------------
def enqueue_mention(event: dict) -> None:
    record = {
        "received_at": datetime.now(timezone.utc).isoformat(),
        "channel_id": event.get("channel"),
        "channel_type": event.get("channel_type"),
        "sender_user_id": event.get("user"),
        "message_ts": event.get("ts"),
        "thread_ts": event.get("thread_ts"),
        "team_id": event.get("team"),
        "text": event.get("text", ""),
        "raw_event_type": event.get("type"),
    }
    try:
        with QUEUE_PATH.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
        log.info(
            "QUEUED mention ts=%s channel=%s sender=%s",
            record["message_ts"], record["channel_id"], record["sender_user_id"],
        )
    except Exception as e:
        log.error("Failed to write queue record: %s", e)

# ------------------------------------------------------------------
# Event dispatcher
# ------------------------------------------------------------------
def handle(client: SocketModeClient, req: SocketModeRequest) -> None:
    # Always ack immediately — Slack requires this within 3s
    client.send_socket_mode_response(SocketModeResponse(envelope_id=req.envelope_id))

    if req.type != "events_api":
        return

    event = req.payload.get("event", {}) or {}
    event_type = event.get("type")

    # Ignore bot's own messages and Pepper's own posts
    if event.get("bot_id") or event.get("user") == PEPPER_BOT_USER_ID:
        return

    # Explicit app_mention — cheapest signal
    if event_type == "app_mention":
        enqueue_mention(event)
        return

    # Some message events also contain @Pepper even if not routed as app_mention
    # (e.g. thread replies, certain channel types). Cover those too.
    if event_type == "message":
        text = event.get("text") or ""
        if MENTION_PATTERN.search(text):
            enqueue_mention(event)

# ------------------------------------------------------------------
# Main loop
# ------------------------------------------------------------------
socket_client.socket_mode_request_listeners.append(handle)

def run_forever() -> None:
    backoff = 5
    while True:
        try:
            log.info("Connecting Socket Mode…")
            socket_client.connect()
            log.info("Connected. Listening for events.")
            # Block here until the socket drops
            while True:
                time.sleep(60)
                if not socket_client.is_connected():
                    raise RuntimeError("socket dropped")
        except KeyboardInterrupt:
            log.info("Interrupted — exiting.")
            return
        except Exception as e:
            log.error("Listener error: %s — reconnecting in %ds", e, backoff)
            try:
                socket_client.disconnect()
            except Exception:
                pass
            time.sleep(backoff)
            backoff = min(backoff * 2, 300)

if __name__ == "__main__":
    run_forever()
