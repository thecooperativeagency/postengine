import { loadConfig } from './session.js';

async function camofox(method, path, body, config) {
  const url = `${config.camofoxUrl}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Camofox ${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json().catch(() => null);
}

export async function navigateTo(tabId, url) {
  const config = loadConfig();
  await camofox('POST', `/tabs/${tabId}/navigate`, { userId: config.userId, url }, config);
}

export async function clickRef(tabId, ref) {
  const config = loadConfig();
  await camofox('POST', `/tabs/${tabId}/click`, { userId: config.userId, ref }, config);
}

export async function typeText(tabId, ref, text) {
  const config = loadConfig();
  await camofox('POST', `/tabs/${tabId}/type`, { userId: config.userId, ref, text }, config);
}

export async function takeScreenshot(tabId, outputPath) {
  const config = loadConfig();
  const res = await fetch(`${config.camofoxUrl}/tabs/${tabId}/screenshot?userId=${config.userId}`);
  if (!res.ok) throw new Error(`Screenshot failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  const { writeFileSync } = await import('fs');
  writeFileSync(outputPath, Buffer.from(buf));
  return outputPath;
}
