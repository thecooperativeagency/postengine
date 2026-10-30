/**
 * Railway cron entrypoint for the Sunday PostEngine Drive scan.
 * Calls the web service over the private network, then sends the weekly
 * Telegram summary. Exits non-zero when the scan fails so the cron run
 * shows as failed.
 *
 * Schedule (set on the cron service): 07:00 UTC Sunday.
 * That is 02:00 America/Chicago during CDT and 01:00 during CST.
 */

const headers = { "Content-Type": "application/json" };
if (process.env.CRON_SECRET) headers["X-Cron-Secret"] = process.env.CRON_SECRET;

if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD) {
  const token = Buffer.from(
    `${process.env.BASIC_AUTH_USER}:${process.env.BASIC_AUTH_PASSWORD}`,
  ).toString("base64");
  headers.Authorization = `Basic ${token}`;
}

function baseUrl() {
  if (process.env.POSTENGINE_URL) return process.env.POSTENGINE_URL.replace(/\/$/, "");
  const host = process.env.POSTENGINE_HOST;
  if (!host) {
    console.error("Set POSTENGINE_URL or POSTENGINE_HOST");
    process.exit(1);
  }
  const scheme = process.env.POSTENGINE_SCHEME || "http";
  const port = process.env.POSTENGINE_PORT;
  return port ? `${scheme}://${host}:${port}` : `${scheme}://${host}`;
}

async function post(base, path) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers });
  const text = await res.text();
  console.log(`${path} ${res.status} ${text.slice(0, 400)}`);
  if (!res.ok) {
    throw new Error(`${path} failed with HTTP ${res.status}`);
  }
}

const base = baseUrl();
console.log(`[weekly-scan] ${new Date().toISOString()} calling ${base}`);

let scanFailed = false;
try {
  await post(base, "/api/drive/scan");
} catch (err) {
  scanFailed = true;
  console.error("[weekly-scan] Drive scan failed:", err instanceof Error ? err.message : "unknown");
}

try {
  await post(base, "/api/notify/weekly");
} catch (err) {
  console.error("[weekly-scan] Weekly summary failed:", err instanceof Error ? err.message : "unknown");
  process.exit(1);
}

if (scanFailed) process.exit(1);
