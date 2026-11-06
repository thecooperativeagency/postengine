/**
 * Prints the read-only preview HTTP call for a Chicago calendar date.
 *
 * Usage:
 *   npx tsx script/preview-due-posts.ts
 *   npx tsx script/preview-due-posts.ts --date 2026-11-06
 */
const BASE = process.env.POSTENGINE_URL?.replace(/\/$/, "") || "https://postengine.thecoopbrla.com";
const argv = process.argv.slice(2);
const dateIndex = argv.indexOf("--date");
const date = dateIndex >= 0 ? argv[dateIndex + 1] : "2026-11-06";
console.log(`curl -sS "${BASE}/api/posts/preview-due?date=${date}" -H "X-Dashboard-Password: $POSTENGINE_PIN"`);
