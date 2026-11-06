import { afterEach, test } from "node:test";
import * as assert from "node:assert/strict";

import { composePostContentFrom, isCaptionExact } from "../server/compose-captions";
import {
  evaluatePublishGate,
  evaluatePublishIdempotency,
  type PublishGatePost,
} from "../server/publish-gate";
import { canStartPublish, publishEnabled, shouldStartPublishPoller } from "../server/publish-switch";
import { resetPublishLocks, withPublishLock } from "../server/publish-lock";

const ORIGINAL_ENV = {
  PUBLISH_ENABLED: process.env.PUBLISH_ENABLED,
};

afterEach(() => {
  if (ORIGINAL_ENV.PUBLISH_ENABLED === undefined) delete process.env.PUBLISH_ENABLED;
  else process.env.PUBLISH_ENABLED = ORIGINAL_ENV.PUBLISH_ENABLED;
  resetPublishLocks();
});

const ROAD_HOME = "The BMW Road Home Sales Event is on through November 30th. Explore exceptional offers on select models at BMW of Jackson.";

const dealer = {
  instagramCta: "Click our link in bio to shop our special offers.",
  facebookCta: "Click to shop our special offers. https://example.com/specials",
  gmbCta: "Click to shop our special offers. https://example.com/specials",
  facebookLink: "https://example.com/specials",
  gmbLink: "https://example.com/specials",
};

function post(overrides: Partial<PublishGatePost> & Pick<PublishGatePost, "id" | "status" | "dealershipId">): PublishGatePost {
  return {
    vehicleInfo: "BMW Road Home Sales Event",
    caption: ROAD_HOME,
    mediaUrls: '["https://example.com/gmb-1200x900.jpg"]',
    platforms: '["instagram","facebook","googlebusiness"]',
    scheduledFor: "2026-11-06T18:00:00.000Z",
    approvedAt: "2026-11-06T18:00:00.000Z",
    approvedBy: "Lance Faucheux",
    ...overrides,
  };
}

test("manual publish works when PUBLISH_ENABLED is off for an approved post", () => {
  delete process.env.PUBLISH_ENABLED;
  assert.equal(publishEnabled(), false);
  assert.equal(canStartPublish({ manual: true }), true);
  const now = new Date("2026-11-06T18:05:00.000Z");
  const approved = post({ id: 9001, dealershipId: 1, status: "approved" });
  assert.equal(evaluatePublishGate(approved, now).ok, true);
  assert.equal(evaluatePublishIdempotency(approved).ok, true);
});

test("held, scheduled, and queued posts are rejected on the manual path", () => {
  delete process.env.PUBLISH_ENABLED;
  const now = new Date("2026-11-06T18:05:00.000Z");
  assert.equal(canStartPublish({ manual: true }), true);
  assert.equal(evaluatePublishGate(post({ id: 1, dealershipId: 1, status: "held", heldAt: now.toISOString() }), now).ok, false);
  assert.equal(evaluatePublishGate(post({ id: 2, dealershipId: 1, status: "scheduled", approvedAt: null, approvedBy: null }), now).ok, false);
  assert.equal(evaluatePublishGate(post({ id: 3, dealershipId: 1, status: "queued", approvedAt: null, approvedBy: null }), now).ok, false);
});

test("the poller does not start when PUBLISH_ENABLED is off", () => {
  delete process.env.PUBLISH_ENABLED;
  assert.equal(publishEnabled(), false);
  assert.equal(shouldStartPublishPoller(), false);
  assert.equal(canStartPublish(), false);
  process.env.PUBLISH_ENABLED = "true";
  assert.equal(shouldStartPublishPoller(), true);
});

test("exact-caption output is byte-identical on Instagram, Facebook, and Google Business", () => {
  const composed = composePostContentFrom(
    {
      caption: ROAD_HOME,
      captionFacebook: ROAD_HOME,
      captionGmb: ROAD_HOME,
      captionExact: true,
      ctaBlock: "should not appear",
    },
    dealer,
  );
  assert.equal(composed.instagram, ROAD_HOME);
  assert.equal(composed.facebook, ROAD_HOME);
  assert.equal(composed.googlebusiness, ROAD_HOME);
  assert.equal(composed.instagram === composed.facebook && composed.facebook === composed.googlebusiness, true);
  assert.equal(composed.instagram.includes("Click"), false);
  assert.equal(composed.facebook.includes("https://"), false);
  assert.equal(composed.googlebusiness.includes("Click"), false);
});

test("exact caption falls back to the main caption so Google Business is not empty", () => {
  const composed = composePostContentFrom(
    {
      caption: ROAD_HOME,
      captionFacebook: "",
      captionGmb: "",
      captionExact: true,
    },
    dealer,
  );
  assert.equal(composed.googlebusiness, ROAD_HOME);
  assert.equal(composed.facebook, ROAD_HOME);
  assert.equal(isCaptionExact({ caption_exact: 1 }), true);
});

test("default composition still appends dealership CTAs and links", () => {
  const composed = composePostContentFrom(
    { caption: ROAD_HOME, captionFacebook: ROAD_HOME, captionGmb: ROAD_HOME, captionExact: false },
    dealer,
  );
  assert.match(composed.instagram, /Click our link in bio/);
  assert.match(composed.facebook, /example.com\/specials/);
  assert.match(composed.googlebusiness, /Click to shop our special offers/);
});

test("already published rows and rows with a Zernio id refuse a second publish", () => {
  const published = evaluatePublishIdempotency({
    status: "published",
    publishResults: JSON.stringify({ facebook: { success: true, postId: "z1" } }),
  });
  assert.equal(published.ok, false);
  assert.match(published.reason, /already published/);
  assert.deepEqual(published.zernioIds, ["z1"]);

  const hasId = evaluatePublishIdempotency({
    status: "approved",
    publishResults: JSON.stringify({ instagram: { success: true, postId: "z2" } }),
  });
  assert.equal(hasId.ok, false);
  assert.match(hasId.reason, /Zernio post id/);
  assert.deepEqual(hasId.zernioIds, ["z2"]);
});

test("a publish already in flight is refused", async () => {
  let released!: () => void;
  const started = new Promise<void>((resolve) => {
    released = resolve;
  });
  const first = withPublishLock(77, async () => {
    await started;
    return "first";
  });
  await Promise.resolve();
  const second = await withPublishLock(77, async () => "second");
  assert.equal(second.acquired, false);
  released();
  const done = await first;
  assert.equal(done.acquired, true);
  assert.equal(done.result, "first");
});
