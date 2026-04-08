#!/usr/bin/env python3
"""
Otter.ai Webhook Listener
Receives meeting completed events, extracts action items, pushes to Todoist
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json, os, urllib.request
from datetime import datetime

TODOIST_TOKEN = os.environ.get('TODOIST_API_TOKEN', '')
BOT_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')
CHAT_ID = os.environ.get('TELEGRAM_CHAT_ID', '')
PORT = 8765

class OtterWebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'OK')

        try:
            data = json.loads(body)
        except:
            return

        ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        log = os.path.expanduser('~/Library/Logs/otter-webhook.log')
        with open(log, 'a') as f:
            f.write(f"\n[{ts}] {data.get('event','?')}\n{json.dumps(data, indent=2)}\n")

        process(data)

    def log_message(self, *args): pass


def process(data):
    event = data.get('event', '')
    if event not in ['speech_processed', 'conversation_done', 'meeting_completed']:
        print(f"Ignoring event: {event}")
        return

    title = data.get('title', 'Untitled Meeting')
    action_items = data.get('action_items', [])
    url = data.get('otterUrl', data.get('url', ''))
    summary = data.get('summary', '')

    print(f"📋 {title} — {len(action_items)} action items")

    for item in action_items:
        text = item if isinstance(item, str) else item.get('text', str(item))
        add_task(f"[Meeting] {text}", f"From: {title}\n{url}")

    notify(title, action_items, summary, url)


def add_task(content, description=''):
    payload = json.dumps({
        'content': content[:300],
        'project_id': '6gJvwp7WpXWphjq3',
        'priority': 3,
        'description': description
    }).encode()
    req = urllib.request.Request(
        'https://api.todoist.com/api/v1/tasks', data=payload,
        headers={'Authorization': f'Bearer {TODOIST_TOKEN}', 'Content-Type': 'application/json'}
    )
    try:
        urllib.request.urlopen(req)
        print(f"  ✅ Todoist: {content[:60]}")
    except Exception as e:
        print(f"  ❌ Todoist: {e}")


def notify(title, items, summary, url):
    if not BOT_TOKEN or not CHAT_ID:
        return
    lines = '\n'.join([f"• {i if isinstance(i,str) else i.get('text',str(i))}" for i in items[:10]])
    msg = f"📋 *Meeting Done: {title}*\n\n"
    if lines:
        msg += f"*Action Items:*\n{lines}"
    elif summary:
        msg += summary[:400]
    if url:
        msg += f"\n\n[View in Otter]({url})"

    payload = json.dumps({'chat_id': CHAT_ID, 'text': msg, 'parse_mode': 'Markdown'}).encode()
    req = urllib.request.Request(
        f'https://api.telegram.org/bot{BOT_TOKEN}/sendMessage', data=payload,
        headers={'Content-Type': 'application/json'}
    )
    try:
        urllib.request.urlopen(req)
        print("  ✅ Telegram notified")
    except Exception as e:
        print(f"  ❌ Telegram: {e}")


if __name__ == '__main__':
    print(f"🎙️  Otter webhook listener on port {PORT}")
    HTTPServer(('0.0.0.0', PORT), OtterWebhookHandler).serve_forever()
