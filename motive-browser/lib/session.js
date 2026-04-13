import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dir, '../config.json');

function loadConfig() {
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(data) {
  const config = loadConfig();
  writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, ...data }, null, 2));
}

async function api(method, path, body) {
  const config = loadConfig();
  const res = await fetch(`${config.camofoxUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json().catch(() => ({}));
}

async function openTab(url) {
  const config = loadConfig();
  const r = await api('POST', '/tabs/open', { url, userId: config.userId });
  return r.tabId;
}

async function getSnapshot(tabId) {
  const config = loadConfig();
  const r = await api('GET', `/tabs/${tabId}/snapshot?userId=${config.userId}`);
  return r;
}

async function isTabAlive(tabId) {
  if (!tabId) return false;
  try {
    const s = await getSnapshot(tabId);
    return !!s.url;
  } catch {
    return false;
  }
}

async function typeText(tabId, ref, text) {
  const config = loadConfig();
  return api('POST', `/tabs/${tabId}/type`, { userId: config.userId, ref, text });
}

async function clickRef(tabId, ref) {
  const config = loadConfig();
  return api('POST', `/tabs/${tabId}/click`, { userId: config.userId, ref });
}

async function pressKey(tabId, key, ref) {
  const config = loadConfig();
  const body = { userId: config.userId, key };
  if (ref) body.ref = ref;
  return api('POST', `/tabs/${tabId}/press`, body);
}

async function evaluate(tabId, expression) {
  const config = loadConfig();
  const r = await api('POST', `/tabs/${tabId}/evaluate`, { userId: config.userId, expression });
  return r.result;
}

async function navigate(tabId, url) {
  const config = loadConfig();
  return api('POST', `/tabs/${tabId}/navigate`, { userId: config.userId, url });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function login() {
  const config = loadConfig();
  console.log('Opening tab...');
  const tabId = await openTab('https://app.ridemotive.com');
  await sleep(6000);
  const s = await getSnapshot(tabId);
  const url = s.url || '';
  if (url.includes('login')) {
    console.log('Logging in...');
    await typeText(tabId, 'e1', config.email);
    await sleep(1000);
    await clickRef(tabId, 'e2');
    await sleep(5000);
    await typeText(tabId, 'e2', config.password);
    await sleep(1000);
    await clickRef(tabId, 'e5');
    await sleep(7000);
  }
  saveConfig({ tabId });
  console.log(`Logged in. Tab: ${tabId}`);
  return tabId;
}

async function switchToStore(tabId, searchTerm) {
  console.log(`Switching to store: ${searchTerm}`);
  await navigate(tabId, 'https://app.ridemotive.com/inventory');
  await sleep(4000);

  // Open switcher - click the top-left store button via JS (more reliable than ref)
  await evaluate(tabId, `(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      const txt = b.textContent || '';
      if (txt.includes('bmwofjackson') || txt.includes('audibatonrouge') || txt.includes('brianharrisbmw') || txt.includes('bmwofjackson.net') || txt.includes('bmwofjackson')) {
        b.click(); return 'clicked: ' + txt.substring(0,30);
      }
    }
    // fallback to e1
    document.querySelector('[data-ref=e1]')?.click();
    return 'fallback';
  })()`);
  await sleep(3000);

  // Get search ref from snapshot
  const s = await getSnapshot(tabId);
  const snap = s.snapshot || '';
  const m = snap.match(/textbox "Search name, domain, or ID" \[(e\d+)\]/);
  const searchRef = m ? m[1] : 'e2';
  console.log(`Dialog open: ${snap.includes('Search name')}, search ref: ${searchRef}`);

  if (!snap.includes('Search name')) {
    // Dialog didn't open - try clicking e1 directly
    await clickRef(tabId, 'e1');
    await sleep(3000);
  }

  await typeText(tabId, searchRef, 'audi');
  await sleep(2000);

  // Click ABR listitem - always search for Audi Baton Rouge specifically
  const clickResult = await evaluate(tabId, `(() => {
    const items = document.querySelectorAll('li, [role=listitem], [role=option]');
    for (const item of items) {
      if (item.textContent.includes('Audi Baton Rouge') || item.textContent.includes('1772')) {
        item.click(); return 'clicked ABR';
      }
    }
    // Try any audi match
    for (const item of items) {
      if (item.textContent.toLowerCase().includes('audi')) {
        item.click(); return 'clicked audi item';
      }
    }
    return 'not found, items: ' + items.length;
  })()`);
  console.log(`Store click: ${clickResult}`);
  await sleep(6000);

  const s2 = await getSnapshot(tabId);
  const snap2 = s2.snapshot || '';
  const onStore = snap2.substring(0, 500).includes('Audi Baton Rouge');
  console.log(`On store: ${onStore}`);
  return onStore;
}

async function ensureSession(storeSearch = 'audi') {
  const config = loadConfig();
  const alive = await isTabAlive(config.tabId);
  let tabId = config.tabId;

  if (!alive) {
    console.log('Session expired, logging in fresh...');
    tabId = await login();
  }

  // Switch to correct store
  await switchToStore(tabId, storeSearch);
  return tabId;
}

export {
  login,
  ensureSession,
  getSnapshot,
  navigate,
  clickRef,
  typeText,
  pressKey,
  evaluate,
  isTabAlive,
  sleep,
};
