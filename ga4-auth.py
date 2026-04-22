#!/usr/bin/env python3
"""
One-time GA4 OAuth auth flow.
Run this, log in as bhbmwecommerce@gmail.com, approve Analytics access.
Stores the refresh token in keychain for ga4-query.sh to use.
"""
import subprocess, json, urllib.parse, http.server, threading, webbrowser

CLIENT_ID = "3183077001-novu90sdpid6ttvtuh449ntiko8op4bb.apps.googleusercontent.com"
CLIENT_SECRET = "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"
REDIRECT_URI = "http://localhost:8765/oauth2callback"
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
EMAIL = "bmwofjackson@thecoopbrla.com"

auth_code = None

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global auth_code
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        auth_code = params.get("code", [None])[0]
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"<h2>Auth complete! You can close this tab.</h2>")
    def log_message(self, *args): pass

server = http.server.HTTPServer(("localhost", 8765), Handler)
t = threading.Thread(target=server.handle_request)
t.start()

url = (
    "https://accounts.google.com/o/oauth2/auth"
    f"?client_id={CLIENT_ID}"
    f"&redirect_uri={urllib.parse.quote(REDIRECT_URI)}"
    f"&scope={urllib.parse.quote(SCOPE)}"
    "&response_type=code"
    "&access_type=offline"
    "&prompt=consent"
    f"&login_hint={EMAIL}"
)
print(f"\nOpening browser for GA4 auth...\nIf it doesn't open, visit:\n{url}\n")
webbrowser.open(url)
t.join()

import urllib.request
data = urllib.parse.urlencode({
    "code": auth_code,
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "redirect_uri": REDIRECT_URI,
    "grant_type": "authorization_code"
}).encode()

req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data)
resp = json.loads(urllib.request.urlopen(req).read())
refresh_token = resp["refresh_token"]

token_json = json.dumps({"refresh_token": refresh_token})
subprocess.run([
    "security", "add-generic-password",
    "-a", f"token:analytics:{EMAIL}",
    "-s", "gogcli",
    "-w", token_json,
    "-U"
], check=True)

print(f"✅ GA4 auth complete! Refresh token stored in keychain for {EMAIL}")
