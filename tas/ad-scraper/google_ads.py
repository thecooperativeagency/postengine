#!/opt/homebrew/bin/python3
"""
Google Ads Transparency scraper for TAS.
Usage: python3 google_ads.py "Price LeBlanc Lexus"
"""

import sys
import json
import time
from datetime import datetime
from camoufox.sync_api import Camoufox


def scrape_google_ads(dealer_name: str, output_file: str = None) -> dict:
    results = {
        "dealer": dealer_name,
        "scraped_at": datetime.now().isoformat(),
        "source": "google_ads_transparency",
        "active_ads": [],
        "ad_count": 0,
        "ads_parsed": [],
        "url_after_search": None,
        "error": None
    }

    # Navigate directly to URL with query param (most reliable)
    search_url = f"https://adstransparency.google.com/?q={dealer_name.replace(' ', '+')}&region=US"

    try:
        with Camoufox(headless=True, geoip=True) as browser:
            page = browser.new_page()
            page.goto(search_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)

            # Take initial screenshot
            page.screenshot(path=f"/tmp/google_ads_{dealer_name.replace(' ', '_')}_initial.png")

            # Try to find and interact with search — multiple strategies
            content = page.inner_text("body")

            # Strategy 1: Look for search input and submit
            try:
                page.wait_for_selector('input', timeout=8000)
                inputs = page.query_selector_all('input')
                search_input = None
                for inp in inputs:
                    try:
                        if inp.is_visible():
                            search_input = inp
                            break
                    except:
                        pass

                if search_input:
                    # Clear and type
                    search_input.click(click_count=3)
                    time.sleep(0.3)
                    search_input.type(dealer_name, delay=80)
                    time.sleep(1)

                    # Take screenshot to see autocomplete state
                    page.screenshot(path=f"/tmp/google_ads_{dealer_name.replace(' ', '_')}_typed.png")

                    # Wait for autocomplete dropdown
                    time.sleep(2)

                    # Try clicking first autocomplete option
                    autocomplete_selectors = [
                        '[role="option"]',
                        '[role="listitem"]',
                        'mat-option',
                        '.pac-item',
                        '[class*="suggestion"]',
                        '[class*="autocomplete"]',
                        '[class*="dropdown"] li',
                        '[class*="dropdown"] a',
                    ]
                    clicked = False
                    for sel in autocomplete_selectors:
                        try:
                            opts = page.query_selector_all(sel)
                            for opt in opts:
                                if opt.is_visible():
                                    print(f"Clicking autocomplete: {sel} -> {opt.inner_text()[:60]}")
                                    opt.click()
                                    clicked = True
                                    time.sleep(3)
                                    break
                        except:
                            pass
                        if clicked:
                            break

                    if not clicked:
                        # No autocomplete — try pressing Enter
                        print("No autocomplete found, pressing Enter")
                        search_input.press('Enter')
                        time.sleep(3)

                    # Check if URL changed
                    page.screenshot(path=f"/tmp/google_ads_{dealer_name.replace(' ', '_')}_after_enter.png")
                    print(f"URL after first attempt: {page.url}")

                    # If still on homepage, try keyboard submit variations
                    if 'advertiser' not in page.url.lower() and '/advertiser/' not in page.url:
                        print("Still on homepage, trying more approaches...")
                        # Try focusing input and pressing Enter again
                        search_input.focus()
                        time.sleep(0.5)
                        page.keyboard.press('Enter')
                        time.sleep(3)
                        print(f"URL after second Enter: {page.url}")

                    # If still on homepage, try clicking search icon/button
                    if 'advertiser' not in page.url.lower() and '/advertiser/' not in page.url:
                        buttons = page.query_selector_all('button, [role="button"]')
                        for btn in buttons:
                            try:
                                if btn.is_visible():
                                    text = btn.inner_text().strip().lower()
                                    print(f"  Found button: '{text}'")
                                    if text in ('search', '') or 'search' in text:
                                        btn.click()
                                        time.sleep(3)
                                        print(f"URL after button click: {page.url}")
                                        break
                            except:
                                pass

            except Exception as e:
                print(f"Search interaction error: {e}")

            # Final screenshot after search attempt
            time.sleep(3)
            page.screenshot(path=f"/tmp/google_ads_{dealer_name.replace(' ', '_')}_results.png")
            content_after = page.inner_text("body")
            results["page_text_sample"] = content_after[:4000]
            results["url_after_search"] = page.url

            # Try CSS selectors for ad cards
            ad_cards = page.query_selector_all("creative-preview")
            if not ad_cards:
                ad_cards = page.query_selector_all('[class*="ad-card"]')
            if not ad_cards:
                ad_cards = page.query_selector_all('[class*="creative"]')

            results["ad_count"] = len(ad_cards)

            for i, card in enumerate(ad_cards[:10]):
                try:
                    text = card.inner_text()
                    results["active_ads"].append({"index": i, "text": text[:500]})
                except:
                    pass

            # Parse page text for ad intel (fallback when CSS selectors miss)
            lines = content_after.split('\n')
            ads_found = []
            for i, line in enumerate(lines):
                line = line.strip()
                if any(kw in line.lower() for kw in ['sponsored', 'ad by', 'advertiser', 'ran by', 'paid for']):
                    context = lines[max(0, i-2):i+5]
                    ads_found.append(' | '.join([l.strip() for l in context if l.strip()]))

            results["ads_parsed"] = ads_found[:20]
            if ads_found:
                results["ad_count"] = max(results["ad_count"], len(ads_found))

            if results["ad_count"] == 0:
                results["note"] = "No ads found — check /tmp screenshots for debugging"

    except Exception as e:
        results["error"] = str(e)

    if output_file:
        with open(output_file, "w") as f:
            json.dump(results, f, indent=2)
    else:
        print(json.dumps(results, indent=2))

    return results


if __name__ == "__main__":
    dealer = sys.argv[1] if len(sys.argv) > 1 else "Price LeBlanc Lexus"
    output = sys.argv[2] if len(sys.argv) > 2 else None
    scrape_google_ads(dealer, output)
