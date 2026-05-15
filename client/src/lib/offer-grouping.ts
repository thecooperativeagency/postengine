export type OfferGroupingInput = {
  brand: string | null;
  offerType: string | null;
  offerModel: string | null;
  offerTitle: string;
  updatedAt: string;
};

export type OfferFamilyGroup<T extends OfferGroupingInput> = {
  familyLabel: string;
  totalCount: number;
  variantCount: number;
  representativeVariantPreview: string;
  summary: string;
  cheapestLeaseOffer: T | null;
  offers: T[];
};

export type OfferTypeGroup<T extends OfferGroupingInput> = {
  offerTypeLabel: string;
  totalCount: number;
  families: OfferFamilyGroup<T>[];
};

export type OfferBrandGroup<T extends OfferGroupingInput> = {
  brandLabel: string;
  totalCount: number;
  offerTypes: OfferTypeGroup<T>[];
};

const GENERAL_MODEL_LABELS = new Set([
  "all models",
  "multiple models",
  "multi-model",
  "national",
  "brand-wide",
]);

export function getBrandSortValue(brand: string | null | undefined) {
  const normalized = (brand || "Other").trim().toLowerCase();
  if (normalized === "audi") return 0;
  if (normalized === "bmw") return 1;
  return 2;
}

export function getOfferTypeSortValue(offerType: string) {
  const normalized = offerType.trim().toLowerCase();
  if (normalized === "lease") return 0;
  if (normalized === "apr") return 1;
  if (normalized === "finance") return 2;
  if (normalized === "bonus cash / customer cash") return 3;
  if (normalized === "loyalty / conquest") return 4;
  if (normalized === "service / maintenance") return 5;
  return 6;
}

export function getOfferTypeLabel(offerType: string | null | undefined) {
  const normalized = offerType?.trim().toLowerCase() || "";
  if (!normalized) return "Other Offers";
  if (normalized.includes("lease")) return "Lease";
  if (normalized.includes("apr")) return "APR";
  if (normalized.includes("finance")) return "Finance";
  if (normalized.includes("bonus") || normalized.includes("customer cash") || normalized.includes("purchase credit") || normalized.includes("cash")) return "Bonus Cash / Customer Cash";
  if (normalized.includes("loyalty") || normalized.includes("conquest")) return "Loyalty / Conquest";
  if (normalized.includes("service") || normalized.includes("maintenance")) return "Service / Maintenance";
  return offerType?.trim() || "Other Offers";
}

export function getOfferModelLabel(offerModel: string | null | undefined) {
  const normalized = offerModel?.trim();
  if (!normalized) return "General / Multi-Model";
  if (GENERAL_MODEL_LABELS.has(normalized.toLowerCase())) {
    return "General / Multi-Model";
  }
  return normalized;
}

function stripYearPrefix(value: string) {
  return value
    .replace(/^\s*\d{4}\s+/, "")
    .replace(/^\s*(BMW|Audi)\s+/i, "")
    .trim();
}

function extractSeriesFamily(value: string) {
  const normalized = value.trim();
  const compactMatch = normalized.match(/^M?([2-8])\d{2}[A-Za-z]?\b/i);
  if (compactMatch?.[1]) return `${compactMatch[1]} Series`;

  const namedMatch = normalized.match(/^([2-8])\s*Series\b/i);
  if (namedMatch?.[1]) return `${namedMatch[1]} Series`;

  return null;
}

function normalizeBmwFamily(modelLabel: string) {
  const cleaned = stripYearPrefix(modelLabel);
  if (cleaned === "General / Multi-Model") return cleaned;

  const iModelMatch = cleaned.match(/\b(i[457x]?|ix)\b/i);
  if (iModelMatch?.[1]) {
    const family = iModelMatch[1].toLowerCase() === "ix" ? "iX" : iModelMatch[1].toLowerCase();
    return family === "iX" ? family : family;
  }

  const xModelMatch = cleaned.match(/\bX[1-7]\b/i);
  if (xModelMatch) return xModelMatch[0].toUpperCase();

  const seriesFamily = extractSeriesFamily(cleaned);
  if (seriesFamily) return seriesFamily;

  return cleaned.split(/\s+/).slice(0, 2).join(" ");
}

function normalizeAudiFamily(modelLabel: string) {
  const cleaned = stripYearPrefix(modelLabel);
  if (cleaned === "General / Multi-Model") return cleaned;

  const familyMatch = cleaned.match(/\b(RS\s?[3-8]|SQ[2-8]|Q[2-8]|A[3-8]|S[3-8]|e-?tron\s?GT|Q4\s+e-?tron|Q6\s+e-?tron|Q8\s+e-?tron)\b/i);
  if (familyMatch?.[1]) {
    return familyMatch[1]
      .replace(/\s+/g, " ")
      .replace(/e-tron/gi, "e-tron")
      .trim();
  }

  return cleaned.split(/\s+/).slice(0, 2).join(" ");
}

export function normalizeOfferFamily(brand: string | null | undefined, offerModel: string | null | undefined) {
  const modelLabel = getOfferModelLabel(offerModel);
  const normalizedBrand = brand?.trim().toLowerCase();

  if (normalizedBrand === "bmw") return normalizeBmwFamily(modelLabel);
  if (normalizedBrand === "audi") return normalizeAudiFamily(modelLabel);
  return modelLabel;
}

function getVariantLabel(brand: string | null | undefined, offerModel: string | null | undefined, familyLabel: string) {
  const modelLabel = getOfferModelLabel(offerModel);
  if (modelLabel === "General / Multi-Model") return modelLabel;

  const cleaned = stripYearPrefix(modelLabel);
  if (cleaned.toLowerCase() === familyLabel.toLowerCase()) return familyLabel;

  if (brand?.trim().toLowerCase() === "bmw" && /series$/i.test(familyLabel)) {
    const variant = cleaned.replace(/^([2345678])\s+Series\s*/i, "").trim();
    return variant || familyLabel;
  }

  if (brand?.trim().toLowerCase() === "audi") {
    const variant = cleaned.replace(new RegExp(`^${familyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*`, "i"), "").trim();
    return variant || familyLabel;
  }

  const variant = cleaned.replace(new RegExp(`^${familyLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\s*`, "i"), "").trim();
  return variant || cleaned;
}

function formatVariantPreview(variants: string[]) {
  const unique = Array.from(new Set(variants.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return unique.slice(0, 2).join(", ");
}

function extractLeaseMonthlyPrice(value: string) {
  const match = value.match(/\$\s*([0-9]{2,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*(?:\/\s*(?:mo|month|36\s*months)|per\s*month|mo\b|month\b)/i);
  const first = match?.[1];
  if (!first) return null;
  return Number.parseFloat(first.replace(/,/g, ""));
}

function compareUpdatedAtDesc(a: { updatedAt: string }, b: { updatedAt: string }) {
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function compareFamilies<T extends OfferGroupingInput>(offerTypeLabel: string, a: OfferFamilyGroup<T>, b: OfferFamilyGroup<T>) {
  if (offerTypeLabel === "Lease") {
    const aPrice = a.cheapestLeaseOffer ? (extractLeaseMonthlyPrice(a.cheapestLeaseOffer.offerTitle) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    const bPrice = b.cheapestLeaseOffer ? (extractLeaseMonthlyPrice(b.cheapestLeaseOffer.offerTitle) ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
    if (aPrice !== bPrice) return aPrice - bPrice;
  }

  return a.familyLabel.localeCompare(b.familyLabel);
}

function buildFamilySummary<T extends OfferGroupingInput>(offerTypeLabel: string, familyLabel: string, offers: T[], representativeVariantPreview: string, cheapestLeaseOffer: T | null) {
  const variantCount = new Set(offers.map((offer) => getVariantLabel(offer.brand, offer.offerModel, familyLabel))).size;

  if (offerTypeLabel === "Lease") {
    const price = cheapestLeaseOffer ? extractLeaseMonthlyPrice(cheapestLeaseOffer.offerTitle) : null;
    const fromText = typeof price === "number" ? `From $${Math.round(price)}/mo` : "Lease offers";
    const variantText = `${variantCount} variant${variantCount === 1 ? "" : "s"}`;
    return representativeVariantPreview ? `${fromText} • ${variantText} • ${representativeVariantPreview}` : `${fromText} • ${variantText}`;
  }

  const variantText = `${variantCount} variant${variantCount === 1 ? "" : "s"}`;
  return representativeVariantPreview ? `${variantText} • ${representativeVariantPreview}` : variantText;
}

export function buildOfferFamilyGroups<T extends OfferGroupingInput>(offers: T[]): OfferBrandGroup<T>[] {
  const brandMap = new Map<string, Map<string, Map<string, T[]>>>();

  for (const offer of offers) {
    const brandLabel = offer.brand?.trim() || "Other";
    const offerTypeLabel = getOfferTypeLabel(offer.offerType);
    const familyLabel = normalizeOfferFamily(offer.brand, offer.offerModel);

    if (!brandMap.has(brandLabel)) brandMap.set(brandLabel, new Map());
    const offerTypeMap = brandMap.get(brandLabel)!;
    if (!offerTypeMap.has(offerTypeLabel)) offerTypeMap.set(offerTypeLabel, new Map());
    const familyMap = offerTypeMap.get(offerTypeLabel)!;
    if (!familyMap.has(familyLabel)) familyMap.set(familyLabel, []);
    familyMap.get(familyLabel)!.push(offer);
  }

  return Array.from(brandMap.entries())
    .sort(([brandA], [brandB]) => {
      const sortDiff = getBrandSortValue(brandA) - getBrandSortValue(brandB);
      return sortDiff !== 0 ? sortDiff : brandA.localeCompare(brandB);
    })
    .map(([brandLabel, offerTypeMap]) => ({
      brandLabel,
      totalCount: Array.from(offerTypeMap.values()).reduce(
        (brandTotal, familyMap) => brandTotal + Array.from(familyMap.values()).reduce((familyTotal, rows) => familyTotal + rows.length, 0),
        0,
      ),
      offerTypes: Array.from(offerTypeMap.entries())
        .sort(([typeA], [typeB]) => {
          const sortDiff = getOfferTypeSortValue(typeA) - getOfferTypeSortValue(typeB);
          return sortDiff !== 0 ? sortDiff : typeA.localeCompare(typeB);
        })
        .map(([offerTypeLabel, familyMap]) => {
          const families = Array.from(familyMap.entries()).map(([familyLabel, rows]) => {
            const sortedOffers = [...rows].sort(compareUpdatedAtDesc);
            const variantLabels = sortedOffers.map((offer) => getVariantLabel(offer.brand, offer.offerModel, familyLabel));
            const representativeVariantPreview = formatVariantPreview(variantLabels);
            const cheapestLeaseOffer = offerTypeLabel === "Lease"
              ? [...sortedOffers].sort((offerA, offerB) => {
                  const aPrice = extractLeaseMonthlyPrice(offerA.offerTitle) ?? Number.POSITIVE_INFINITY;
                  const bPrice = extractLeaseMonthlyPrice(offerB.offerTitle) ?? Number.POSITIVE_INFINITY;
                  if (aPrice !== bPrice) return aPrice - bPrice;
                  return compareUpdatedAtDesc(offerA, offerB);
                })[0] ?? null
              : null;

            return {
              familyLabel,
              totalCount: sortedOffers.length,
              variantCount: new Set(variantLabels).size,
              representativeVariantPreview,
              summary: buildFamilySummary(offerTypeLabel, familyLabel, sortedOffers, representativeVariantPreview, cheapestLeaseOffer),
              cheapestLeaseOffer,
              offers: sortedOffers,
            } satisfies OfferFamilyGroup<T>;
          });

          return {
            offerTypeLabel,
            totalCount: Array.from(familyMap.values()).reduce((sum, rows) => sum + rows.length, 0),
            families: families.sort((familyA, familyB) => compareFamilies(offerTypeLabel, familyA, familyB)),
          } satisfies OfferTypeGroup<T>;
        }),
    }));
}
