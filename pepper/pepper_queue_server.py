#!/usr/bin/env python3
"""
Pepper Queue Server
====================
Lightweight HTTP sidecar that exposes GET /pepper/queue for Pepper's cron.

Auth: Bearer token matching gateway auth token
Port: 18790 (localhost only — Tailscale serve proxies externally)

Query params:
  since  (optional) — unix timestamp, only return records newer than this
  drain  (optional, default false) — atomic read+delete returned records
"""

import json
import logging
import os
import sys
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

QUEUE_PATH = Path(os.environ.get(
    "PEPPER_QUEUE_PATH",
    str(Path.home() / ".openclaw/workspace/pepper/pepper_queue.jsonl"),
))
BEARER_TOKEN = os.environ.get("PEPPER_QUEUE_TOKEN", "").strip()
PORT = int(os.environ.get("PEPPER_QUEUE_PORT", "18790"))

LOG_PATH = Path(os.environ.get(
    "PEPPER_QUEUE_LOG",
    str(Path.home() / "Library/Logs/pepper-queue-server.log"),
))
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("pepper_queue_server")


class QueueHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        log.info("%s - %s", self.address_string(), format % args)

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path not in ("/pepper/queue", "/queue", "/"):
            self.send_json(404, {"error": "not found"})
            return

        # Auth check
        auth = self.headers.get("Authorization", "")
        if BEARER_TOKEN and auth != f"Bearer {BEARER_TOKEN}":
            self.send_json(401, {"error": "unauthorized"})
            return

        params = parse_qs(parsed.query)
        since_raw = params.get("since", [None])[0]
        drain = params.get("drain", ["false"])[0].lower() in ("1", "true", "yes")

        since_ts = None
        if since_raw:
            try:
                since_ts = float(since_raw)
            except ValueError:
                self.send_json(400, {"error": "invalid since param"})
                return

        if not QUEUE_PATH.exists():
            self.send_json(200, [])
            return

        try:
            with QUEUE_PATH.open("r", encoding="utf-8") as f:
                lines = f.readlines()
        except Exception as e:
            log.error("Failed to read queue: %s", e)
            self.send_json(500, {"error": "read error"})
            return

        records = []
        remaining = []

        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                remaining.append(line)
                continue

            # Filter by since
            if since_ts is not None:
                try:
                    rec_dt = datetime.fromisoformat(rec["received_at"].replace("Z", "+00:00"))
                    rec_unix = rec_dt.timestamp()
                    if rec_unix <= since_ts:
                        remaining.append(line)
                        continue
                except (KeyError, ValueError):
                    pass

            records.append(rec)
            if not drain:
                remaining.append(line)

        # Atomic write-back if draining
        if drain and records:
            try:
                tmp = QUEUE_PATH.with_suffix(".tmp")
                with tmp.open("w", encoding="utf-8") as f:
                    for r in remaining:
                        f.write(r + "\n")
                tmp.replace(QUEUE_PATH)
                log.info("Drained %d record(s), %d remaining", len(records), len(remaining))
            except Exception as e:
                log.error("Failed to drain queue: %s", e)
                self.send_json(500, {"error": "drain error"})
                return

        self.send_json(200, records)


if __name__ == "__main__":
    if not BEARER_TOKEN:
        log.warning("PEPPER_QUEUE_TOKEN not set — endpoint is unauthenticated!")
    QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
    QUEUE_PATH.touch(exist_ok=True)
    log.info("Pepper queue server starting on port %d", PORT)
    log.info("Queue file: %s", QUEUE_PATH)
    server = HTTPServer(("127.0.0.1", PORT), QueueHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down.")
