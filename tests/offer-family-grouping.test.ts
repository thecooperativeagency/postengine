import { test } from "node:test";
import * as assert from "node:assert/strict";

import {
  buildOfferFamilyGroups,
  normalizeOfferFamily,
} from "../client/src/lib/offer-grouping.ts";

type TestOffer = {
  id: number;
  brand: string | null;
  offerType: string | null;
  offerModel: string | null;
  offerTitle: string;
  updatedAt: string;
};

function makeOffer(overrides: Partial<TestOffer> = {}): TestOffer {
  return {
    id: 1,
    brand: "BMW",
    offerType: "APR financing",
    offerModel: "2026 BMW 330i xDrive Sedan",
    offerTitle: "2026 BMW 330i xDrive Sedan 2.99% APR for 60 months",
    updatedAt: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

test("normalizeOfferFamily collapses BMW and Audi variants to family labels", () => {
  assert.equal(normalizeOfferFamily("BMW", "2026 BMW 330i xDrive Sedan"), "3 Series");
  assert.equal(normalizeOfferFamily("BMW", "2026 BMW M440i Coupe"), "4 Series");
  assert.equal(normalizeOfferFamily("BMW", "2026 BMW X5 xDrive50e"), "X5");
  assert.equal(normalizeOfferFamily("BMW", "2026 BMW i4 eDrive40 Gran Coupe"), "i4");

  assert.equal(normalizeOfferFamily("Audi", "2026 Audi Q7 55 TFSI quattro Premium Plus"), "Q7");
  assert.equal(normalizeOfferFamily("Audi", "2025 Audi Q5 Sportback 45 TFSI quattro"), "Q5");
  assert.equal(normalizeOfferFamily("Audi", "2025 Audi SQ5 Sportback Prestige"), "SQ5");
});

test("buildOfferFamilyGroups keeps APR offers grouped at family level with variant summaries", () => {
  const groups = buildOfferFamilyGroups([
    makeOffer({ id: 1, offerModel: "2026 BMW 330i xDrive Sedan", offerTitle: "2026 BMW 330i xDrive Sedan 2.99% APR for 60 months" }),
    makeOffer({ id: 2, offerModel: "2026 BMW M340i Sedan", offerTitle: "2026 BMW M340i Sedan 2.99% APR for 60 months", updatedAt: "2026-05-02T00:00:00.000Z" }),
    makeOffer({ id: 3, offerModel: "2026 BMW 430i Coupe", offerTitle: "2026 BMW 430i Coupe 1.99% APR for 48 months", updatedAt: "2026-05-03T00:00:00.000Z" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.brandLabel, "BMW");
  assert.equal(groups[0]?.offerTypes.length, 1);
  assert.equal(groups[0]?.offerTypes[0]?.offerTypeLabel, "APR");
  assert.deepEqual(
    groups[0]?.offerTypes[0]?.families.map((family) => family.familyLabel),
    ["3 Series", "4 Series"],
  );

  const family = groups[0]?.offerTypes[0]?.families[0];
  assert.equal(family?.variantCount, 2);
  assert.equal(family?.offers.length, 2);
  assert.equal(family?.representativeVariantPreview, "330i xDrive Sedan, M340i Sedan");
  assert.match(family?.summary ?? "", /2 variants/i);
});

test("buildOfferFamilyGroups surfaces the cheapest lease offer in the family summary while preserving all offers", () => {
  const groups = buildOfferFamilyGroups([
    makeOffer({
      id: 10,
      brand: "Audi",
      offerType: "lease special",
      offerModel: "2026 Audi Q7 55 TFSI quattro Premium Plus",
      offerTitle: "2026 Audi Q7 55 TFSI quattro Lease $899 / 36 months",
    }),
    makeOffer({
      id: 11,
      brand: "Audi",
      offerType: "lease",
      offerModel: "2026 Audi Q7 45 TFSI quattro",
      offerTitle: "2026 Audi Q7 45 TFSI quattro Lease $749 / 36 months",
      updatedAt: "2026-05-02T00:00:00.000Z",
    }),
    makeOffer({
      id: 12,
      brand: "Audi",
      offerType: "lease",
      offerModel: "2026 Audi SQ5 Sportback Prestige",
      offerTitle: "2026 Audi SQ5 Sportback Lease $689/mo for 36 months",
      updatedAt: "2026-05-03T00:00:00.000Z",
    }),
  ]);

  const audiLeaseFamilies = groups[0]?.offerTypes[0]?.families;
  assert.deepEqual(
    audiLeaseFamilies?.map((family) => family.familyLabel),
    ["SQ5", "Q7"],
  );

  const q7Family = audiLeaseFamilies?.find((family) => family.familyLabel === "Q7");
  assert.equal(q7Family?.offers.length, 2);
  assert.equal(q7Family?.cheapestLeaseOffer?.id, 11);
  assert.match(q7Family?.summary ?? "", /From \$749\/mo/i);
  assert.match(q7Family?.summary ?? "", /2 variants/i);
});
