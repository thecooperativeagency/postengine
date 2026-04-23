#!/opt/homebrew/bin/python3
"""
Meta Ad Library scraper for TAS.
Pulls active ads for a dealer by name.
Usage: python3 meta_ads.py "Brian Harris BMW"
"""

import sys
import json
import time
from datetime import datetime
from camoufox.sync_api import Camoufox

def scrape_meta_ads(dealer_name: str, output_file: str = None) -> dict:
    """
    Scrape Meta Ad Library for a dealer.
    Returns dict with ad count, active ads, offers found.
    """
    results = {
        "dealer": dealer_name,
        "scraped_at": datetime.now().isoformat(),
        "source": "meta_ad_library",
        "active_ads": [],
        "ad_count": 0,
        "error": None
    }

    url = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q={dealer_name.replace(' ', '+')}&search_type=keyword_unordered"

    try:
        with Camoufox(headless=True, geoip=True) as browser:
            page = browser.new_page()
            page.goto(url, wait_until="networkidle", timeout=30000)
            time.sleep(3)  # let JS render

            # Take screenshot for debugging
            page.screenshot(path=f"/tmp/meta_ads_{dealer_name.replace(' ', '_')}.png")

            # Get full page text
            content = page.inner_text("body")

            # Try to find ad containers
            # Meta Ad Library renders ads in divs — look for ad cards
            ad_cards = page.query_selector_all('[data-testid="ad-archive-renderer"]')
            if not ad_cards:
                # Try alternate selectors
                ad_cards = page.query_selector_all('div[class*="x1qjc9v5"]')  # Meta's internal class

            results["ad_count"] = len(ad_cards)
            results["page_text_sample"] = content[:2000]  # first 2000 chars for debugging

            # Extract ad text from each card
            for i, card in enumerate(ad_cards[:10]):  # limit to 10
                try:
                    text = card.inner_text()
                    results["active_ads"].append({
                        "index": i,
                        "text": text[:500]
                    })
                except:
                    pass

            # If no cards found via selector, parse text for ad indicators
            if results["ad_count"] == 0:
                # Look for patterns in page text
                if "No ads found" in content:
                    results["note"] = "No active ads found for this dealer"
                elif "Active" in content and ("results" in content.lower() or "ads" in content.lower()):
                    results["note"] = "Ads may be present but selectors need updating — check screenshot"
                else:
                    results["note"] = "Page loaded but no ad data extracted — check screenshot"

    except Exception as e:
        results["error"] = str(e)

    if output_file:
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
        print(f"Saved to {output_file}")
    else:
        print(json.dumps(results, indent=2))

    return results


if __name__ == "__main__":
    dealer = sys.argv[1] if len(sys.argv) > 1 else "Brian Harris BMW"
    output = sys.argv[2] if len(sys.argv) > 2 else None
    scrape_meta_ads(dealer, output)
