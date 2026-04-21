#!/opt/homebrew/bin/python3
"""
TAS Ad Recon — run full ad intelligence for a dealer.
Usage: python3 run_recon.py "Brian Harris BMW"
Output: tas/data/{dealer_slug}/ads_{date}.json
"""

import sys
import json
import os
import subprocess
import tempfile
from datetime import datetime

def run_scraper(script_name: str, dealer_name: str) -> dict:
    """Run a scraper as a subprocess to avoid asyncio loop conflicts."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(script_dir, script_name)

    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        tmp_path = f.name

    try:
        result = subprocess.run(
            ["/opt/homebrew/bin/python3", script_path, dealer_name, tmp_path],
            capture_output=True, text=True, timeout=60
        )
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print(result.stderr, file=sys.stderr)

        with open(tmp_path) as f:
            return json.load(f)
    except subprocess.TimeoutExpired:
        return {"dealer": dealer_name, "error": "Scraper timed out after 60s", "ad_count": 0, "active_ads": []}
    except Exception as e:
        return {"dealer": dealer_name, "error": str(e), "ad_count": 0, "active_ads": []}
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

def run_recon(dealer_name: str):
    slug = dealer_name.lower().replace(" ", "-")
    date = datetime.now().strftime("%Y-%m-%d")

    data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", slug)
    os.makedirs(data_dir, exist_ok=True)

    output_path = os.path.join(data_dir, f"ads_{date}.json")

    print(f"\n🔍 TAS Ad Recon: {dealer_name}")
    print(f"{'='*50}")

    print("\n📘 Scraping Meta Ad Library...")
    meta = run_scraper("meta_ads.py", dealer_name)

    print("\n🔍 Scraping Google Ads Transparency...")
    google = run_scraper("google_ads.py", dealer_name)

    combined = {
        "dealer": dealer_name,
        "date": date,
        "meta": meta,
        "google": google,
        "summary": {
            "meta_ad_count": meta["ad_count"],
            "google_ad_count": google["ad_count"],
            "meta_error": meta.get("error"),
            "google_error": google.get("error"),
        }
    }

    with open(output_path, "w") as f:
        json.dump(combined, f, indent=2)

    print(f"\n✅ Done. Saved to {output_path}")
    print(f"   Meta ads found: {meta['ad_count']}")
    print(f"   Google ads found: {google['ad_count']}")

    if meta.get("note"): print(f"   Meta note: {meta['note']}")
    if google.get("note"): print(f"   Google note: {google['note']}")

    print(f"\n📸 Screenshots: /tmp/meta_ads_*.png and /tmp/google_ads_*.png")

    return combined


if __name__ == "__main__":
    dealer = sys.argv[1] if len(sys.argv) > 1 else "Brian Harris BMW"
    run_recon(dealer)
