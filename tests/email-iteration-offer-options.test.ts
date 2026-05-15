import { test } from "node:test";
import * as assert from "node:assert/strict";

import { buildEmailIterationOfferOptionsByDealership } from "../server/email-iteration-offers";

test("buildEmailIterationOfferOptionsByDealership groups approved targeted offers into a per-store menu", () => {
  const options = buildEmailIterationOfferOptionsByDealership(
    [
      {
        id: 11,
        sourceId: null,
        sourceKey: "bmw",
        sourceItemKey: "x5-apr",
        moduleKey: "content-engine",
        jobId: null,
        dealershipId: null,
        brand: "BMW",
        accountName: "BMW USA",
        offerTitle: "2.99% APR for 60 months",
        offerModel: "X5",
        offerType: "apr",
        status: "approved",
        sourceUrl: "https://example.com/x5",
        sourcePayload: "{}",
        normalizedPayload: "{}",
        effectiveDate: null,
        expirationDate: "2026-06-30",
        notes: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: 12,
        sourceId: null,
        sourceKey: "bmw",
        sourceItemKey: "x3-lease",
        moduleKey: "content-engine",
        jobId: null,
        dealershipId: null,
        brand: "BMW",
        accountName: "BMW USA",
        offerTitle: "$499/mo lease",
        offerModel: "X3",
        offerType: "lease",
        status: "published",
        sourceUrl: "https://example.com/x3",
        sourcePayload: "{}",
        normalizedPayload: "{}",
        effectiveDate: null,
        expirationDate: "2026-06-30",
        notes: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: 13,
        sourceId: null,
        sourceKey: "bmw",
        sourceItemKey: "staging",
        moduleKey: "content-engine",
        jobId: null,
        dealershipId: null,
        brand: "BMW",
        accountName: "BMW USA",
        offerTitle: "Ignore me",
        offerModel: "X1",
        offerType: "apr",
        status: "reviewing",
        sourceUrl: null,
        sourcePayload: "{}",
        normalizedPayload: "{}",
        effectiveDate: null,
        expirationDate: null,
        notes: null,
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ],
    [
      { id: 1, offerReviewId: 11, dealershipId: 2, selectionStatus: "selected", notes: null, createdAt: "", updatedAt: "" },
      { id: 2, offerReviewId: 12, dealershipId: 2, selectionStatus: "selected", notes: null, createdAt: "", updatedAt: "" },
      { id: 3, offerReviewId: 13, dealershipId: 2, selectionStatus: "selected", notes: null, createdAt: "", updatedAt: "" },
      { id: 4, offerReviewId: 11, dealershipId: 3, selectionStatus: "skipped", notes: null, createdAt: "", updatedAt: "" },
    ],
    [
      { id: 1, offerReviewId: 11, dealershipId: 2, channel: "sales-email", placement: "hero", isActive: true, notes: null, createdAt: "", updatedAt: "" },
      { id: 2, offerReviewId: 11, dealershipId: 2, channel: "specials-page", placement: "primary", isActive: true, notes: null, createdAt: "", updatedAt: "" },
      { id: 3, offerReviewId: 12, dealershipId: 2, channel: "sales-email", placement: "supporting", isActive: false, notes: null, createdAt: "", updatedAt: "" },
    ],
  );

  const dealerTwoOptions = options.get(2) ?? [];
  assert.equal(dealerTwoOptions.length, 2);
  assert.deepEqual(dealerTwoOptions.map((option) => option.id), [11, 12]);
  assert.deepEqual(dealerTwoOptions[0]?.channels, ["sales-email", "specials-page"]);
  assert.deepEqual(dealerTwoOptions[0]?.placements, ["hero", "primary"]);
  assert.deepEqual(dealerTwoOptions[1]?.channels, []);
  assert.equal(options.has(3), false);
});
