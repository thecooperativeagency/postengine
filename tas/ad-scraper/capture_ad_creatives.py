#!/opt/homebrew/bin/python3
"""
Capture full individual ad creatives from Meta Ad Library.
Extracts Library IDs from the overview page, then visits each ad's detail page.
"""
import sys, time, os, re
from camoufox.sync_api import Camoufox

def capture_creatives(dealer_name: str, max_ads: int = 8):
    slug = dealer_name.lower().replace(' ', '_')
    output_dir = f'/tmp/creatives_{slug}'
    os.makedirs(output_dir, exist_ok=True)

    url = f"https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q={dealer_name.replace(' ', '+')}&search_type=keyword_unordered"

    with Camoufox(headless=True) as browser:
        page = browser.new_page()
        page.set_viewport_size({"width": 1440, "height": 900})
        page.goto(url, wait_until='networkidle', timeout=30000)
        time.sleep(4)

        # Scroll down progressively to load all ad cards and capture overview
        for i in range(6):
            pos = i * 400
            page.evaluate(f'window.scrollTo(0, {pos})')
            time.sleep(1.5)
            page.screenshot(path=f'{output_dir}/overview_scroll_{pos}.png')
            print(f'Overview at scroll {pos} saved')

        # Extract all Library IDs from page text
        page_text = page.evaluate('document.body.innerText')
        library_ids = re.findall(r'Library ID:\s*(\d+)', page_text)
        library_ids = list(dict.fromkeys(library_ids))  # deduplicate preserving order
        print(f'\nFound {len(library_ids)} unique Library IDs: {library_ids}')

        # Also try to extract via "See ad details" buttons/links
        details_buttons = page.query_selector_all('text="See ad details"')
        print(f'Found {len(details_buttons)} "See ad details" buttons')

        # Visit each ad detail page using Library ID
        for i, lib_id in enumerate(library_ids[:max_ads]):
            try:
                ad_url = f'https://www.facebook.com/ads/library/?id={lib_id}'
                print(f'\nVisiting ad {i+1}: {ad_url}')
                page.goto(ad_url, wait_until='networkidle', timeout=25000)
                time.sleep(3)

                # Scroll down a bit to ensure creative is visible
                page.evaluate('window.scrollTo(0, 200)')
                time.sleep(1)

                # Viewport screenshot (what you'd see)
                page.screenshot(path=f'{output_dir}/ad_{i+1}_view.png', full_page=False)

                # Full page screenshot (captures everything)
                page.screenshot(path=f'{output_dir}/ad_{i+1}_full.png', full_page=True)
                print(f'Ad {i+1} (ID: {lib_id}) captured')

            except Exception as e:
                print(f'Ad {i+1} error: {e}')
                continue

    print(f'\nAll screenshots saved to {output_dir}')
    return output_dir

if __name__ == '__main__':
    dealer = sys.argv[1] if len(sys.argv) > 1 else 'Galleria BMW'
    capture_creatives(dealer)
