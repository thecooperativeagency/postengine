#!/usr/bin/env python3
"""
Foolproof Email Triage System for lance@thecoopbrla.com

Architecture:
1. Pull recent inbox emails via GOG
2. Classify by sender + subject rules
3. Auto-resolve low-stakes items
4. Draft replies for medium-stakes items
5. Escalate high-stakes items to Lance via Telegram
6. Keep triage log for audit trail

Usage:
    python3 triage-engine.py --dry-run    # Preview only
    python3 triage-engine.py --sweep      # Full sweep
    python3 triage-engine.py --scan 30    # Check last 30 messages
"""

import subprocess
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict
from typing import Optional, List, Dict
from pathlib import Path

# ─── Configuration ───────────────────────────────────────────────────────────

ACCOUNT = "lance@thecoopbrla.com"
DATA_DIR = Path.home() / ".openclaw" / "workspace" / "email-triage"
LOG_FILE = DATA_DIR / "triage-log.jsonl"
RULES_FILE = DATA_DIR / "rules.json"
DRAFTS_DIR = DATA_DIR / "drafts"

# Priority tiers
TIER_AUTO = "auto"          # Handle silently (newsletters, receipts, etc.)
TIER_DRAFT = "draft"        # Draft reply, ask Lance before sending
TIER_ESCALATE = "escalate"  # Notify Lance immediately

# ─── Sender Classification ───────────────────────────────────────────────────

# Auto-resolve: newsletters, system notifications, receipts
AUTO_SENDERS = {
    # Newsletters & Marketing
    "noreply", "no-reply", "newsletter", "marketing", "updates",
    "promotions", "team@", "info@", "hello@",
    # Receipts & Billing
    "billing", "invoice", "receipt", "payment", "stripe", "paypal",
    "square", "quickbooks", "freshbooks",
    # Social & Platform
    "linkedin", "twitter", "x.com", "instagram", "facebook",
    "youtube", "tiktok", "notifications@",
    # Tools & SaaS
    "slack", "notion", "github", "vercel", "cloudflare", "namecheap",
    "godaddy", "hostgator", "mailchimp", "hubspot", "calendly",
    # Banking (old/unused)
    "relayfi", "relayfi.com",
    # Marketing / newsletters
    "canva", "openrouter",
    # Vendor notifications (insignificant)
    "stripo",
    # News
    "substack", "medium", "techcrunch", "theinformation",
}

# Escalate: clients, partners, investors, legal, financial
ESCALATE_SENDERS = {
    # Dealership clients (from USER.md)
    "bmwofjackson", "brianharrisbmw", "audibatonrouge", "harrisporsche",
    # Key people (from MEMORY.md)
    "christyfaucheux", "joshgwin", "edwin", "davidvilla",
    "rick.mccary", "becky", "autohub",
    # Dealership contacts & vendors
    "hedrick", "wood", "brett", "bagley", "adam", "terrebonne",
    "chad", "martorana", "richard", "darrell", "franklin",
    "carly", "boos",
    "charles", "tortorich",
    "eric", "metzler", "jeffrey", "scharwath",
    # Print/signage vendors
    "claudette", "fastsigns", "fastsigns.com",
    # Financial/Legal
    "bank", "capitalone", "chase", "wellsfargo", "accountant",
    "attorney", "lawyer", "irs", "cpa",
    # Co-op / Manufacturer
    "bmwusa", "audiusa", "porsche", "lexus",
}

# Subject line triggers
AUTO_SUBJECTS = [
    r"unsubscribe", r"newsletter", r"weekly digest", r"monthly update",
    r"your receipt", r"payment confirmed", r"invoice #", r"billing",
    r"password reset", r"verify your email", r"login attempt",
    r"social media", r"follow request", r"new follower",
    r"survey", r"feedback request", r"rate your experience",
    r"relayfi", r"relay fi",
    r"hot car report", r"merchandising & pricing alerts",
    r"scheduled maintenance", r"maintenance notice",
]

ESCALATE_SUBJECTS = [
    r"urgent", r"asap", r"emergency", r"critical",
    r"contract", r"agreement", r"legal", r"lawsuit",
    r"payment due", r"overdue", r" collections",
    r"meeting request", r"schedule", r"calendar",
    r"proposal", r"pitch", r"partnership",
    r"co-op", r"reimbursement", r"claim",
    r"consultant", r"supplier", r"intake",
]

# ─── Data Structures ─────────────────────────────────────────────────────────

@dataclass
class EmailMessage:
    message_id: str
    thread_id: str
    sender: str
    sender_email: str
    subject: str
    date: str
    snippet: str
    labels: List[str]
    body: Optional[str] = None

@dataclass
class TriageDecision:
    message_id: str
    timestamp: str
    tier: str
    action: str
    reason: str
    draft_path: Optional[str] = None
    sent: bool = False
    approved: Optional[bool] = None

# ─── GOG Interface ───────────────────────────────────────────────────────────

def gog_cmd(args: List[str]) -> dict:
    """Run a gog command and return JSON output."""
    cmd = ["gog", "gmail"] + args + ["--account", ACCOUNT, "--json"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"[ERROR] GOG failed: {result.stderr.strip()}")
            return {}
        return json.loads(result.stdout)
    except Exception as e:
        print(f"[ERROR] GOG exception: {e}")
        return {}

def fetch_inbox(limit: int = 50, days: int = 3) -> List[EmailMessage]:
    """Fetch recent inbox messages."""
    query = f"in:inbox newer_than:{days}d"
    data = gog_cmd(["search", query, "--max", str(limit)])
    messages = []
    for thread in data.get("threads", []):
        messages.append(EmailMessage(
            message_id=thread.get("id", ""),
            thread_id=thread.get("id", ""),
            sender=thread.get("from", ""),
            sender_email=extract_email(thread.get("from", "")),
            subject=thread.get("subject", ""),
            date=thread.get("date", ""),
            snippet=thread.get("snippet", ""),
            labels=thread.get("labels", []),
        ))
    return messages

def fetch_message_body(message_id: str) -> str:
    """Fetch full message body."""
    data = gog_cmd(["read", message_id])
    return data.get("body", "")

def extract_email(sender_str: str) -> str:
    """Extract email from 'Name <email@domain.com>' format."""
    match = re.search(r'<([^>]+)>', sender_str)
    if match:
        return match.group(1).lower()
    return sender_str.lower().strip()

# ─── Classification Engine ───────────────────────────────────────────────────

def classify_email(msg: EmailMessage) -> tuple:
    """
    Returns (tier, reason)
    
    Tiers:
      auto      -> Mark read + archive silently
      draft     -> Draft reply, queue for Lance approval
      escalate  -> Notify Lance immediately, leave in inbox
    """
    sender = msg.sender_email.lower()
    subject = msg.subject.lower()
    snippet = msg.snippet.lower()
    
    # Check auto subjects first (specific garbage overrides sender)
    for pattern in AUTO_SUBJECTS:
        if re.search(pattern, subject):
            return TIER_AUTO, f"Subject matches auto pattern: '{pattern}'"
    
    # Check escalate subjects next (specific urgency keywords)
    for pattern in ESCALATE_SUBJECTS:
        if re.search(pattern, subject):
            return TIER_ESCALATE, f"Subject matches escalate pattern: '{pattern}'"
    
    # Check escalate senders (known clients/partners)
    for key in ESCALATE_SENDERS:
        if key in sender:
            return TIER_ESCALATE, f"Sender matches escalate keyword: '{key}'"
    
    # Check auto senders last (generic newsletters/platforms)
    for key in AUTO_SENDERS:
        if key in sender:
            return TIER_AUTO, f"Sender matches auto keyword: '{key}'"
    
    # Default: draft (needs Lance's eyes)
    return TIER_DRAFT, "No clear auto/escalate match — needs human review"

# ─── Action Engine ───────────────────────────────────────────────────────────

def auto_resolve(msg: EmailMessage, dry_run: bool = True) -> str:
    """Mark read and archive a message."""
    if dry_run:
        return f"[DRY-RUN] Would mark read + archive: {msg.subject[:50]}"
    
    # Mark read
    gog_cmd(["mark-read", msg.message_id])
    # Archive (remove inbox label)
    gog_cmd(["archive", msg.message_id])
    
    return f"Marked read + archived: {msg.subject[:50]}"

def draft_reply(msg: EmailMessage, dry_run: bool = True) -> tuple:
    """
    Draft a contextual reply based on message content.
    Returns (draft_text, file_path)
    """
    DRAFTS_DIR.mkdir(parents=True, exist_ok=True)
    
    # Simple template-based drafting
    draft = generate_draft(msg)
    
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{msg.message_id}.txt"
    filepath = DRAFTS_DIR / filename
    
    content = f"""FROM: {msg.sender}
SUBJECT: Re: {msg.subject}
MESSAGE_ID: {msg.message_id}
DATE: {msg.date}
---
DRAFT:
{draft}
---
SNIPPET: {msg.snippet}
"""
    
    if not dry_run:
        filepath.write_text(content)
    
    return draft, str(filepath)

def generate_draft(msg: EmailMessage) -> str:
    """Generate a contextual draft reply."""
    subject = msg.subject.lower()
    snippet = msg.snippet.lower()
    
    # Meeting request patterns
    if any(w in subject for w in ["meeting", "schedule", "call", "chat"]):
        return f"""Hi,

Thanks for reaching out. I'd be happy to find a time to connect.

Could you share a few windows that work for you? I'll check my calendar and send over an invite.

Best,
Lance"""
    
    # Proposal / pitch patterns
    if any(w in subject for w in ["proposal", "partnership", "collaborate", "opportunity"]):
        return f"""Hi,

Thanks for the note — this sounds interesting. Let me review the details and get back to you shortly.

Best,
Lance"""
    
    # Information request
    if any(w in subject for w in ["question", "help", "information", "details"]):
        return f"""Hi,

Thanks for reaching out. Let me look into this and get you an answer.

Best,
Lance"""
    
    # Generic fallback
    return f"""Hi,

Thanks for the email. Let me review this and get back to you.

Best,
Lance"""

def escalate(msg: EmailMessage, dry_run: bool = True) -> str:
    """Notify Lance about an important email."""
    alert = f"""🚨 EMAIL ESCALATION

From: {msg.sender}
Subject: {msg.subject}
Time: {msg.date}

Snippet: {msg.snippet[:200]}

Action needed: Review and reply"""
    
    if not dry_run:
        # Send Telegram alert
        send_telegram(alert)
    
    return alert

def send_telegram(message: str):
    """Send alert via Telegram bot."""
    # Read from OpenClaw config
    import json
    config_path = Path.home() / ".openclaw" / "openclaw.json"
    token = None
    chat_id = "8767648441"  # Lance's Telegram chat ID
    
    try:
        with open(config_path) as f:
            config = json.load(f)
            token = config.get("channels", {}).get("telegram", {}).get("botToken")
    except Exception as e:
        print(f"[WARN] Could not read Telegram config: {e}")
        return
    
    if not token:
        print("[WARN] Telegram bot token not found in config")
        return
    
    import urllib.request
    import urllib.parse
    
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "Markdown"
    }).encode()
    
    try:
        urllib.request.urlopen(url, data=data, timeout=10)
    except Exception as e:
        print(f"[WARN] Telegram send failed: {e}")

# ─── Logging ─────────────────────────────────────────────────────────────────

def log_decision(decision: TriageDecision):
    """Append decision to audit log."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(asdict(decision)) + "\n")

def load_rules() -> dict:
    """Load custom user rules."""
    if RULES_FILE.exists():
        return json.loads(RULES_FILE.read_text())
    return {}

# ─── Main Sweep ──────────────────────────────────────────────────────────────

def run_sweep(dry_run: bool = True, limit: int = 50, days: int = 3):
    """Run the full triage sweep."""
    print(f"🦞 Email Triage Sweep")
    print(f"Account: {ACCOUNT}")
    print(f"Mode: {'DRY-RUN' if dry_run else 'LIVE'}")
    print(f"Looking back: {days} days | Max messages: {limit}")
    print("=" * 50)
    
    messages = fetch_inbox(limit, days)
    if not messages:
        print("No messages found.")
        return
    
    print(f"Found {len(messages)} messages")
    print()
    
    auto_count = draft_count = escalate_count = 0
    
    for msg in messages:
        tier, reason = classify_email(msg)
        
        print(f"📧 {msg.sender_email[:30]:<30} | {msg.subject[:40]:<40}")
        print(f"   Tier: {tier.upper()} | {reason}")
        
        decision = TriageDecision(
            message_id=msg.message_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            tier=tier,
            action="pending",
            reason=reason,
        )
        
        if tier == TIER_AUTO:
            result = auto_resolve(msg, dry_run)
            decision.action = "auto_resolved"
            print(f"   → {result}")
            auto_count += 1
            
        elif tier == TIER_DRAFT:
            draft, path = draft_reply(msg, dry_run)
            decision.action = "drafted"
            decision.draft_path = path
            print(f"   → Draft created")
            if dry_run:
                print(f"   [DRAFT PREVIEW]\n{draft[:200]}...")
            draft_count += 1
            
        elif tier == TIER_ESCALATE:
            alert = escalate(msg, dry_run)
            decision.action = "escalated"
            print(f"   → ESCALATED")
            if dry_run:
                print(f"   [ALERT PREVIEW]\n{alert[:200]}...")
            escalate_count += 1
        
        log_decision(decision)
        print()
    
    print("=" * 50)
    print(f"SUMMARY: {auto_count} auto | {draft_count} drafts | {escalate_count} escalated")
    print(f"Log: {LOG_FILE}")
    if draft_count > 0:
        print(f"Drafts: {DRAFTS_DIR}")

# ─── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Email Triage Engine")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--sweep", action="store_true", help="Full live sweep")
    parser.add_argument("--scan", type=int, default=50, help="Max messages to scan")
    parser.add_argument("--days", type=int, default=3, help="Days to look back")
    
    args = parser.parse_args()
    
    if args.sweep:
        run_sweep(dry_run=False, limit=args.scan, days=args.days)
    else:
        run_sweep(dry_run=True, limit=args.scan, days=args.days)
