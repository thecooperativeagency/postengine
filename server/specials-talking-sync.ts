/**
 * Pull live rooftop specials into Switchboard talking points.
 * BMW/Audi = public Motive specials pages (not OEM scrapers).
 * Harris Porsche = latest Coop monthly sales email (page is often stale).
 * Replaces only the SALES block; keeps MILITARY / SERVICE / TIRES / RULES.
 */

import fs from "fs";
import path from "path";

export type SpecialsSyncStore = {
  dealershipId: number;
  name: string;
  brand: string;
};

export type SpecialsSyncResult = {
  dealershipId: number;
  name: string;
  sourceUrl: string;
  status: "updated" | "unchanged" | "skipped" | "failed";
  talkingPoints: string;
  reason?: string;
};

const FETCH_MS = 12_000;
const MAX_BRIEF = 4000;

const EVERGREEN_HEADER =
  /^(MILITARY|SERVICE|TIRES|RULES|FEATURED LEASES|LOT \/ DEMOS)\b/i;

const MONTH_NUM: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

const HP_EMAIL_DIRS = [
  "/Users/lucfaucheux/.openclaw/workspace/email-creative/Harris Porsche/Sales",
  "/Users/lucfaucheux/.hermes/work/repos/email-creative/Harris Porsche/Sales",
];

type Source =
  | { brand: "BMW" | "Audi"; url: string }
  | { brand: "Porsche"; kind: "monthly-email" };

export const SPECIALS_SOURCES: Record<number, Source> = {
  1: { url: "https://bmwofjackson.net/new-bmw-specials", brand: "BMW" },
  2: { url: "https://brianharrisbmw.com/new-bmw-specials2", brand: "BMW" },
  3: { url: "https://audibatonrouge.com/audi-baton-rouge-special-offers", brand: "Audi" },
  4: { brand: "Porsche", kind: "monthly-email" },
};

function monthLabel(d = new Date()): string {
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" }).toUpperCase();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ");
}

function uniqueLines(lines: string[], max = 24): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length < 8 || line.length > 220) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function hpFileScore(filename: string): number {
  const n = filename.toLowerCase();
  if (n.includes("inquiry") || n.includes("template") || n.includes("preview")) return -1;
  if (n.endsWith(".rtf") || n.endsWith(".md")) return -1;
  const monthMatch = n.match(
    /(january|february|march|april|may|june|july|august|september|october|november|december)(?:-20(\d{2})|-?(20\d{2}))/,
  );
  if (!monthMatch) return -1;
  const month = MONTH_NUM[monthMatch[1]];
  const year = Number(monthMatch[2] ? `20${monthMatch[2]}` : monthMatch[3]);
  if (!month || !year) return -1;
  let kind = 0;
  if (/harris-porsche-[a-z]+-20\d{2}-copy\.txt$/.test(n)) kind = 40;
  else if (/harris-porsche-[a-z]+-20\d{2}-email\.html$/.test(n)) kind = 35;
  else if (n.includes("drivers-cut") && n.endsWith(".html") && !n.includes("crm")) kind = 20;
  else if (n.includes("drivers-cut") && n.includes("crm")) kind = 10;
  else return -1;
  return year * 10000 + month * 100 + kind;
}

export function findLatestHpMonthlyEmail(): { absPath: string; filename: string } | null {
  const seen = new Map<string, { absPath: string; filename: string; score: number; mtime: number }>();
  for (const dir of HP_EMAIL_DIRS) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const filename of names) {
      const score = hpFileScore(filename);
      if (score < 0) continue;
      const absPath = path.join(dir, filename);
      let mtime = 0;
      try {
        mtime = fs.statSync(absPath).mtimeMs;
      } catch {
        continue;
      }
      const prev = seen.get(filename);
      if (!prev || mtime > prev.mtime) {
        seen.set(filename, { absPath, filename, score, mtime });
      }
    }
  }
  const ranked = [...seen.values()].sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  const top = ranked[0];
  if (!top) return null;
  return { absPath: top.absPath, filename: top.filename };
}

function splitEvergreen(existing: string): { sales: string; rest: string } {
  const lines = (existing || "").split(/\n/);
  const idx = lines.findIndex((l) => EVERGREEN_HEADER.test(l.trim()));
  if (idx <= 0) return { sales: existing || "", rest: "" };
  return {
    sales: lines.slice(0, idx).join("\n").trim(),
    rest: lines.slice(idx).join("\n").trim(),
  };
}

function bmwSalesBlock(name: string, url: string, text: string): string {
  const month = monthLabel();
  const hero =
    text.match(/0\.9%\s*APR on select[\s\S]{10,180}?models[^.]*\.?/i)?.[0]?.replace(/\s+/g, " ").trim() ||
    "0.9% APR on select X3 30 xDrive, X5 xDrive40i, MY27 X7, 330, and X1 models.";
  const leases = uniqueLines(
    [...text.matchAll(/Lease from \$[\d,]+\/month[^\n.]{0,120}/gi)].map((m) => m[0]),
    10,
  );
  const extras = uniqueLines(
    [
      ...[...text.matchAll(/0\.9%\s*APR for 60 months[^\n.]{0,80}/gi)].map((m) => m[0]),
      ...[...text.matchAll(/2\.99%\s*APR for 60 months[^\n.]{0,80}/gi)].map((m) => m[0]),
      ...[...text.matchAll(/15-month lease[^\n.]{0,80}/gi)].map((m) => m[0]),
    ],
    8,
  );
  const delivery = /November 2, 2026/.test(text) ? "delivery by 11/2/26" : "see specials page for delivery window";
  const lines = [
    `${month} — ${name.toUpperCase()} OFFER MIX (use only when relevant to the asset; never invent pricing)`,
    "",
    `SALES / APR / LEASE (live ${url.replace(/^https:\/\//, "")}; ${delivery}):`,
    `- Hero: October offers on the Ultimate Driving Machine. ${hero}`,
  ];
  if (leases.length) {
    lines.push("- Featured leases / APR from live specials:");
    for (const l of leases) lines.push(`  · ${l}`);
  }
  for (const e of extras) lines.push(`- ${e}`);
  lines.push(`- CTA: ${url.replace(/^https:\/\//, "")} — APR/lease in caption, not burned into lifestyle photos unless the asset is an offer graphic.`);
  lines.push("- Never invent a 15-month payment or a rate not on the page.");
  return lines.join("\n");
}

function audiSalesBlock(name: string, url: string, text: string): string {
  const month = monthLabel();
  const hero =
    text.match(/1\.99%[^.?\n]{0,80}/i)?.[0]?.replace(/\s+/g, " ").trim() ||
    "1.99% on the new Q3 and Q5.";
  const q8 = text.match(/Over \$12,000 off[^\n.]{0,40}/i)?.[0];
  const purchase = uniqueLines(
    [
      ...[...text.matchAll(/(Q3|Q5|Q7|Q8|A3|S3|A5|S5|A6)[\s\S]{0,40}(\$[0-9,]+ off|Up to \$[0-9,]+ off|Over \$[0-9,]+ off)/gi)].map(
        (m) => m[0].replace(/\s+/g, " "),
      ),
      ...[...text.matchAll(/\$[\d,]+ off \+ \$[\d,]+ (rebate|customer credit)[^\n.]{0,40}/gi)].map((m) => m[0]),
    ],
    14,
  );
  const leases = uniqueLines(
    [...text.matchAll(/\$[\d,]+\/mo[^\n]{0,80}due at signing/gi)].map((m) => m[0]),
    8,
  );
  const stocks = uniqueLines(
    [...text.matchAll(/Stock 26A\d{3}[^\n]{0,60}/gi)].map((m) => m[0]),
    8,
  );
  const lines = [
    `${month} — ${name.toUpperCase()} OFFER MIX (use only when relevant to the asset; never invent pricing). Language: off / savings / special / offer / rebate / customer credit — never “discount”.`,
    "",
    `SALES / PURCHASE (live specials; select in-stock only):`,
    `- Hero: ${hero}${q8 ? ` ${q8}.` : ""}`,
  ];
  for (const p of purchase) lines.push(`- ${p}`);
  if (leases.length || stocks.length) {
    lines.push("", "FEATURED LEASES (36 mo / 10k / named stock only — do not attach a lease to a different VIN):");
    for (const l of leases) lines.push(`- ${l}`);
    for (const s of stocks) lines.push(`- ${s}`);
  }
  lines.push(`CTA: ${url.replace(/^https:\/\//, "")}`);
  return lines.join("\n");
}

function porscheOfferCorpus(text: string): string {
  const lot = text.match(/On the Lot[\s\S]{0,2500}?(?=On Saturday|On the Road|On the Table|On the Town|$)/i);
  return lot ? lot[0] : text;
}

function porscheSalesBlock(name: string, sourceLabel: string, text: string): string {
  const month = monthLabel();
  const corpus = porscheOfferCorpus(text);
  const offers = uniqueLines(
    [
      ...[...corpus.matchAll(/Pre-owned Macans[^\n.]{0,140}/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/from \$[\d,]{4,}[^\n.]{0,90}/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/(?:Macan|Cayenne|Taycan)[^\n]{0,140}\$[\d,]{4,}[^\n]{0,90}/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/Courtesy Vehicles[^\n]{0,80}/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/Executive Demo[^\n]{0,110}/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/Stock [A-Z0-9]{4,}[^\n]{0,80}/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/\$[\d,]+ off a genuine brake job/gi)].map((m) => m[0]),
      ...[...corpus.matchAll(/Lease a Macan for \$[\d,]+\/Month[^\n.]{0,120}/gi)].map((m) => m[0]),
    ],
    10,
  );
  const lines = [
    `${month} — ${name.toUpperCase()} (use only when relevant to the asset; never invent pricing)`,
    "",
    `SALES (latest Coop monthly email: ${sourceLabel} — not harris.porsche.com/specials/new):`,
  ];
  if (offers.length) {
    for (const o of offers) lines.push(`- ${o}`);
  } else {
    lines.push("- Email pull found no offer lines — keep existing mix; do not invent pricing.");
  }
  lines.push("- CTA: harris.porsche.com inventory. One offer focus per caption.");
  return lines.join("\n");
}

function composeBrief(
  brand: "BMW" | "Audi" | "Porsche",
  name: string,
  sourceLabel: string,
  pageText: string,
  existing: string,
): string {
  const { rest } = splitEvergreen(existing);
  const sales =
    brand === "BMW"
      ? bmwSalesBlock(name, sourceLabel, pageText)
      : brand === "Audi"
        ? audiSalesBlock(name, sourceLabel, pageText)
        : porscheSalesBlock(name, sourceLabel, pageText);
  const merged = rest ? `${sales.trim()}\n\n${rest.trim()}` : sales.trim();
  return merged.slice(0, MAX_BRIEF);
}

function extractionLooksUsable(brand: "BMW" | "Audi" | "Porsche", pageText: string): boolean {
  const t = pageText.replace(/\s+/g, " ");
  if (brand === "BMW") {
    return /0\.9%\s*APR/i.test(t) && /Lease from \$[\d,]+/i.test(t);
  }
  if (brand === "Audi") {
    return /1\.99%/.test(t) || (t.match(/\$[\d,]+ off/gi) || []).length >= 3;
  }
  return /(macan|cayenne|taycan)/i.test(t) && /\$[\d,]+/.test(t);
}

async function loadSourceText(src: Source): Promise<{ text: string; sourceUrl: string }> {
  if (src.brand === "Porsche") {
    const latest = findLatestHpMonthlyEmail();
    if (!latest) throw new Error("no Harris Porsche monthly email found in email-creative");
    const raw = fs.readFileSync(latest.absPath, "utf8");
    const text = latest.filename.endsWith(".html") ? stripHtml(raw) : raw;
    return { text, sourceUrl: latest.filename };
  }
  const html = await fetchText(src.url);
  return { text: stripHtml(html), sourceUrl: src.url };
}

export async function syncTalkingPointsFromSpecials(opts: {
  stores: SpecialsSyncStore[];
  getExisting: (dealershipId: number) => string;
  save: (dealershipId: number, talkingPoints: string) => void;
  force?: boolean;
}): Promise<SpecialsSyncResult[]> {
  const results: SpecialsSyncResult[] = [];
  const currentMonth = monthLabel();
  for (const store of opts.stores) {
    const src = SPECIALS_SOURCES[store.dealershipId];
    if (!src) {
      results.push({
        dealershipId: store.dealershipId,
        name: store.name,
        sourceUrl: "",
        status: "skipped",
        talkingPoints: opts.getExisting(store.dealershipId),
        reason: "no specials URL mapped",
      });
      continue;
    }
    const existing = opts.getExisting(store.dealershipId) || "";
    if (!opts.force && existing.toUpperCase().includes(currentMonth)) {
      results.push({
        dealershipId: store.dealershipId,
        name: store.name,
        sourceUrl: "url" in src ? src.url : "",
        status: "unchanged",
        talkingPoints: existing,
        reason: "current-month brief already set",
      });
      continue;
    }
    try {
      const { text, sourceUrl } = await loadSourceText(src);
      if (text.replace(/\s+/g, "").length < 200 || !extractionLooksUsable(src.brand, text)) {
        results.push({
          dealershipId: store.dealershipId,
          name: store.name,
          sourceUrl,
          status: "failed",
          talkingPoints: existing,
          reason: "source too thin or missing offer claims",
        });
        continue;
      }
      const next = composeBrief(src.brand, store.name, sourceUrl, text, existing);
      if (next.trim() === existing.trim()) {
        results.push({
          dealershipId: store.dealershipId,
          name: store.name,
          sourceUrl,
          status: "unchanged",
          talkingPoints: existing,
        });
        continue;
      }
      opts.save(store.dealershipId, next);
      results.push({
        dealershipId: store.dealershipId,
        name: store.name,
        sourceUrl,
        status: "updated",
        talkingPoints: next,
      });
    } catch (err) {
      results.push({
        dealershipId: store.dealershipId,
        name: store.name,
        sourceUrl: "url" in src ? src.url : "",
        status: "failed",
        talkingPoints: existing,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
