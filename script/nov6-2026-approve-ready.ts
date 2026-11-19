/**
 * One-time Nov 6, 2026 helper.
 *
 * Default mode prints HTTP steps. It does not talk to production, edit
 * captions or media, delete posts, or flip PUBLISH_ENABLED.
 *
 * Ready to approve individually after deploy + a later OK: 498 (BMWJ X3), 450 (ABR RS Q8).
 * Held with the backlog pending a new review: 486 (BHBMW M4), 473 (HP GT3 RS).
 * Approving one post never approves another.
 */
import {
  NOV6_2026_APPROVE_NONCE,
  NOV6_2026_APPROVAL_DATE,
  NOV6_2026_HELD_FOR_REVIEW_IDS,
  NOV6_2026_READY_POST_IDS,
} from "../server/nov6-2026-publish-allowlist";

const BASE = process.env.POSTENGINE_URL?.replace(/\/$/, "") || "https://postengine.thecoopbrla.com";
const PIN = "$POSTENGINE_PIN";

function printHttp() {
  const readyIds = [...NOV6_2026_READY_POST_IDS];
  const heldIds = [...NOV6_2026_HELD_FOR_REVIEW_IDS];
  const header = `-H "X-Dashboard-Password: ${PIN}" -H "Content-Type: application/json"`;
  console.log("# Prepared only. Do not run until the PR is deployed and Lance OKs the live hold/approve steps.");
  console.log(`# Date ${NOV6_2026_APPROVAL_DATE} America/Chicago. No caption or media edits. No PUBLISH_ENABLED flip here.`);
  console.log(`# Ready IDs (one approval each): ${readyIds.join(", ")}. Held for new review: ${heldIds.join(", ")}.`);
  console.log("");
  console.log("# 1) Preview today's due and overdue posts (read-only)");
  console.log(`curl -sS "${BASE}/api/posts/preview-due?date=${NOV6_2026_APPROVAL_DATE}" -H "X-Dashboard-Password: ${PIN}"`);
  console.log("");
  console.log("# 2) Dry-run hold of due backlog, including 486 and 473; exclude only 498 and 450");
  console.log(`curl -sS -X POST "${BASE}/api/posts/hold-backlog" ${header} \\`);
  console.log(`  -d '${JSON.stringify({
    scope: "due",
    dryRun: true,
    excludeIds: readyIds,
    reason: "Nov 6 2026 backlog hold; keep 486 and 473 held pending new review",
  })}'`);
  console.log("");
  console.log("# 3) Apply that hold (reversible; no deletes)");
  console.log(`curl -sS -X POST "${BASE}/api/posts/hold-backlog" ${header} \\`);
  console.log(`  -d '${JSON.stringify({
    scope: "due",
    dryRun: false,
    excludeIds: readyIds,
    reason: "Nov 6 2026 backlog hold; keep 486 and 473 held pending new review",
  })}'`);
  console.log("");
  console.log("# 4) Approve 498 only (does not approve 450 or any other post; does not publish)");
  console.log(`curl -sS -X POST "${BASE}/api/posts/approve-publish" ${header} \\`);
  console.log(`  -d '${JSON.stringify({
    ids: [498],
    date: NOV6_2026_APPROVAL_DATE,
    nonce: NOV6_2026_APPROVE_NONCE,
    approvedBy: "Lance",
  })}'`);
  console.log("");
  console.log("# 5) Approve 450 only (separate request; does not approve 498 or any other post; does not publish)");
  console.log(`curl -sS -X POST "${BASE}/api/posts/approve-publish" ${header} \\`);
  console.log(`  -d '${JSON.stringify({
    ids: [450],
    date: NOV6_2026_APPROVAL_DATE,
    nonce: NOV6_2026_APPROVE_NONCE,
    approvedBy: "Lance",
  })}'`);
  console.log("");
  console.log("# Do not approve 486 or 473 on this path. They wait for a new review after the availability check.");
  console.log("# Do not set PUBLISH_ENABLED=true until there is a separate all-clear and Lance OKs turning publishing on.");
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--apply")) {
    console.error("Refusing --apply in this helper. Use the printed HTTP steps after deploy.");
    printHttp();
    process.exit(1);
  }
  printHttp();
}

main();
