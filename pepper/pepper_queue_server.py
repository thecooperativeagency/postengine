#!/usr/bin/env python3
"""
Pepper Queue HTTP Server
=========================
Exposes GET /pepper/queue for Pepper's cron to poll.
Reads from ~/pepper_queue.jsonl, supports ?since= and ?drain= params.
Auth: Bearer token matching the main gateway token.

Runs on port 18790 (one above the main gateway).
"""

import fcntl
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

QUEUE_PATH = Path.home() / "pepper_queue.jsonl"
GATEWAY_TOKEN = "9ec1005edf34519d4feeda49deb5a713633e6ec743db279f"
PORT = 18790
LOG_PATH = Path.home() / "pepper_queue_server.log"


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    line = f"{ts} {msg}"
    print(line, flush=True)
    try:
        with LOG_PATH.open("a") as f:
            f.write(line + "\n")
    except Exception:
        pass


class PepperQueueHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # suppress default access log
        pass

    def send_json(self, code: int, data) -> None:
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def check_auth(self) -> bool:
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:].strip()
            return token == GATEWAY_TOKEN
        return False

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/pepper/queue":
            self.send_json(404, {"error": "not found"})
            return

        if not self.check_auth():
            self.send_json(401, {"error": "unauthorized"})
            log(f"UNAUTHORIZED request from {self.client_address[0]}")
            return

        params = parse_qs(parsed.query)
        since_str = params.get("since", [None])[0]
        drain = params.get("drain", ["false"])[0].lower() in ("true", "1", "yes")

        since_ts: float = 0.0
        if since_str:
            try:
                since_ts = float(since_str)
            except ValueError:
                self.send_json(400, {"error": "invalid since param"})
                return

        # Read queue with advisory lock
        QUEUE_PATH.touch(exist_ok=True)
        records = []
        kept_lines = []

        try:
            with QUEUE_PATH.open("r+", encoding="utf-8") as f:
                fcntl.flock(f, fcntl.LOCK_EX)
                try:
                    lines = f.readlines()
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            rec = json.loads(line)
                        except json.JSONDecodeError:
                            kept_lines.append(line)
                            continue
                        # Filter by since
                        if since_ts:
                            ra = rec.get("received_at", "")
                            try:
                                rec_ts = datetime.fromisoformat(ra.replace("Z", "+00:00")).timestamp()
                                if rec_ts <= since_ts:
                                    if drain:
                                        kept_lines.append(line)
                                    else:
                                        kept_lines.append(line)
                                    continue
                            except Exception:
                                pass
                        records.append(rec)
                        if not drain:
                            kept_lines.append(line)

                    if drain:
                        # Atomically rewrite the file with only kept lines
                        f.seek(0)
                        f.truncate()
                        for kl in kept_lines:
                            f.write(kl + "\n")
                finally:
                    fcntl.flock(f, fcntl.LOCK_UN)
        except Exception as e:
            log(f"ERROR reading queue: {e}")
            self.send_json(500, {"error": str(e)})
            return

        log(f"GET /pepper/queue since={since_str} drain={drain} → {len(records)} records")
        self.send_json(200, records)


if __name__ == "__main__":
    log(f"Pepper Queue Server starting on port {PORT}")
    log(f"Queue path: {QUEUE_PATH}")
    server = HTTPServer(("127.0.0.1", PORT), PepperQueueHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("Shutting down.")
        server.server_close()
