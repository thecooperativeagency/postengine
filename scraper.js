import { firefox } from 'playwright';

(async () => {
  const executablePath = '/Users/lucfaucheux/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox';
  const browser = await firefox.launch({
    executablePath,
    headless: true,
    args: ['--headless', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0'
  });

  const page = await context.newPage();

  await page.goto('https://www.jalexsound.com/selected-work', { waitUntil: 'networkidle' });

  await page.waitForTimeout(5000);

  await page.evaluate(async () => {
    for (let i = 0; i < 5; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 1000));
    }
  });

  const images = await page.evaluate(() => {
    const urls = new Set();

    // imgs
    document.querySelectorAll('img').forEach(img => {
      ['src', 'data-src', 'data-lazy-src'].forEach(attr => {
        const val = img.getAttribute(attr);
        if (val && val.startsWith('http')) urls.add(val);
      });
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach(p => {
          const u = p.trim().split(' ')[0];
          if (u.startsWith('http')) urls.add(u);
        });
      }
    });

    // backgrounds
    document.querySelectorAll('*').forEach(el => {
      const style = getComputedStyle(el);
      const bg = style.backgroundImage;
      if (bg.startsWith('url(')) {
        const match = bg.match(/url\\((.+)\\)/);
        if (match) {
          const urlStr = match[1].trim().replace(/^["']|["']$/g, '');
          if (urlStr.startsWith('http')) urls.add(urlStr);
        }
      }
    });

    return Array.from(urls);
  });

  const fullResUrls = [...new Set(images.filter(u => u.includes('wixstatic.com') && (u.includes('.jpg') || u.includes('.png') || u.includes('.webp')) && !u.includes('favicon') && !u.includes('icon') && !u.includes('logo')).map(u => {
    let clean = u.split('?')[0];
    clean = clean.replace(/\/v1\/[^\/]*$/g, '');
    if (clean.includes('/media/') && !clean.includes('~mv2')) {
      const ext = clean.match(/\\.(jpg|jpeg|png|webp)$/i);
      if (ext) {
        clean = clean.slice(0, -ext[0].length) + '~mv2' + ext[0];
      }
    }
    return clean;
  }))];

  console.log('FULL RES IMAGE URLS:');
  fullResUrls.forEach((u, i) => console.log(u));
  console.log('Total: ' + fullResUrls.length);

  await browser.close();
})();
