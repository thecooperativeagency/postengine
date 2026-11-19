import { test } from "node:test";
import * as assert from "node:assert/strict";

import { buildZernioPostBody } from "../server/zernio-payload";
import { mergeTikTokSettings, TIKTOK_DEFAULTS, tiktokSettingsSchema } from "../shared/tiktok";

const now = new Date("2026-11-19T12:00:00.000Z");

test("TikTok video payload includes required settings and no publishNow", () => {
  const body = buildZernioPostBody({
    content: "Audi reel for the weekend.",
    accountId: "acct_tiktok_example",
    platform: "tiktok",
    mediaUrls: ["https://cdn.example.com/reel.mp4"],
    mediaType: "video",
    scheduledAt: "2026-11-19T18:00:00.000Z",
    now,
    tiktokSettings: {
      privacy_level: "PUBLIC_TO_EVERYONE",
      allow_comment: true,
      allow_duet: true,
      allow_stitch: true,
      video_cover_timestamp_ms: 1000,
      video_made_with_ai: false,
      commercialContentType: "none",
    },
  });

  assert.equal("publishNow" in body, false);
  assert.equal("dryRun" in body, false);
  assert.deepEqual(body, {
    content: "Audi reel for the weekend.",
    platforms: [{ accountId: "acct_tiktok_example", platform: "tiktok" }],
    mediaItems: [{ url: "https://cdn.example.com/reel.mp4", type: "video" }],
    scheduledFor: "2026-11-19T18:00:00.000Z",
    tiktokSettings: {
      privacy_level: "PUBLIC_TO_EVERYONE",
      allow_comment: true,
      allow_duet: true,
      allow_stitch: true,
      video_cover_timestamp_ms: 1000,
      video_made_with_ai: false,
      commercialContentType: "none",
      content_preview_confirmed: true,
      express_consent_given: true,
    },
  });
});

test("dryRun is set only when requested", () => {
  const body = buildZernioPostBody({
    content: "Dry run caption",
    accountId: "acct_tiktok_example",
    platform: "tiktok",
    mediaUrls: ["https://cdn.example.com/reel.mov"],
    mediaType: "video",
    scheduledAt: "2026-11-19T18:00:00.000Z",
    now,
    dryRun: true,
    tiktokSettings: { privacy_level: "PUBLIC_TO_EVERYONE", allow_comment: true, allow_duet: false, allow_stitch: false },
  });
  assert.equal(body.dryRun, true);
  assert.equal((body.mediaItems as Array<{ type: string }>)[0].type, "video");
  const plain = buildZernioPostBody({
    content: "Still caption",
    accountId: "acct_example",
    platform: "instagram",
    mediaUrls: ["https://cdn.example.com/photo.jpg"],
    mediaType: "image",
    scheduledAt: "2026-11-19T18:00:00.000Z",
    now,
    dryRun: true,
  });
  assert.equal("dryRun" in plain, false);
  assert.equal("tiktokSettings" in plain, false);
});

test("per-post TikTok settings beat store defaults, which beat the global defaults", () => {
  const merged = mergeTikTokSettings(
    { allow_duet: false, privacy_level: "SELF_ONLY" },
    { privacy_level: "PUBLIC_TO_EVERYONE", allow_stitch: false },
  );
  assert.equal(merged.ok, true);
  if (!merged.ok) return;
  assert.equal(merged.settings.privacy_level, "PUBLIC_TO_EVERYONE");
  assert.equal(merged.settings.allow_duet, false);
  assert.equal(merged.settings.allow_stitch, false);
  assert.equal(merged.settings.allow_comment, TIKTOK_DEFAULTS.allow_comment);
  assert.equal(merged.settings.commercialContentType, "none");
  assert.equal(merged.settings.video_made_with_ai, false);
});

test("unknown TikTok settings are rejected", () => {
  assert.throws(() => tiktokSettingsSchema.parse({ locationId: "nope" }));
  const merged = mergeTikTokSettings(null, { notAField: true });
  assert.equal(merged.ok, false);
});
