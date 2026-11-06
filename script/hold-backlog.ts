/**
 * Prints the reversible backlog-hold HTTP call. Does not write to production.
 *
 * Usage:
 *   npx tsx script/hold-backlog.ts
 *   npx tsx script/hold-backlog.ts --exclude 498,486,450,473
 */
const BASE = process.env.POSTENGINE_URL?.replace(/\/$/, "") || "https://postengine.thecoopbrla.com";

function parseExclude(argv: string[]): number[] {
  const index = argv.indexOf("--exclude");
  if (index === -1) return [];
  return (argv[index + 1] || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((id) => Number.isInteger(id));
}

const excludeIds = parseExclude(process.argv.slice(2));
const body = {
  scope: "due",
  dryRun: true,
  excludeIds,
  reason: "backlog hold",
};
console.log("# Dry-run first, then send the same body with dryRun:false only after Lance OKs it.");
console.log(`curl -sS -X POST "${BASE}/api/posts/hold-backlog" -H "X-Dashboard-Password: $POSTENGINE_PIN" -H "Content-Type: application/json" \\`);
console.log(`  -d '${JSON.stringify(body)}'`);
