import { test } from "node:test";
import * as assert from "node:assert/strict";

import type {
  ContentEngineBuildManifestEntry,
  Dealership,
  OfferReview,
  OfferReviewDownstreamUse,
  OfferReviewTarget,
} from "../shared/schema";
import {
  buildContentEngineBuildPlan,
  getOfferReviewTransitionError,
  syncContentEngineBuildManifest,
} from "../server/content-engine-build-manifest";

type ManifestStorageDouble = {
  getOfferReview(id: number): OfferReview | undefined;
  getOfferReviewTargets(offerReviewId?: number): OfferReviewTarget[];
  getOfferReviewDownstreamUses(offerReviewId?: number, dealershipId?: number): OfferReviewDownstreamUse[];
  replaceContentEngineBuildManifestEntriesForOfferReview(
    offerReviewId: number,
    entries: Array<{
      offerReviewId: number;
      dealershipId: number;
      channel: string;
      placement: string;
      moduleKey: string;
      reviewStatus: string;
    }>,
  ): ContentEngineBuildManifestEntry[];
  getContentEngineBuildManifestEntries(offerReviewId?: number): ContentEngineBuildManifestEntry[];
};

function makeReview(overrides: Partial<OfferReview> = {}): OfferReview {
  return {
    id: 100,
    sourceId: null,
    sourceKey: "unit-test-source",
    sourceItemKey: "unit-test-item",
    moduleKey: "content-engine",
    jobId: null,
    dealershipId: null,
    brand: "Audi",
    accountName: "Audi Baton Rouge",
    offerTitle: "2026 Audi Q5 Lease",
    offerModel: "2026 Audi Q5",
    offerType: "lease",
    status: "approved",
    sourceUrl: "https://example.com/offer",
    sourcePayload: "{}",
    normalizedPayload: "{}",
    effectiveDate: null,
    expirationDate: "2026-06-01",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTarget(overrides: Partial<OfferReviewTarget> = {}): OfferReviewTarget {
  return {
    id: 1,
    offerReviewId: 100,
    dealershipId: 3,
    selectionStatus: "selected",
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeUse(overrides: Partial<OfferReviewDownstreamUse> = {}): OfferReviewDownstreamUse {
  return {
    id: 1,
    offerReviewId: 100,
    dealershipId: 3,
    channel: "specials-page",
    placement: "hero",
    isActive: true,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeManifestStorage(review: OfferReview, targets: OfferReviewTarget[], uses: OfferReviewDownstreamUse[]): ManifestStorageDouble {
  const manifestRows: ContentEngineBuildManifestEntry[] = [];
  let nextId = 1;

  return {
    getOfferReview(id: number) {
      return review.id === id ? review : undefined;
    },
    getOfferReviewTargets(offerReviewId?: number) {
      return typeof offerReviewId === "number" ? targets.filter((target) => target.offerReviewId === offerReviewId) : targets;
    },
    getOfferReviewDownstreamUses(offerReviewId?: number, dealershipId?: number) {
      return uses.filter((use) => {
        if (typeof offerReviewId === "number" && use.offerReviewId !== offerReviewId) return false;
        if (typeof dealershipId === "number" && use.dealershipId !== dealershipId) return false;
        return true;
      });
    },
    replaceContentEngineBuildManifestEntriesForOfferReview(offerReviewId, entries) {
      for (let index = manifestRows.length - 1; index >= 0; index -= 1) {
        if (manifestRows[index]?.offerReviewId === offerReviewId) {
          manifestRows.splice(index, 1);
        }
      }

      const created = entries.map((entry) => ({
        id: nextId++,
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        ...entry,
      }));
      manifestRows.push(...created);
      return created;
    },
    getContentEngineBuildManifestEntries(offerReviewId?: number) {
      return typeof offerReviewId === "number"
        ? manifestRows.filter((row) => row.offerReviewId === offerReviewId)
        : [...manifestRows];
    },
  };
}

test("syncContentEngineBuildManifest persists only approved/published targeted downstream rows", () => {
  const storage = makeManifestStorage(
    makeReview(),
    [
      makeTarget({ dealershipId: 3 }),
      makeTarget({ id: 2, dealershipId: 1 }),
    ],
    [
      makeUse({ dealershipId: 3, channel: "specials-page", placement: "hero" }),
      makeUse({ id: 2, dealershipId: 3, channel: "sales-email", placement: "primary" }),
      makeUse({ id: 3, dealershipId: 99, channel: "sales-email", placement: "supporting" }),
    ],
  );

  const synced = syncContentEngineBuildManifest(storage, 100);

  assert.equal(synced.length, 2);
  assert.deepEqual(
    synced.map((row) => ({ dealershipId: row.dealershipId, channel: row.channel, placement: row.placement })),
    [
      { dealershipId: 3, channel: "sales-email", placement: "primary" },
      { dealershipId: 3, channel: "specials-page", placement: "hero" },
    ],
  );
  assert.equal(storage.getContentEngineBuildManifestEntries(100).length, 2);
});

test("syncContentEngineBuildManifest clears stale manifest rows when review is no longer approved", () => {
  const storage = makeManifestStorage(
    makeReview({ status: "approved" }),
    [makeTarget()],
    [makeUse()],
  );

  syncContentEngineBuildManifest(storage, 100);
  assert.equal(storage.getContentEngineBuildManifestEntries(100).length, 1);

  const reviewingStorage = makeManifestStorage(
    makeReview({ status: "reviewing" }),
    [makeTarget()],
    [makeUse()],
  );
  reviewingStorage.replaceContentEngineBuildManifestEntriesForOfferReview(100, [
    {
      offerReviewId: 100,
      dealershipId: 3,
      channel: "specials-page",
      placement: "hero",
      moduleKey: "content-engine",
      reviewStatus: "approved",
    },
  ]);

  const cleared = syncContentEngineBuildManifest(reviewingStorage, 100);
  assert.equal(cleared.length, 0);
  assert.deepEqual(reviewingStorage.getContentEngineBuildManifestEntries(100), []);
});

test("getOfferReviewTransitionError blocks publish without durable handoff rows", () => {
  const review = makeReview({ status: "approved" });

  assert.equal(
    getOfferReviewTransitionError(review, "published", []),
    "Offer review cannot be published before at least one downstream handoff row exists",
  );
  assert.equal(getOfferReviewTransitionError(review, "published", [{
    id: 1,
    offerReviewId: review.id,
    dealershipId: 3,
    channel: "specials-page",
    placement: "hero",
    moduleKey: "content-engine",
    reviewStatus: "approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }]), null);
  assert.equal(getOfferReviewTransitionError(review, "rejected", []), null);
});

test("buildContentEngineBuildPlan groups durable manifest rows by dealership and channel", () => {
  const dealerships: Dealership[] = [
    {
      id: 3,
      name: "Audi Baton Rouge",
      brand: "Audi",
      domain: "audibatonrouge.com",
      location: "Baton Rouge, LA",
      instagramHandle: null,
      facebookPage: null,
      tiktokHandle: null,
      instagramCta: null,
      facebookCta: null,
      gmbCta: null,
      captionSpec: null,
      hashtagTemplate: null,
      gmbSpec: null,
      facebookLink: null,
      gmbLink: null,
      color: "#BB0A30",
    },
  ];
  const reviews = [makeReview()];
  const manifests: ContentEngineBuildManifestEntry[] = [
    {
      id: 1,
      offerReviewId: 100,
      dealershipId: 3,
      channel: "sales-email",
      placement: "primary",
      moduleKey: "content-engine",
      reviewStatus: "approved",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: 2,
      offerReviewId: 100,
      dealershipId: 3,
      channel: "specials-page",
      placement: "hero",
      moduleKey: "content-engine",
      reviewStatus: "published",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  const plan = buildContentEngineBuildPlan({ dealerships, manifests, reviews });

  assert.equal(plan.dealerships.length, 1);
  assert.equal(plan.dealerships[0]?.readyOfferCount, 2);
  assert.deepEqual(
    plan.dealerships[0]?.channels.map((channel) => ({ channel: channel.channel, offerCount: channel.offerCount })),
    [
      { channel: "specials-page", offerCount: 1 },
      { channel: "sales-email", offerCount: 1 },
    ],
  );
  assert.equal(plan.dealerships[0]?.channels[0]?.offers[0]?.offerTitle, "2026 Audi Q5 Lease");
});
