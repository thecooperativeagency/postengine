#!/usr/bin/env node
import { login, ensureSession, getSnapshot } from './lib/session.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const [,, cmd, ...args] = process.argv;

async function run() {
  switch (cmd) {

    case 'login': {
      const tabId = await login();
      console.log(`Logged in. Tab ID: ${tabId}`);
      break;
    }

    case 'snapshot': {
      const tabId = await ensureSession();
      const snap = await getSnapshot(tabId);
      console.log(snap);
      break;
    }

    case 'navigate': {
      const { navigate, sleep } = await import('./lib/session.js');
      const url = args[0];
      if (!url) { console.error('Usage: node index.js navigate <url>'); process.exit(1); }
      const tabId = await ensureSession();
      await navigate(tabId, url);
      await sleep(2000);
      const snap = await getSnapshot(tabId);
      console.log(snap);
      break;
    }

    case 'click': {
      const { clickRef, sleep } = await import('./lib/session.js');
      const ref = args[0];
      if (!ref) { console.error('Usage: node index.js click <ref>'); process.exit(1); }
      const tabId = await ensureSession();
      await clickRef(tabId, ref);
      await sleep(1500);
      const snap = await getSnapshot(tabId);
      console.log(snap);
      break;
    }

    case 'type': {
      const { typeText } = await import('./lib/session.js');
      const ref = args[0];
      const text = args.slice(1).join(' ');
      if (!ref || !text) { console.error('Usage: node index.js type <ref> <text>'); process.exit(1); }
      const tabId = await ensureSession();
      await typeText(tabId, ref, text);
      break;
    }

    case 'screenshot': {
      const { default: fs } = await import('fs');
      const tabId = await ensureSession();
      const snap = await getSnapshot(tabId);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const outPath = join(__dirname, 'screenshots', `screenshot-${ts}.json`);
      fs.writeFileSync(outPath, JSON.stringify(snap, null, 2));
      console.log(`Snapshot saved: ${outPath}`);
      break;
    }

    case 'inventory': {
      const { navigate, sleep } = await import('./lib/session.js');
      const tabId = await ensureSession();
      await navigate(tabId, 'https://app.ridemotive.com/inventory');
      await sleep(2500);
      const snap = await getSnapshot(tabId);
      console.log(snap);
      break;
    }

    case 'switcher': {
      const { clickRef, sleep } = await import('./lib/session.js');
      const tabId = await ensureSession();
      console.log('Clicking dealership switcher (e1)…');
      await clickRef(tabId, 'e1');
      await sleep(1500);
      const snap = await getSnapshot(tabId);
      console.log(snap);
      break;
    }

    case 'deploy': {
      const { deployPage } = await import('./lib/deploy.js');
      const cmsId = args[0];
      const htmlFile = args[1];
      if (!cmsId || !htmlFile) {
        console.error('Usage: node index.js deploy <cmsId> <htmlFile>');
        process.exit(1);
      }
      await deployPage(htmlFile, cmsId);
      break;
    }

    case 'redeploy-abr': {
      const { deployPage } = await import('./lib/deploy.js');
      const pages = [
        { id: '119721', file: '/Users/lucfaucheux/.openclaw/workspace/seo-pages/Audi Baton Rouge/audi-q7-vs-lexus-tx-baton-rouge.html' },
        { id: '119711', file: '/Users/lucfaucheux/.openclaw/workspace/seo-pages/Audi Baton Rouge/audi-q7-vs-mercedes-gle-baton-rouge.html' },
        { id: '119712', file: '/Users/lucfaucheux/.openclaw/workspace/seo-pages/Audi Baton Rouge/audi-q5-vs-lexus-rx-baton-rouge.html' },
      ];
      for (const p of pages) {
        await deployPage(p.file, p.id);
      }
      break;
    }

    default:
      console.log(`
Motive Browser CLI

Usage:
  node index.js login                        Log in and save session
  node index.js snapshot                     Print current page snapshot
  node index.js navigate <url>               Navigate to URL and print snapshot
  node index.js click <ref>                  Click element by ref (e.g. e1, e2)
  node index.js type <ref> <text>            Type text into an element
  node index.js screenshot                   Save snapshot to ./screenshots/
  node index.js inventory                    Navigate to /inventory and print snapshot
  node index.js switcher                     Click dealership switcher and print options
  node index.js deploy <cmsId> <htmlFile>    Deploy HTML file to CMS page
  node index.js redeploy-abr                 Redeploy all Audi Baton Rouge SEO pages

Prerequisites:
  Camofox must be running:
    cd ~/.openclaw/extensions/camofox-browser && npm start
`);
  }
}

run().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
