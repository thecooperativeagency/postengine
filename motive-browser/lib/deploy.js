import { readFileSync } from 'fs';
import { ensureSession, getSnapshot, navigate, clickRef, typeText, evaluate, sleep } from './session.js';

function stripFont(html) {
  return html.replace(/<style>[\s\S]*?<\/style>/g, '').trim();
}

async function deployPage(htmlFile, cmsId, storeSearch = 'audi') {
  console.log(`\nDeploying to cms/${cmsId}...`);

  const tabId = await ensureSession(storeSearch);

  const html = readFileSync(htmlFile, 'utf8');
  const stripped = stripFont(html);
  console.log(`HTML size: ${stripped.length.toLocaleString()} chars`);

  // Navigate to page editor
  await navigate(tabId, `https://app.ridemotive.com/cms/${cmsId}`);
  await sleep(5000);

  const s = await getSnapshot(tabId);
  if (!s.url?.includes(`/cms/${cmsId}`)) {
    throw new Error(`Wrong URL: ${s.url}`);
  }

  // STEP 1: Delete ALL existing Raw HTML blocks
  console.log('Deleting existing Raw HTML blocks...');
  let deleteCount = 0;
  for (let i = 0; i < 10; i++) {
    const si = await getSnapshot(tabId);
    const snapi = si.snapshot || '';
    const deleteMatch = snapi.match(/button "delete Delete" \[(e\d+)\]/);
    if (!deleteMatch) break;
    await clickRef(tabId, deleteMatch[1]);
    await sleep(2000);
    deleteCount++;
  }
  console.log(`Deleted ${deleteCount} block(s).`);

  // STEP 2: Add fresh Raw HTML block
  console.log('Adding fresh Raw HTML block...');
  
  // Get snapshot after delete to find Add button
  const s2 = await getSnapshot(tabId);
  const snap2 = s2.snapshot || '';
  const addMatch = snap2.match(/button "add Add" \[(e\d+)\]/);
  const addRef = addMatch ? addMatch[1] : 'e26';
  
  await clickRef(tabId, addRef);
  await sleep(3000);

  // Search for Raw HTML in the component picker
  const s3 = await getSnapshot(tabId);
  const snap3 = s3.snapshot || '';
  const searchMatch = snap3.match(/textbox "Search components\.\.\." \[(e\d+)\]/);
  const searchRef = searchMatch ? searchMatch[1] : 'e26';

  await typeText(tabId, searchRef, 'Raw HTML');
  await sleep(2000);

  // Click Raw HTML option
  await evaluate(tabId, `(() => {
    const opts = document.querySelectorAll('[role=option], li, .option, [class*=option]');
    for (const o of opts) {
      if (o.textContent.includes('Raw HTML')) {
        o.click();
        return 'clicked';
      }
    }
    return 'not found';
  })()`);
  await sleep(4000);

  // STEP 3: Click Code tab and inject HTML
  console.log('Opening code editor...');
  await evaluate(tabId, `(() => {
    for (const el of document.querySelectorAll('*')) {
      if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 && el.textContent.trim() === 'Code') {
        el.click();
        return 'done';
      }
    }
  })()`);
  await sleep(2000);

  // Find editor ref
  const s4 = await getSnapshot(tabId);
  const snap4 = s4.snapshot || '';
  const editorMatch = snap4.match(/textbox "Editor content" \[(e\d+)\]/);
  const eref = editorMatch ? editorMatch[1] : 'e34';
  console.log(`Editor ref: ${eref}`);

  // Type into fresh empty editor
  await typeText(tabId, eref, stripped);
  await sleep(5000);

  // Publish - find button dynamically
  const s5pre = await getSnapshot(tabId);
  const snap5pre = s5pre.snapshot || '';
  const pubMatch = snap5pre.match(/button "Publish [^"]*" \[(e\d+)\]/);
  const pubRef = pubMatch ? pubMatch[1] : 'e23';
  console.log(`Publish ref: ${pubRef}`);
  await clickRef(tabId, pubRef);
  await sleep(5000);

  const s5 = await getSnapshot(tabId);
  const published = s5.snapshot?.toLowerCase().includes('published') || false;
  console.log(published ? '✅ Published!' : '❌ Failed');
  return published;
}

export { deployPage };
