import { test } from "node:test";
import * as assert from "node:assert/strict";

import { TIKTOK_CREATE_HOLD_REASON, isTikTokCreateHold } from "../shared/tiktok";
import { buildHoldPatch, buildReleaseHoldPatch, evaluateApproveForPublish, isActiveQueuePost } from "../server/publish-gate";

const now = new Date("2026-11-19T20:00:00.000Z");

function queuedTikTokPost() {
  return {
    id: 1,
    dealershipId: 3,
    status: "queued",
    platforms: '["tiktok"]',
    vehicleInfo: "Example reel",
    caption: "Example caption",
    captionTiktok: "Example TikTok caption",
    mediaType: "video",
    mediaUrls: JSON.stringify(["https://cdn.example.com/reel.mp4"]),
    scheduledFor: "2026-12-20T18:00:00.000Z",
    approvedAt: null,
    approvedBy: null,
    heldAt: null,
    heldReason: null,
    statusBeforeHold: null,
    publishResults: null,
  } as any;
}

test("a TikTok post held on create shows in the queue and cannot be approved until released", () => {
  const held = { ...queuedTikTokPost(), ...buildHoldPatch(queuedTikTokPost(), now, TIKTOK_CREATE_HOLD_REASON) };
  assert.equal(held.status, "held");
  assert.equal(isActiveQueuePost(held), false);
  assert.equal(isTikTokCreateHold(held), true);
  assert.equal(evaluateApproveForPublish(held, [], now).ok, false);

  const released = { ...held, ...buildReleaseHoldPatch(held) };
  assert.equal(released.status, "queued");
  assert.equal(released.heldAt, null);
  assert.equal(released.heldReason, null);
  assert.equal(isActiveQueuePost(released), true);
  assert.equal(isTikTokCreateHold(released), false);
  assert.deepEqual(evaluateApproveForPublish(released, [], now), { ok: true, reason: "ok" });
});

test("backlog holds stay out of the review queue", () => {
  const backlog = { ...queuedTikTokPost(), status: "scheduled" };
  const held = { ...backlog, ...buildHoldPatch(backlog, now, "backlog hold") };
  assert.equal(isTikTokCreateHold(held), false);
  assert.equal(isActiveQueuePost(held), false);
});
