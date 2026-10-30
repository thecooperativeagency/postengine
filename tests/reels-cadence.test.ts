import assert from "node:assert/strict";
import test from "node:test";

import {
  getReelSlotsToFill,
  isVideoMedia,
  selectFilesForCadenceSlots,
} from "../server/drive-scanner";
import { insertCadenceSchema, REEL_INVENTORY_FLOOR_WEEKS } from "../shared/schema";

test("getReelSlotsToFill reserves remaining weekly reel target", () => {
  assert.equal(
    getReelSlotsToFill({
      reelsEnabled: true,
      reelsPerWeek: 3,
      weeksWindow: 1,
      existingVideoPostsInWindow: 1,
      openSlots: 5,
    }),
    2,
  );
});

test("getReelSlotsToFill is zero when reels disabled", () => {
  assert.equal(
    getReelSlotsToFill({
      reelsEnabled: false,
      reelsPerWeek: 5,
      weeksWindow: 1,
      existingVideoPostsInWindow: 0,
      openSlots: 4,
    }),
    0,
  );
});

test("getReelSlotsToFill never exceeds open slots", () => {
  assert.equal(
    getReelSlotsToFill({
      reelsEnabled: true,
      reelsPerWeek: 7,
      weeksWindow: 1,
      existingVideoPostsInWindow: 0,
      openSlots: 2,
    }),
    2,
  );
});

test("selectFilesForCadenceSlots prefers videos for reel slots", () => {
  const files = [
    { id: "v1", mimeType: "video/mp4", classification: { modelKey: "x3", shootCluster: "a", lookBucket: "exterior", shotType: "exterior" } },
    { id: "v2", mimeType: "video/quicktime", classification: { modelKey: "x5", shootCluster: "b", lookBucket: "exterior", shotType: "exterior" } },
    { id: "i1", mimeType: "image/jpeg", classification: { modelKey: "m4", shootCluster: "c", lookBucket: "exterior", shotType: "exterior" } },
    { id: "i2", mimeType: "image/jpeg", classification: { modelKey: "q5", shootCluster: "d", lookBucket: "exterior", shotType: "exterior" } },
  ];

  const selected = selectFilesForCadenceSlots(files, 3, 2);
  assert.equal(selected.length, 3);
  const videoCount = selected.filter((f) => isVideoMedia(f)).length;
  assert.equal(videoCount, 2);
  assert.equal(selected.filter((f) => !isVideoMedia(f)).length, 1);
});

test("insertCadenceSchema requires reels preference", () => {
  const bad = insertCadenceSchema.safeParse({
    dealershipId: 1,
    postType: "New Cars",
    daysOfWeek: '["monday"]',
    postsPerDay: 1,
    autoTime: true,
    manualTime: null,
    platforms: '["instagram"]',
    isActive: true,
    reelsConfigured: false,
    reelsEnabled: false,
    reelsPerWeek: 0,
  });
  assert.equal(bad.success, false);

  const good = insertCadenceSchema.safeParse({
    dealershipId: 1,
    postType: "New Cars",
    daysOfWeek: '["monday"]',
    postsPerDay: 1,
    autoTime: true,
    manualTime: null,
    platforms: '["instagram"]',
    isActive: true,
    reelsConfigured: true,
    reelsEnabled: true,
    reelsPerWeek: 2,
  });
  assert.equal(good.success, true);
  assert.equal(REEL_INVENTORY_FLOOR_WEEKS, 2);
});
