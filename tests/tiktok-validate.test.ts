import { afterEach, test } from "node:test";
import * as assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { composePostContentFrom } from "../server/compose-captions";
import { holdPatchIfRequested } from "../server/post-hold";
import { evaluateApproveForPublish, evaluatePublishGate, selectPublishablePosts } from "../server/publish-gate";
import { storage } from "../server/storage";
import { publishPost, validateTikTokWithZernio } from "../server/zernio-publisher";
import { mergeTikTokSettings, validateTikTokPost } from "../shared/tiktok";

const NOW = new Date("2026-11-19T18:00:00.000Z");
const ORIGINAL_ACCOUNTS = process.env.ZERNIO_ACCOUNTS_PATH;
const ORIGINAL_TIKTOK = process.env.TIKTOK_PUBLISH_ENABLED;
const ORIGINAL_PUBLISH = process.env.PUBLISH_ENABLED;

afterEach(() => {
  if (ORIGINAL_ACCOUNTS === undefined) delete process.env.ZERNIO_ACCOUNTS_PATH;
  else process.env.ZERNIO_ACCOUNTS_PATH = ORIGINAL_ACCOUNTS;
  if (ORIGINAL_TIKTOK === undefined) delete process.env.TIKTOK_PUBLISH_ENABLED;
  else process.env.TIKTOK_PUBLISH_ENABLED = ORIGINAL_TIKTOK;
  if (ORIGINAL_PUBLISH === undefined) delete process.env.PUBLISH_ENABLED;
  else process.env.PUBLISH_ENABLED = ORIGINAL_PUBLISH;
});

const videoPost = {
  platforms: '["tiktok"]',
  mediaType: "video",
  mediaUrls: '["https://cdn.example.com/reel.mp4"]',
  captionTiktok: "A short Audi reel.",
  caption: "Click here --> @audi then click the linkin.bio to browse.",
  tiktokSettings: null,
};

test("TikTok validation rejects images, extra media, caption length, and private branded content", () => {
  const image = validateTikTokPost({ ...videoPost, mediaType: "image", mediaUrls: '["https://cdn.example.com/photo.jpg"]' });
  assert.ok(image.errors.some((error) => /one video/i.test(error)));

  const two = validateTikTokPost({
    ...videoPost,
    mediaUrls: '["https://cdn.example.com/a.mp4","https://cdn.example.com/b.mp4"]',
  });
  assert.ok(two.errors.some((error) => /one video/i.test(error)));

  const long = validateTikTokPost({ ...videoPost, captionTiktok: "a".repeat(2201) });
  assert.ok(long.errors.some((error) => /2200/.test(error)));

  const empty = validateTikTokPost({ ...videoPost, captionTiktok: "   ", caption: "" });
  assert.ok(empty.errors.some((error) => /caption/i.test(error)));

  const branded = validateTikTokPost({
    ...videoPost,
    tiktokSettings: JSON.stringify({ privacy_level: "SELF_ONLY", commercialContentType: "brand_organic" }),
  });
  assert.ok(branded.errors.some((error) => /private/i.test(error)));
});

test("creator info forces a disabled stitch toggle off", () => {
  const merged = mergeTikTokSettings(null, { allow_stitch: true }, {
    interactionSettings: { allow_stitch: { enabled: false } },
  });
  assert.equal(merged.ok, true);
  if (!merged.ok) return;
  assert.equal(merged.settings.allow_stitch, false);
});

test("a wide video warns and a too-short video is blocked", () => {
  const wide = validateTikTokPost(videoPost, {
    probe: { width: 1920, height: 1080, durationSec: 12, codec: "h264" },
  });
  assert.equal(wide.errors.length, 0);
  assert.ok(wide.warnings.some((warning) => /9:16/.test(warning)));

  const short = validateTikTokPost(videoPost, { probe: { durationSec: 2, width: 1080, height: 1920, codec: "h264" } });
  assert.ok(short.errors.some((error) => /seconds/.test(error)));

  const failed = validateTikTokPost(videoPost, { probe: { error: "probe failed" } });
  assert.equal(failed.errors.length, 0);
  assert.ok(failed.warnings.some((warning) => /inspect/i.test(warning)));
});

test("TikTok composition uses its own caption and never the Instagram linkin.bio line", () => {
  const dealer = { instagramCta: "Click here --> @audi then click the linkin.bio to browse." };
  const composed = composePostContentFrom({
    caption: "Showroom line.\n\n#Audi",
    captionTiktok: "TikTok line #AudiBR",
    ctaBlock: dealer.instagramCta,
  }, dealer);
  assert.equal(composed.tiktok, "TikTok line #AudiBR");
  assert.equal(composed.tiktok.includes("linkin.bio"), false);
  assert.match(composed.instagram, /linkin\.bio/);

  const fallback = composePostContentFrom({
    caption: "Fallback line #Audi",
    captionTiktok: null,
    ctaBlock: dealer.instagramCta,
  }, dealer);
  assert.equal(fallback.tiktok, "Fallback line #Audi");
  assert.equal(fallback.tiktok.includes("linkin.bio"), false);

  const exact = composePostContentFrom({
    caption: "ignored",
    captionTiktok: "  verbatim #keep  ",
    captionExact: true,
  }, dealer);
  assert.equal(exact.tiktok, "  verbatim #keep  ");
});

test("hold:true parks a new post out of the publish poller", () => {
  const created = {
    id: 42,
    dealershipId: 3,
    status: "queued",
    platforms: '["tiktok"]',
    scheduledFor: NOW.toISOString(),
    vehicleInfo: "2026 Audi Q5",
    captionTiktok: "Held reel",
    mediaType: "video",
    mediaUrls: '["https://cdn.example.com/reel.mp4"]',
  };
  const planned = holdPatchIfRequested(created, true, NOW, "held on create");
  assert.ok(planned && "patch" in planned);
  if (!planned || !("patch" in planned)) return;
  const held = { ...created, ...planned.patch };
  assert.equal(held.status, "held");
  assert.equal(held.heldAt, NOW.toISOString());
  assert.equal(held.statusBeforeHold, "queued");
  assert.equal(selectPublishablePosts([held], NOW).length, 0);
  assert.equal(evaluatePublishGate(held, NOW).reason, "Post is on hold");
  const refused = holdPatchIfRequested({ status: "published" }, true, NOW);
  assert.ok(refused && "error" in refused);
});

test("approve refuses a TikTok image post with a clear reason", () => {
  const decision = evaluateApproveForPublish({
    id: 7,
    dealershipId: 3,
    status: "scheduled",
    platforms: '["tiktok"]',
    mediaType: "image",
    mediaUrls: '["https://cdn.example.com/photo.jpg"]',
    captionTiktok: "Not a video",
    scheduledFor: "2026-11-20T18:00:00.000Z",
  }, [], NOW);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /one video|not mapped/i);
});

test("TikTok publish stays skipped when the flag is off, even with a mapped account", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tiktok-accounts-"));
  const accountsPath = path.join(dir, "accounts.json");
  fs.writeFileSync(accountsPath, JSON.stringify({
    accounts: { audi_baton_rouge: { tiktok: "acct_tiktok_example", instagram: "acct_ig_example" } },
  }));
  process.env.ZERNIO_ACCOUNTS_PATH = accountsPath;
  process.env.PUBLISH_ENABLED = "true";
  delete process.env.TIKTOK_PUBLISH_ENABLED;

  const post = {
    id: 9001,
    dealershipId: 3,
    status: "approved",
    approvedAt: new Date(Date.now() - 60_000).toISOString(),
    approvedBy: "Ada Example",
    scheduledFor: new Date(Date.now() - 60_000).toISOString(),
    platforms: '["tiktok"]',
    mediaType: "video",
    mediaUrls: '["https://cdn.example.com/reel.mp4"]',
    captionTiktok: "Mapped but not sent.",
    caption: "Click here --> @audi then click the linkin.bio",
    postType: "reels",
    notes: "[reel-finished]",
    publishResults: null,
    vehicleInfo: "2026 Audi Q5 example",
    heldAt: null,
  };
  t.mock.method(storage, "getPost", () => post);
  t.mock.method(storage, "getPosts", () => []);
  t.mock.method(storage, "getDealership", () => ({ id: 3, name: "Audi Example", instagramCta: "Click here --> @audi then click the linkin.bio" }));
  const updates: Array<Record<string, unknown>> = [];
  t.mock.method(storage, "updatePost", (_id: number, data: Record<string, unknown>) => {
    updates.push(data);
    return post;
  });
  t.mock.method(storage, "logActivity", () => undefined);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error("Zernio must not be called");
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await publishPost(post.id);
  assert.equal(calls.length, 0);
  assert.equal(result.success, false);
  assert.equal(result.results.tiktok.skipped, true);
  assert.equal(result.results.tiktok.reason, "TikTok publishing disabled");
  assert.equal(updates.some((update) => update.status === "published"), false);
});

test("dry-run validate refuses an unmapped store without calling Zernio", async (t) => {
  delete process.env.ZERNIO_ACCOUNTS_PATH;
  const post = {
    id: 4,
    dealershipId: 4,
    status: "held",
    platforms: '["tiktok"]',
    mediaType: "video",
    mediaUrls: '["https://cdn.example.com/reel.mp4"]',
    captionTiktok: "Porsche stays off.",
  };
  t.mock.method(storage, "getPost", () => post);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    throw new Error("Zernio must not be called");
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const result = await validateTikTokWithZernio(4);
  assert.equal(calls.length, 0);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /not mapped/i);
});
