import { test } from "node:test";
import * as assert from "node:assert/strict";

import { filterPostsForApi } from "../server/routes";
import { withPublishLock, resetPublishLocks } from "../server/publish-lock";
import {
  APPROVAL_WINDOW_REASON,
  buildApprovePublishPatch,
  chicagoTimeOfDay,
  earliestRescheduleYmd,
  evaluateApproveForPublish,
  evaluatePublishGate,
  formatChicagoYmd,
  isActiveQueuePost,
  listPublishBlockReasons,
  type PublishGatePost,
} from "../server/publish-gate";
import {
  applyMissedSlotReschedule,
  missedSlotMoveLogDetails,
  shouldRescheduleMissedPost,
} from "../server/missed-slot";

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

test("missed posts are rescheduled, never expired, and held rows stay put", () => {
  const held = post({
    id: 450,
    dealershipId: 2,
    status: "held",
    heldAt: "2026-11-06T16:00:00.000Z",
    heldReason: "backlog hold",
    scheduledFor: PAST_SLOT,
    caption: "held copy",
  });
  const previouslyExcluded = [43, 451, 496].map((id, index) => post({
    id,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: id === 43 ? null : PAST_SLOT,
    caption: `keep ${id}`,
  }));
  const approvedLate = post({
    id: 502,
    dealershipId: 4,
    status: "approved",
    approvedAt: "2026-11-01T16:00:00.000Z",
    approvedBy: "Lance",
    scheduledFor: PAST_SLOT,
    caption: "approved late",
  });
  const scheduledLate = post({
    id: 452,
    dealershipId: 4,
    status: "scheduled",
    scheduledFor: PAST_SLOT,
    caption: "scheduled late",
  });
  const insideWindow = post({
    id: 778,
    dealershipId: 4,
    status: "scheduled",
    scheduledFor: new Date(NOW.getTime() - 30 * 60 * 1000).toISOString(),
  });
  const published = post({
    id: 200,
    dealershipId: 4,
    status: "published",
    scheduledFor: "2026-11-14T16:00:00.000Z",
    publishedAt: "2026-11-14T16:00:00.000Z",
  });
  const alreadyBooked = post({
    id: 201,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: "2026-11-14T16:00:00.000Z",
  });
  const rejected = post({
    id: 202,
    dealershipId: 4,
    status: "rejected",
    scheduledFor: PAST_SLOT,
  });

  const rows = [
    held,
    ...previouslyExcluded,
    approvedLate,
    scheduledLate,
    insideWindow,
    published,
    alreadyBooked,
    rejected,
  ];
  const result = applyMissedSlotReschedule(rows, NOW);

  assert.equal(result.posts.every((row) => row.status !== "expired"), true);
  assert.equal(result.posts.find((row) => row.id === 450)?.status, "held");
  assert.equal(result.posts.find((row) => row.id === 450)?.scheduledFor, PAST_SLOT);
  assert.equal(shouldRescheduleMissedPost(held, NOW), false);
  assert.equal(shouldRescheduleMissedPost(rejected, NOW), false);
  assert.equal(shouldRescheduleMissedPost(published, NOW), false);
  assert.equal(shouldRescheduleMissedPost(insideWindow, NOW), false);

  const undated = result.posts.find((row) => row.id === 43);
  assert.equal(undated?.status, "scheduled");
  assert.equal(undated?.scheduledFor, null);

  const movedIds = result.moves.map((move) => move.id).sort((a, b) => a - b);
  assert.deepEqual(movedIds, [451, 452, 496, 502]);

  const earliest = earliestRescheduleYmd(NOW);
  assert.equal(earliest, "2026-11-14");

  const moved451 = result.moves.find((move) => move.id === 451)!;
  const moved496 = result.moves.find((move) => move.id === 496)!;
  // Store 2 already has a scheduled post on Nov 14, so 451 then 496 take Nov 15 and Nov 16 at 10:00 AM CT.
  assert.equal(formatChicagoYmd(new Date(moved451.to)), "2026-11-15");
  assert.equal(formatChicagoYmd(new Date(moved496.to)), "2026-11-16");
  assert.equal(moved451.status, "scheduled");
  assert.equal(moved496.status, "scheduled");
  assert.deepEqual(chicagoTimeOfDay(new Date(moved451.to)), chicagoTimeOfDay(new Date(PAST_SLOT)));
  assert.match(missedSlotMoveLogDetails(moved451.from, moved451.to), /Moved missed slot from/);
  assert.match(missedSlotMoveLogDetails(moved451.from, moved451.to), /Nov 1/);
  assert.match(missedSlotMoveLogDetails(moved451.from, moved451.to), /Nov 15/);

  const moved502 = result.moves.find((move) => move.id === 502)!;
  const moved452 = result.moves.find((move) => move.id === 452)!;
  // Store 4 already has a published post on Nov 14. Same-slot ties sort by id, so 452 then 502.
  assert.equal(formatChicagoYmd(new Date(moved452.to)), "2026-11-15");
  assert.equal(formatChicagoYmd(new Date(moved502.to)), "2026-11-16");
  assert.equal(result.posts.find((row) => row.id === 502)?.status, "approved");
  assert.equal(result.posts.find((row) => row.id === 502)?.approvedBy, "Lance");
  assert.equal(result.posts.find((row) => row.id === 452)?.status, "scheduled");
  assert.equal(result.posts.find((row) => row.id === 778)?.scheduledFor, insideWindow.scheduledFor);

  const secondPass = applyMissedSlotReschedule(result.posts, NOW);
  assert.deepEqual(secondPass.moves, []);
});

test("reschedule keeps the original Chicago time of day across DST", () => {
  const summer = post({
    id: 900,
    dealershipId: 1,
    status: "scheduled",
    scheduledFor: "2026-07-01T15:00:00.000Z", // 10:00 AM CDT
  });
  const result = applyMissedSlotReschedule([summer], NOW);
  assert.equal(result.moves.length, 1);
  const next = new Date(result.moves[0].to);
  assert.equal(formatChicagoYmd(next), "2026-11-14");
  assert.deepEqual(chicagoTimeOfDay(next), { hour: 10, minute: 0, second: 0 });
  assert.equal(result.posts[0].status, "scheduled");
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
