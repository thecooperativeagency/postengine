#!/usr/bin/env python3
from __future__ import annotations
"""
Daily Intelligence Scanner for The Cooperative Agency / Lance Faucheux
Runs at 7:00 AM CDT (12:00 UTC) via cron.

Checks:
- GitHub trending repos by topic (kalshi, prediction-markets, ai-trading, mcp, openclaw, ai-agent)
- Hacker News Show HN / Ask HN for money/AI/trading topics
- GitHub daily trending page
Synthesizes findings and sends a Telegram message.
"""

import json
import os
import sys
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ENV_FILE = Path("/Users/lucfaucheux/.openclaw/workspace/kalshi-weather/.env")

def load_env(path: Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env

env = load_env(ENV_FILE)
TELEGRAM_BOT_TOKEN = env.get("TELEGRAM_BOT_TOKEN", os.environ.get("TELEGRAM_BOT_TOKEN", ""))
TELEGRAM_CHAT_ID = env.get("TELEGRAM_CHAT_ID", os.environ.get("TELEGRAM_CHAT_ID", ""))

# Topics to scan on GitHub
GITHUB_TOPICS = [
    "kalshi",
    "prediction-markets",
    "ai-trading",
    "mcp",
    "openclaw",
    "ai-agent",
]

# HN queries
HN_QUERIES = [
    ("prediction market trading", "show_hn"),
    ("ai agent money", "show_hn"),
    ("kalshi", None),
    ("prediction market", "ask_hn"),
]

# ─── HTTP Helper ─────────────────────────────────────────────────────────────

def fetch_json(url: str, timeout: int = 10) -> dict | list | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "intel-scanner/1.0 (github.com)"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        print(f"[WARN] fetch_json failed for {url}: {e}", file=sys.stderr)
        return None


def fetch_text(url: str, timeout: int = 10) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "intel-scanner/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[WARN] fetch_text failed for {url}: {e}", file=sys.stderr)
        return None


# ─── GitHub Topic Search ─────────────────────────────────────────────────────

def get_cutoff_date() -> str:
    """Return ISO date 30 days ago for GitHub search filter."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    return cutoff.strftime("%Y-%m-%d")


def search_github_topic(topic: str) -> list[dict]:
    cutoff = get_cutoff_date()
    url = (
        f"https://api.github.com/search/repositories"
        f"?q=topic:{topic}+pushed:>{cutoff}"
        f"&sort=stars&order=desc&per_page=5"
    )
    data = fetch_json(url)
    if not data or "items" not in data:
        return []
    results = []
    for item in data["items"][:5]:
        results.append({
            "title": item.get("full_name", ""),
            "description": item.get("description", "") or "",
            "stars": item.get("stargazers_count", 0),
            "url": item.get("html_url", ""),
            "updated": item.get("pushed_at", "")[:10] if item.get("pushed_at") else "",
        })
    return results


# ─── Hacker News ─────────────────────────────────────────────────────────────

def search_hn(query: str, tag: str | None = None, limit: int = 5) -> list[dict]:
    params = {"query": query, "hitsPerPage": limit}
    if tag:
        params["tags"] = tag
    url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode(params)
    data = fetch_json(url)
    if not data or "hits" not in data:
        return []
    results = []
    for hit in data["hits"][:limit]:
        results.append({
            "title": hit.get("title", ""),
            "url": hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID','')}",
            "points": hit.get("points", 0),
            "comments": hit.get("num_comments", 0),
            "author": hit.get("author", ""),
            "created_at": (hit.get("created_at", "")[:10] if hit.get("created_at") else ""),
        })
    return results


# ─── GitHub Trending (scrape) ─────────────────────────────────────────────────

def get_github_trending() -> list[dict]:
    """Parse GitHub's trending page for today's repos."""
    html = fetch_text("https://github.com/trending?since=daily&spoken_language_code=en")
    if not html:
        return []
    results = []
    # Simple extraction: look for repo links in the format /owner/repo
    import re
    # Find article h2 a href patterns like /owner/repo
    matches = re.findall(r'href="(/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+)"[^>]*>', html)
    seen = set()
    for m in matches:
        parts = m.strip("/").split("/")
        if len(parts) == 2 and m not in seen:
            seen.add(m)
            results.append({
                "repo": m.strip("/"),
                "url": f"https://github.com{m}",
            })
        if len(results) >= 10:
            break
    return results


# ─── Message Formatting ──────────────────────────────────────────────────────

def build_message(
    github_results: dict[str, list],
    hn_results: list[dict],
    trending: list[dict],
) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"🔍 *Daily Intel Scanner* — {now}\n"]

    # GitHub topic highlights
    lines.append("━━━ 📦 GitHub Topic Hits ━━━")
    found_any = False
    for topic, repos in github_results.items():
        if repos:
            found_any = True
            lines.append(f"\n*#{topic}*")
            for r in repos[:3]:
                stars = f"⭐{r['stars']}" if r['stars'] else ""
                desc = r['description'][:80] + "…" if len(r['description']) > 80 else r['description']
                lines.append(f"  • [{r['title']}]({r['url']}) {stars}")
                if desc:
                    lines.append(f"    _{desc}_")
    if not found_any:
        lines.append("No new repos found.")

    # Hacker News
    lines.append("\n━━━ 🟠 Hacker News ━━━")
    if hn_results:
        seen_titles = set()
        for item in hn_results[:8]:
            t = item['title']
            if t and t not in seen_titles:
                seen_titles.add(t)
                pts = f"▲{item['points']}" if item['points'] else ""
                lines.append(f"  • [{t}]({item['url']}) {pts}")
    else:
        lines.append("Nothing notable.")

    # GitHub Trending
    lines.append("\n━━━ 🔥 GitHub Trending (Today) ━━━")
    if trending:
        for r in trending[:5]:
            lines.append(f"  • [{r['repo']}]({r['url']})")
    else:
        lines.append("Couldn't fetch trending.")

    lines.append("\n_Sent by intel-scanner · The Cooperative Agency_")
    return "\n".join(lines)


# ─── Telegram ────────────────────────────────────────────────────────────────

def send_telegram(message: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        print("[ERROR] Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID", file=sys.stderr)
        return False
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = json.dumps({
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }).encode()
    try:
        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode())
            if result.get("ok"):
                print("[OK] Telegram message sent.")
                return True
            else:
                print(f"[ERROR] Telegram API error: {result}", file=sys.stderr)
                return False
    except Exception as e:
        print(f"[ERROR] Telegram send failed: {e}", file=sys.stderr)
        return False


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print(f"[INFO] Intel scanner starting at {datetime.now().isoformat()}")

    # 1. GitHub topic search
    github_results = {}
    for topic in GITHUB_TOPICS:
        print(f"[INFO] Searching GitHub topic: {topic}")
        github_results[topic] = search_github_topic(topic)

    # 2. HN search
    hn_all = []
    for query, tag in HN_QUERIES:
        print(f"[INFO] Searching HN: '{query}' (tag={tag})")
        results = search_hn(query, tag, limit=5)
        hn_all.extend(results)

    # Deduplicate HN by URL
    seen_urls = set()
    hn_deduped = []
    for item in hn_all:
        if item["url"] not in seen_urls and item["title"]:
            seen_urls.add(item["url"])
            hn_deduped.append(item)

    # Sort by points desc
    hn_deduped.sort(key=lambda x: x.get("points", 0) or 0, reverse=True)

    # 3. GitHub trending
    print("[INFO] Fetching GitHub trending...")
    trending = get_github_trending()

    # 4. Build and send message
    message = build_message(github_results, hn_deduped, trending)
    print(f"[INFO] Message length: {len(message)} chars")
    print("[INFO] --- MESSAGE PREVIEW ---")
    print(message[:500])
    print("[INFO] --- END PREVIEW ---")

    success = send_telegram(message)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
