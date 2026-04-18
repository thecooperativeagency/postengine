const { firefox } = require('playwright');

(async () => {
  const browser = await firefox.launch({
    headless: true,
    executablePath: '/Users/lucfaucheux/Library/Caches/camoufox/Camoufox.app/Contents/MacOS/camoufox'
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });

  const page = await context.newPage();
  console.log('Navigating to site...');
  await page.goto('https://www.jalexsound.com/', { waitUntil: 'networkidle' });
  console.log('Waiting for JS render...');
  await page.waitForTimeout(4000);

  // Scroll slowly multiple times
  console.log('Scrolling to load lazy images...');
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight / 2));
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2000);

  // Extract images
  console.log('Extracting images...');
  const images = await page.evaluate(() => {
    const imgData = [];
    const seen = new Set();

    // Images
    document.querySelectorAll('img').forEach(img => {
      const src = img.src;
      if (!src || src.startsWith('data:') || src.includes('blob:') || src.includes('wixstatic.com/wix') && src.includes('/thumbnails/')) return;
      
      const srcset = img.getAttribute('srcset') || '';
      const dataSrc = img.dataset.src || '';
      const alt = img.alt?.trim() || '';
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      
      if ((w > 100 || h > 100) && !src.match(/icon|favicon|logo|placeholder|loading|arrow|button|social|wix-lightbox|thumbs/i)) {
        const key = src;
        if (!seen.has(key)) {
          seen.add(key);
          imgData.push({
            type: 'img',
            src,
            srcset,
            dataSrc,
            alt,
            width: w,
            height: h
          });
        }
      }
    });

    // Background images
    const bgData = [];
    document.querySelectorAll('*').forEach(el => {
      try {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none' && bgImage.startsWith('url(')) {
          const match = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
          if (match) {
            const bgSrc = match[1];
            if (!bgSrc.match(/icon|favicon|logo|placeholder|loading|gradient/i) && !bgSrc.includes('wixstatic.com/wix') && bgSrc.includes('wixstatic') ) { // adjust
              const key = bgSrc;
              if (!seen.has(key)) {
                seen.add(key);
                bgData.push({
                  type: 'background',
                  src: bgSrc,
                  element: el.tagName + (el.className ? '.' + el.className.split(' ').join('.') : ''),
                  width: el.offsetWidth,
                  height: el.offsetHeight
                });
              }
            }
          }
        }
      } catch (e) {}
    });

    return { imgs: imgData, bgs: bgData };
  });

  console.log(JSON.stringify(images, null, 2));

  await browser.close();
})();
