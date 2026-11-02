/**
 * Screenshots of the dashboard with fictional stores only.
 * Playwright fulfills /api so the live database is never rendered.
 *
 *   PHASE=before node scripts/capture-ui-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const phase = process.env.PHASE === "after" ? "after" : "before";
const base = process.env.SHOT_BASE || "http://127.0.0.1:5000";
const outDir = path.resolve("docs/ui-redesign");

const dealers = [
  {
    id: 1,
    name: "Harbor & Pine",
    brand: "North",
    domain: "harbor.example",
    location: "Cedar Bay",
    color: "#111111",
    instagramHandle: "@harbor.example",
    facebookPage: "Harbor Pine",
    tiktokHandle: "",
    captionTemplate: "Stop by Cedar Bay.",
    instagramCta: "See it at harbor.example",
    facebookCta: "",
    gmbCta: "",
  },
  {
    id: 2,
    name: "Redbird Motor Co.",
    brand: "Field",
    domain: "redbird.example",
    location: "Milltown",
    color: "#7a1f1f",
    instagramHandle: "@redbird.example",
    facebookPage: "Redbird",
    tiktokHandle: "",
    captionTemplate: "",
    instagramCta: "",
    facebookCta: "",
    gmbCta: "",
  },
  {
    id: 3,
    name: "Northline Sport",
    brand: "Line",
    domain: "northline.example",
    location: "West Landing",
    color: "#333333",
    instagramHandle: "@northline.example",
    facebookPage: "Northline",
    tiktokHandle: "",
    captionTemplate: "",
    instagramCta: "",
    facebookCta: "",
    gmbCta: "",
  },
];

const posts = [
  {
    id: 11,
    dealershipId: 1,
    status: "queued",
    postType: "New Cars",
    vehicleInfo: "Grey coupe, front row",
    caption: "Grey coupe on the front row. Quiet, and ready for a long drive home.",
    captionFacebook: "Same grey coupe, now with the weekend hours.",
    captionGmb: "Grey coupe is on the lot in Cedar Bay.",
    hashtags: "#sample",
    ctaBlock: "See it at harbor.example",
    mediaUrls: "[]",
    mediaType: "image",
    platforms: '["instagram","facebook","googlebusiness"]',
    scheduledFor: "2026-11-03T15:00:00",
    publishedAt: null,
    folderSource: "sample-intake",
    notes: "",
    createdAt: "2026-11-02T08:10:00",
  },
  {
    id: 12,
    dealershipId: 1,
    status: "queued",
    postType: "Service",
    vehicleInfo: "Loaner pickup",
    caption: "Loaner is washed and waiting by the service drive.",
    captionFacebook: "",
    captionGmb: "Loaner pickup is open today.",
    hashtags: "",
    ctaBlock: "",
    mediaUrls: "[]",
    mediaType: "image",
    platforms: '["instagram","facebook"]',
    scheduledFor: "2026-11-04T14:00:00",
    publishedAt: null,
    folderSource: "sample-intake",
    notes: "",
    createdAt: "2026-11-02T08:40:00",
  },
  {
    id: 21,
    dealershipId: 2,
    status: "scheduled",
    postType: "New Cars",
    vehicleInfo: "Red wagon",
    caption: "Red wagon, already approved.",
    captionFacebook: "",
    captionGmb: "",
    hashtags: "",
    ctaBlock: "",
    mediaUrls: "[]",
    mediaType: "image",
    platforms: '["instagram"]',
    scheduledFor: "2026-10-28T15:00:00",
    publishedAt: null,
    folderSource: null,
    notes: "",
    createdAt: "2026-10-20T12:00:00",
  },
  {
    id: 31,
    dealershipId: 3,
    status: "published",
    postType: "Parts & Accessories",
    vehicleInfo: "Winter kit",
    caption: "Winter kit, already out.",
    captionFacebook: "",
    captionGmb: "",
    hashtags: "",
    ctaBlock: "",
    mediaUrls: "[]",
    mediaType: "image",
    platforms: '["facebook"]',
    scheduledFor: "2026-11-01T15:00:00",
    publishedAt: "2026-11-01T15:05:00",
    folderSource: "sample-intake",
    notes: "",
    createdAt: "2026-11-01T09:00:00",
  },
];

const dashboard = {
  stats: { total: 4, draft: 0, queued: 2, scheduled: 1, published: 1 },
  dealerships: dealers.map((dealer) => ({
    ...dealer,
    postCount: posts.filter((post) => post.dealershipId === dealer.id).length,
    scheduledCount: posts.filter((post) => post.dealershipId === dealer.id && post.status === "scheduled").length,
    draftCount: 0,
    queuedCount: posts.filter((post) => post.dealershipId === dealer.id && post.status === "queued").length,
    daysBehind: dealer.id === 2 ? 5 : dealer.id === 3 ? 1 : 0,
    driveInCount: posts.filter((post) => post.dealershipId === dealer.id && post.folderSource).length,
  })),
  recentActivity: [
    { id: 1, postId: 11, dealershipId: 1, action: "created", details: "Imported grey coupe from the sample library", createdAt: "2026-11-02T08:10:00" },
    { id: 2, postId: 31, dealershipId: 3, action: "published", details: "Published winter kit", createdAt: "2026-11-01T15:05:00" },
  ],
  driveArrivals: [
    { id: 12, dealershipId: 1, vehicleInfo: "Loaner pickup", postType: "Service", status: "queued", createdAt: "2026-11-02T08:40:00" },
    { id: 11, dealershipId: 1, vehicleInfo: "Grey coupe, front row", postType: "New Cars", status: "queued", createdAt: "2026-11-02T08:10:00" },
    { id: 31, dealershipId: 3, vehicleInfo: "Winter kit", postType: "Parts & Accessories", status: "published", createdAt: "2026-11-01T09:00:00" },
  ],
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function shoot(page, name) {
  await page.screenshot({ path: path.join(outDir, `${phase}-${name}.png`), fullPage: true });
}

const browser = await chromium.launch();
await mkdir(outDir, { recursive: true });

async function prepare(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === "/api/auth/config") return json(route, { enabled: false, authMode: "pin", appName: "ENGINE" });
    if (pathname === "/api/dashboard") return json(route, dashboard);
    if (pathname === "/api/engine/status") {
      return json(route, { paused: false, lastRunAt: "2026-11-02T07:00:00", lastRunCount: "3", driveScan: { running: false, jobId: null, startedAt: null } });
    }
    if (pathname === "/api/caption-brief") {
      return json(route, {
        legacyGlobal: null,
        stores: dealers.map((dealer) => ({
          dealershipId: dealer.id,
          name: dealer.name,
          brand: dealer.brand,
          color: dealer.color,
          talkingPoints: dealer.id === 1 ? "Weekend hours. Grey coupe on the front row." : "",
          updatedAt: "2026-11-01T12:00:00",
        })),
      });
    }
    if (pathname === "/api/caption-brief/sync") {
      return json(route, { success: true, results: [], stores: [] });
    }
    if (pathname === "/api/dealerships") return json(route, dealers);
    if (pathname === "/api/posts/11") return json(route, posts[0]);
    if (pathname === "/api/posts") {
      const status = url.searchParams.get("status");
      const dealershipId = url.searchParams.get("dealershipId");
      let rows = posts;
      if (status) rows = rows.filter((post) => post.status === status);
      if (dealershipId) rows = rows.filter((post) => String(post.dealershipId) === dealershipId);
      return json(route, rows);
    }
    if (pathname === "/api/cadence") {
      return json(route, [
        {
          id: 1,
          dealershipId: 1,
          postType: "New Cars",
          daysOfWeek: '["monday","wednesday","friday"]',
          postsPerDay: 1,
          autoTime: true,
          manualTime: null,
          platforms: '["instagram","facebook","googlebusiness"]',
          isActive: true,
          reelsConfigured: true,
          reelsEnabled: false,
          reelsPerWeek: 0,
        },
      ]);
    }
    if (pathname === "/api/drive/config") {
      return json(route, {
        account: "studio@example.com",
        parentFolderId: null,
        parentFolderName: "Sample library",
        dealerships: dealers.map((dealer) => ({
          id: dealer.id,
          name: dealer.name,
          brand: dealer.brand,
          rootFolderId: "",
          folders: { "New Cars": "sample", Service: "sample" },
        })),
      });
    }
    if (pathname === "/api/engine/reel-health") {
      return json(route, {
        floorWeeks: 2,
        totals: { weeklyReelTarget: 0, inventoryFloor: 0, available: 1, shortfall: 0, unconfiguredRules: 0 },
        dealerships: dealers.map((dealer) => ({
          dealershipId: dealer.id,
          dealershipName: dealer.name,
          weeklyReelTarget: 0,
          inventoryFloor: 0,
          available: dealer.id === 3 ? 1 : 0,
          shortfall: 0,
          unconfiguredRules: 0,
          healthy: true,
          driveVideosAvailable: 0,
          activeVideoPosts: 0,
        })),
      });
    }
    return json(route, {});
  });
}

const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await prepare(desktop);
await desktop.goto(`${base}/#/`, { waitUntil: "networkidle" });
await desktop.getByText("Harbor & Pine").first().waitFor({ timeout: 20000 });
await shoot(desktop, "stores-desktop");

await desktop.goto(`${base}/#/queue`, { waitUntil: "networkidle" });
await desktop.getByText("Grey coupe, front row").first().waitFor({ timeout: 20000 });
await shoot(desktop, "review-desktop");

await desktop.goto(`${base}/#/settings`, { waitUntil: "networkidle" });
await desktop.getByText(/Post Specs|Cadence|Stores/).first().waitFor({ timeout: 20000 });
await shoot(desktop, "settings-desktop");

await desktop.goto(`${base}/#/posts/11`, { waitUntil: "networkidle" });
await desktop.getByText(/Edit Post|Caption/).first().waitFor({ timeout: 20000 });
await shoot(desktop, "edit-desktop");

const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
await prepare(phone);
await phone.goto(`${base}/#/`, { waitUntil: "networkidle" });
await phone.getByText("Harbor & Pine").first().waitFor({ timeout: 20000 });
await shoot(phone, "stores-mobile");
await phone.goto(`${base}/#/queue`, { waitUntil: "networkidle" });
await phone.getByText("Grey coupe, front row").first().waitFor({ timeout: 20000 });
await shoot(phone, "review-mobile");

await browser.close();
console.log(`wrote ${phase} screenshots to ${outDir}`);
