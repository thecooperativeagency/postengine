import { test } from "node:test";
import * as assert from "node:assert/strict";

import { filterPostsForApi } from "../server/routes";
import { withPublishLock, resetPublishLocks } from "../server/publish-lock";
import {
  APPROVAL_WINDOW_REASON,
  applyScheduledExpiry,
  buildApprovePublishPatch,
  buildRestoreExpiredPatch,
  evaluateApproveForPublish,
  evaluatePublishGate,
  isActiveQueuePost,
  listPublishBlockReasons,
  SCHEDULED_EXPIRY_EXCLUDED_IDS,
  shouldExpireScheduledPost,
  type PublishGatePost,
} from "../server/publish-gate";

const NOW = new Date("2026-11-12T16:00:00.000Z");
const WINDOW_MS = 2 * 60 * 60 * 1000;
const FUTURE_SLOT = "2026-11-13T16:00:00.000Z";
const PAST_SLOT = "2026-11-01T16:00:00.000Z";

function post(overrides: Partial<PublishGatePost> & Pick<PublishGatePost, "id" | "status" | "dealershipId">): PublishGatePost {
  return {
    vehicleInfo: "2026 BMW X5",
    caption: "The X5 is in.",
    mediaUrls: '["https://example.com/x5.jpg"]',
    platforms: '["instagram","facebook"]',
    postType: "inventory",
    scheduledFor: FUTURE_SLOT,
    ...overrides,
  };
}

test("approve refuses held rows and does not publish", () => {
  const held = post({
    id: 450,
    dealershipId: 3,
    status: "held",
    heldAt: NOW.toISOString(),
    heldReason: "backlog hold",
  });
  const decision = evaluateApproveForPublish(held, [], NOW);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /hold/i);
  assert.equal(held.status, "held");
  assert.equal(held.caption, "The X5 is in.");
});

test("approve refuses a slot past the 2-hour window and allows one still inside it", () => {
  const late = post({
    id: 70,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: new Date(NOW.getTime() - WINDOW_MS - 1).toISOString(),
  });
  const inside = post({
    id: 71,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: new Date(NOW.getTime() - WINDOW_MS).toISOString(),
  });
  const lateDecision = evaluateApproveForPublish(late, [], NOW);
  assert.equal(lateDecision.ok, false);
  assert.equal(lateDecision.reason, APPROVAL_WINDOW_REASON);
  assert.equal(evaluateApproveForPublish(inside, [], NOW).ok, true);
  assert.equal(late.status, "scheduled");
});

test("approve refuses a post that already has a Zernio id", () => {
  const sent = post({
    id: 81,
    dealershipId: 2,
    status: "scheduled",
    publishResults: JSON.stringify({ instagram: { success: true, postId: "zernio-81" } }),
  });
  const decision = evaluateApproveForPublish(sent, [], NOW);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /Zernio/);
  assert.equal(sent.publishResults?.includes("zernio-81"), true);
});

test("approve refuses the same vehicle inside 21 days and allows an older one", () => {
  const target = post({
    id: 800,
    dealershipId: 2,
    status: "scheduled",
    vehicleInfo: "2026 BMW X5",
    scheduledFor: "2026-11-13T16:00:00.000Z",
  });
  const recent = post({
    id: 216,
    dealershipId: 2,
    status: "published",
    vehicleInfo: "2026 bmw x5",
    scheduledFor: "2026-10-24T16:00:00.000Z",
    publishedAt: "2026-10-24T16:00:00.000Z",
  });
  const older = post({
    id: 100,
    dealershipId: 2,
    status: "published",
    vehicleInfo: "2026 bmw x5",
    scheduledFor: "2026-10-01T16:00:00.000Z",
    publishedAt: "2026-10-01T16:00:00.000Z",
  });
  const blocked = evaluateApproveForPublish(target, [recent], NOW);
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /recent post 216/);
  assert.equal(evaluateApproveForPublish(target, [older], NOW).ok, true);
  const reasons = listPublishBlockReasons(target, { now: NOW, siblings: [recent], publishEnabled: true });
  assert.ok(reasons.includes(blocked.reason));
});

test("approve only marks the post approved and does not take the publish lock", async () => {
  resetPublishLocks();
  const queued = post({ id: 90, dealershipId: 1, status: "queued" });
  const decision = evaluateApproveForPublish(queued, [], NOW);
  assert.equal(decision.ok, true);
  const patch = buildApprovePublishPatch("Lance", NOW);
  assert.deepEqual(patch, {
    status: "approved",
    approvedAt: NOW.toISOString(),
    approvedBy: "Lance",
  });
  assert.equal(patch.status === "approved", true);
  assert.equal("publishResults" in patch, false);
  assert.equal(queued.status, "queued");
  const locked = await withPublishLock(queued.id, async () => "free");
  assert.deepEqual(locked, { acquired: true, result: "free" });
  resetPublishLocks();
});

test("block reasons include the gate reason and the extra publisher checks", () => {
  const samples = [
    post({ id: 1, dealershipId: 1, status: "held", heldAt: NOW.toISOString() }),
    post({ id: 2, dealershipId: 1, status: "scheduled" }),
    post({ id: 3, dealershipId: 1, status: "queued" }),
    post({ id: 4, dealershipId: 1, status: "draft", scheduledFor: null }),
    post({ id: 5, dealershipId: 1, status: "rejected" }),
    post({ id: 6, dealershipId: 1, status: "expired" }),
    post({
      id: 7,
      dealershipId: 1,
      status: "approved",
      approvedAt: "2026-11-01T16:00:00.000Z",
      approvedBy: "Lance",
      scheduledFor: PAST_SLOT,
    }),
    post({
      id: 8,
      dealershipId: 1,
      status: "scheduled",
      scheduledFor: PAST_SLOT,
    }),
  ];
  for (const sample of samples) {
    const gate = evaluatePublishGate(sample, NOW);
    const reasons = listPublishBlockReasons(sample, { now: NOW, publishEnabled: true, siblings: [] });
    assert.equal(gate.ok, false);
    assert.ok(reasons.includes(gate.reason), `${sample.id} missing ${gate.reason}`);
  }

  const overdue = samples[7];
  const overdueReasons = listPublishBlockReasons(overdue, { now: NOW, publishEnabled: true, siblings: [] });
  assert.ok(overdueReasons.includes(APPROVAL_WINDOW_REASON));

  const due = post({
    id: 9,
    dealershipId: 1,
    status: "approved",
    approvedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    approvedBy: "Lance",
    scheduledFor: new Date(NOW.getTime() - 60_000).toISOString(),
  });
  assert.equal(evaluatePublishGate(due, NOW).ok, true);
  assert.deepEqual(listPublishBlockReasons(due, { now: NOW, publishEnabled: true, siblings: [] }), []);
  assert.deepEqual(listPublishBlockReasons(due, { now: NOW, publishEnabled: false, siblings: [] }), ["Publisher is off"]);

  const sent = post({
    ...due,
    id: 10,
    publishResults: JSON.stringify({ facebook: { postId: "zernio-10" } }),
  });
  assert.equal(evaluatePublishGate(sent, NOW).ok, true);
  assert.deepEqual(listPublishBlockReasons(sent, { now: NOW, publishEnabled: true, siblings: [] }), [
    "Post already has a Zernio post id",
  ]);
});

test("expiry leaves held rows and the listed backlog ids untouched and deletes nothing", () => {
  assert.deepEqual(
    [...SCHEDULED_EXPIRY_EXCLUDED_IDS].sort((a, b) => a - b),
    [43, 450, 451, 459, 473, 485, 486, 489, 490, 495, 496, 498, 500],
  );

  const excluded = SCHEDULED_EXPIRY_EXCLUDED_IDS.map((id) => post({
    id,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: PAST_SLOT,
    caption: `keep ${id}`,
    mediaUrls: `["https://example.com/${id}.jpg"]`,
  }));
  const undated = post({
    id: 43,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: null,
    caption: "wedding",
  });
  const held = post({
    id: 9999,
    dealershipId: 2,
    status: "held",
    heldAt: "2026-11-06T16:00:00.000Z",
    heldReason: "backlog hold",
    scheduledFor: PAST_SLOT,
    caption: "held copy",
  });
  const control = post({
    id: 777,
    dealershipId: 4,
    status: "scheduled",
    scheduledFor: PAST_SLOT,
    caption: "stale scheduled",
    mediaUrls: '["https://example.com/stale.jpg"]',
  });
  const insideWindow = post({
    id: 778,
    dealershipId: 4,
    status: "scheduled",
    scheduledFor: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
  });
  const rows = [...excluded, undated, held, control, insideWindow];
  const result = applyScheduledExpiry(rows, NOW);

  assert.deepEqual(result.deletedIds, []);
  assert.equal(result.posts.length, rows.length);
  assert.deepEqual(result.expiredIds, [777]);
  for (const id of SCHEDULED_EXPIRY_EXCLUDED_IDS) {
    const before = rows.find((row) => row.id === id && row.scheduledFor === PAST_SLOT);
    const after = result.posts.find((row) => row.id === id && row.caption === `keep ${id}`);
    assert.ok(before);
    assert.ok(after);
    assert.equal(after.status, "scheduled");
    assert.equal(after.mediaUrls, before.mediaUrls);
    assert.equal(after.scheduledFor, PAST_SLOT);
  }
  const undatedAfter = result.posts.find((row) => row.caption === "wedding");
  assert.equal(undatedAfter?.status, "scheduled");
  assert.equal(undatedAfter?.scheduledFor, null);
  const heldAfter = result.posts.find((row) => row.id === 9999);
  assert.equal(heldAfter?.status, "held");
  assert.equal(heldAfter?.heldReason, "backlog hold");
  assert.equal(heldAfter?.caption, "held copy");
  const expired = result.posts.find((row) => row.id === 777);
  assert.equal(expired?.status, "expired");
  assert.equal(expired?.caption, "stale scheduled");
  assert.equal(expired?.mediaUrls, control.mediaUrls);
  assert.equal(expired?.scheduledFor, PAST_SLOT);
  assert.notEqual(expired?.status, "rejected");
  assert.equal(insideWindow && result.posts.find((row) => row.id === 778)?.status, "scheduled");

  const heldOnly = applyScheduledExpiry([held], NOW, { excludeIds: [] });
  assert.equal(heldOnly.posts[0].status, "held");
  assert.deepEqual(heldOnly.expiredIds, []);
  assert.deepEqual(heldOnly.deletedIds, []);
  assert.equal(shouldExpireScheduledPost(held, NOW, WINDOW_MS, []), false);

  const restored = { ...expired!, ...buildRestoreExpiredPatch() };
  assert.equal(restored.status, "scheduled");
  assert.equal(restored.scheduleExpiryExempt, true);
  assert.equal(restored.caption, "stale scheduled");
  assert.equal(shouldExpireScheduledPost(restored, NOW), false);
  const secondPass = applyScheduledExpiry([restored], NOW);
  assert.equal(secondPass.posts[0].status, "scheduled");
  assert.deepEqual(secondPass.expiredIds, []);
  assert.equal(isActiveQueuePost({ status: "expired" }), false);
  assert.equal(isActiveQueuePost({ status: "held" }), false);
  assert.equal(isActiveQueuePost({ status: "scheduled" }), true);
});

test("the working list hides expired posts unless that status is requested", () => {
  const visible = filterPostsForApi(
    [
      { id: 1, status: "scheduled" },
      { id: 2, status: "expired" },
      { id: 3, status: "rejected" },
    ],
    {},
  );
  assert.deepEqual(visible.map((row) => row.id), [1]);
  const expiredView = filterPostsForApi(
    [{ id: 2, status: "expired" }],
    { status: "expired" },
  );
  assert.deepEqual(expiredView.map((row) => row.id), [2]);
});
