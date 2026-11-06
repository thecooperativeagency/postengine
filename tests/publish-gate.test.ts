import { afterEach, test } from "node:test";
import * as assert from "node:assert/strict";

import { driveScanEnabled, publishEnabled } from "../server/publish-switch";
import {
  buildApprovePublishPatch,
  buildDuePreview,
  buildHoldPatch,
  buildReleaseHoldPatch,
  chicagoDayRange,
  evaluatePublishGate,
  formatChicagoYmd,
  selectPublishablePosts,
  shouldHoldPost,
  type PublishGatePost,
} from "../server/publish-gate";
import {
  NOV6_2026_APPROVE_NONCE,
  NOV6_2026_APPROVAL_DATE,
  NOV6_2026_HELD_FOR_REVIEW_IDS,
  NOV6_2026_READY_POST_IDS,
  validateNov6PublishApproval,
} from "../server/nov6-2026-publish-allowlist";

const ORIGINAL_ENV = {
  PUBLISH_ENABLED: process.env.PUBLISH_ENABLED,
  DRIVE_SCAN_ENABLED: process.env.DRIVE_SCAN_ENABLED,
  PUBLISH_OVERDUE_WINDOW_MINUTES: process.env.PUBLISH_OVERDUE_WINDOW_MINUTES,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function post(overrides: Partial<PublishGatePost> & Pick<PublishGatePost, "id" | "status" | "dealershipId">): PublishGatePost {
  return {
    vehicleInfo: "Test Vehicle",
    caption: "Caption",
    mediaUrls: '["https://example.com/a.jpg"]',
    platforms: '["instagram"]',
    scheduledFor: "2026-11-06T16:00:00.000Z",
    ...overrides,
  };
}

test("publishEnabled is only true for the exact string true", () => {
  delete process.env.PUBLISH_ENABLED;
  assert.equal(publishEnabled(), false);
  process.env.PUBLISH_ENABLED = "TRUE";
  assert.equal(publishEnabled(), false);
  process.env.PUBLISH_ENABLED = "1";
  assert.equal(publishEnabled(), false);
  process.env.PUBLISH_ENABLED = "true";
  assert.equal(publishEnabled(), true);
});

test("driveScanEnabled is independent of PUBLISH_ENABLED", () => {
  process.env.PUBLISH_ENABLED = "true";
  delete process.env.DRIVE_SCAN_ENABLED;
  assert.equal(driveScanEnabled(), false);
  process.env.DRIVE_SCAN_ENABLED = "true";
  process.env.PUBLISH_ENABLED = "false";
  assert.equal(driveScanEnabled(), true);
  assert.equal(publishEnabled(), false);
});

test("queued, scheduled, and held posts cannot publish without approval", () => {
  const now = new Date("2026-11-06T16:05:00.000Z");
  assert.equal(evaluatePublishGate(post({ id: 1, dealershipId: 1, status: "queued" }), now).ok, false);
  assert.equal(evaluatePublishGate(post({ id: 1, dealershipId: 1, status: "scheduled" }), now).ok, false);
  assert.equal(evaluatePublishGate(post({ id: 1, dealershipId: 1, status: "held", heldAt: now.toISOString() }), now).ok, false);
  assert.match(evaluatePublishGate(post({ id: 1, dealershipId: 1, status: "scheduled" }), now).reason, /not explicitly approved/);
});

test("an approved post inside the window can publish", () => {
  const now = new Date("2026-11-06T16:30:00.000Z");
  const approved = post({
    id: 498,
    dealershipId: 1,
    status: "approved",
    approvedAt: "2026-11-06T16:10:00.000Z",
    approvedBy: "Lance",
  });
  assert.deepEqual(evaluatePublishGate(approved, now), { ok: true, reason: "ok" });
});

test("an approved post that went overdue without a fresh approval is blocked", () => {
  const now = new Date("2026-11-06T19:00:00.000Z");
  const stale = post({
    id: 498,
    dealershipId: 1,
    status: "approved",
    scheduledFor: "2026-11-06T16:00:00.000Z",
    approvedAt: "2026-11-06T15:00:00.000Z",
    approvedBy: "Lance",
  });
  const decision = evaluatePublishGate(stale, now);
  assert.equal(decision.ok, false);
  assert.match(decision.reason, /re-approval is required/);
});

test("re-approving an overdue post starts a new window", () => {
  const now = new Date("2026-11-06T19:05:00.000Z");
  const refreshed = post({
    id: 450,
    dealershipId: 3,
    status: "approved",
    scheduledFor: "2026-11-02T17:00:00.000Z",
    approvedAt: "2026-11-06T19:00:00.000Z",
    approvedBy: "Lance",
  });
  assert.equal(evaluatePublishGate(refreshed, now).ok, true);
});

test("selectPublishablePosts ignores due scheduled posts and honors backoff", () => {
  const now = new Date("2026-11-06T16:30:00.000Z");
  const rows = [
    post({ id: 498, dealershipId: 1, status: "scheduled" }),
    post({
      id: 486,
      dealershipId: 2,
      status: "approved",
      approvedAt: "2026-11-06T16:10:00.000Z",
      approvedBy: "Lance",
    }),
    post({
      id: 473,
      dealershipId: 4,
      status: "approved",
      scheduledFor: "2026-11-06T17:00:00.000Z",
      approvedAt: "2026-11-06T16:10:00.000Z",
      approvedBy: "Lance",
      publishBackoffUntil: "2026-11-06T20:00:00.000Z",
    }),
  ];
  assert.deepEqual(selectPublishablePosts(rows, now).map((row) => row.id), [486]);
});

test("hold is reversible, keeps 486 and 473 with the backlog, and never deletes", () => {
  const now = new Date("2026-11-06T17:30:00.000Z");
  const backlog = post({
    id: 485,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: "2026-11-04T16:00:00.000Z",
    vehicleInfo: "2026 BMW M240I",
  });
  const failedAvailability = post({
    id: 486,
    dealershipId: 2,
    status: "scheduled",
    scheduledFor: "2026-11-06T16:00:00.000Z",
    vehicleInfo: "2026 BMW M4 Competition",
  });
  const uncleared = post({
    id: 473,
    dealershipId: 4,
    status: "scheduled",
    scheduledFor: "2026-11-06T17:00:00.000Z",
    vehicleInfo: "GT3 RS",
  });
  const allowed = post({
    id: 498,
    dealershipId: 1,
    status: "scheduled",
    caption: "The BMW X3 is here.",
    mediaUrls: '["https://example.com/x3.jpg"]',
  });
  assert.equal(shouldHoldPost(backlog, now, "due", NOV6_2026_READY_POST_IDS), true);
  assert.equal(shouldHoldPost(failedAvailability, now, "due", NOV6_2026_READY_POST_IDS), true);
  assert.equal(shouldHoldPost(uncleared, now, "due", NOV6_2026_READY_POST_IDS), true);
  assert.equal(shouldHoldPost(allowed, now, "due", NOV6_2026_READY_POST_IDS), false);

  const held = { ...backlog, ...buildHoldPatch(backlog, now, "Nov 6 backlog hold") };
  assert.equal(held.status, "held");
  assert.equal(held.statusBeforeHold, "scheduled");
  assert.equal(held.caption, backlog.caption);
  assert.equal(held.mediaUrls, backlog.mediaUrls);
  const released = { ...held, ...buildReleaseHoldPatch(held) };
  assert.equal(released.status, "scheduled");
  assert.equal(released.heldAt, null);
  assert.equal(released.statusBeforeHold, null);
});

test("approve patch sets approval fields only and does not touch caption or media", () => {
  const now = new Date("2026-11-06T18:00:00.000Z");
  const patch = buildApprovePublishPatch("Lance", now);
  assert.deepEqual(patch, {
    status: "approved",
    approvedAt: now.toISOString(),
    approvedBy: "Lance",
  });
  assert.equal("caption" in patch, false);
  assert.equal("captionFacebook" in patch, false);
  assert.equal("mediaUrls" in patch, false);
});

test("Nov 6 one-time path accepts only one ready ID at a time", () => {
  assert.deepEqual(validateNov6PublishApproval([498], NOV6_2026_APPROVAL_DATE, NOV6_2026_APPROVE_NONCE), {
    ok: true,
    reason: "ok",
  });
  assert.deepEqual(validateNov6PublishApproval([450], NOV6_2026_APPROVAL_DATE, NOV6_2026_APPROVE_NONCE), {
    ok: true,
    reason: "ok",
  });
  const both = validateNov6PublishApproval([498, 450], NOV6_2026_APPROVAL_DATE, NOV6_2026_APPROVE_NONCE);
  assert.equal(both.ok, false);
  assert.match(both.reason, /exactly one post/);
  const failed = validateNov6PublishApproval([486], NOV6_2026_APPROVAL_DATE, NOV6_2026_APPROVE_NONCE);
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /new review/);
  const uncleared = validateNov6PublishApproval([473], NOV6_2026_APPROVAL_DATE, NOV6_2026_APPROVE_NONCE);
  assert.equal(uncleared.ok, false);
  assert.match(uncleared.reason, /new review/);
  assert.equal(validateNov6PublishApproval([498], "2026-11-07", NOV6_2026_APPROVE_NONCE).ok, false);
  assert.equal(validateNov6PublishApproval([498], NOV6_2026_APPROVAL_DATE, "other-nonce").ok, false);
  assert.deepEqual([...NOV6_2026_READY_POST_IDS], [498, 450]);
  assert.deepEqual([...NOV6_2026_HELD_FOR_REVIEW_IDS], [486, 473]);
});

test("preview lists caption, store, scheduled time, and same-vehicle warnings", () => {
  const now = new Date("2026-11-06T17:30:00.000Z");
  const posts = [
    post({
      id: 498,
      dealershipId: 1,
      status: "scheduled",
      vehicleInfo: "BMW X3",
      caption: "The BMW X3 is here.",
      scheduledFor: "2026-11-06T16:00:00.000Z",
    }),
    post({
      id: 438,
      dealershipId: 1,
      status: "published",
      vehicleInfo: "BMW X3",
      caption: "The BMW X3 is here.",
      scheduledFor: "2026-10-16T16:00:00.000Z",
      publishedAt: "2026-10-16T16:01:00.000Z",
    }),
    post({
      id: 450,
      dealershipId: 3,
      status: "scheduled",
      vehicleInfo: "RS Q8",
      caption: "The RS Q8. Performance you feel before you hear it.",
      scheduledFor: "2026-11-02T17:00:00.000Z",
    }),
  ];
  const preview = buildDuePreview({
    posts,
    dealerships: [
      { id: 1, name: "BMW of Jackson" },
      { id: 3, name: "Audi Baton Rouge" },
    ],
    dateYmd: "2026-11-06",
    now,
    publishEnabled: false,
  });
  assert.equal(preview.timezone, "America/Chicago");
  assert.deepEqual(preview.dueToday.map((row) => row.id), [498]);
  assert.equal(preview.dueToday[0].store, "BMW of Jackson");
  assert.equal(preview.dueToday[0].caption, "The BMW X3 is here.");
  assert.match(String(preview.dueToday[0].scheduledForChicago), /Nov 6/);
  assert.ok(preview.dueToday[0].duplicateWarnings.some((warning) => warning.includes("#438")));
  assert.deepEqual(preview.overdue.map((row) => row.id), [450]);
  assert.equal(preview.overdue[0].store, "Audi Baton Rouge");
});

test("Chicago Nov 6 2026 day range is CST", () => {
  const range = chicagoDayRange("2026-11-06");
  assert.equal(range.start.toISOString(), "2026-11-06T06:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-11-07T06:00:00.000Z");
  assert.equal(formatChicagoYmd(new Date("2026-11-06T16:00:00.000Z")), "2026-11-06");
});
