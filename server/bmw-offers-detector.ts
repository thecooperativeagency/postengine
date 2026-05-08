import type { EngineSource, InsertOfferReview } from "@shared/schema";
import type { IStorage } from "./storage";

type BmwApiResponse = {
  vehicles?: Record<string, Record<string, BmwVehicleVariant>>;
};

type BmwOffer = {
  id?: number;
  code?: string;
  model?: string;
  type?: string;
  monthly_payment?: string | number | null;
  lease_term?: string | number | null;
  due_at_signing_except_ny?: string | null;
  apr_1?: string | number | null;
  apr_2?: string | number | null;
  months_1?: string | number | null;
  months_2?: string | number | null;
  additional_disclaimer?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  loyalty_credit?: string | number | null;
  lease_credit?: string | number | null;
  purchase_credit?: string | number | null;
  total_credits?: string | number | null;
  status?: string | null;
};

type BmwVehicleVariant = {
  code?: string;
  name?: string;
  model_year?: string | number | null;
  series?: string | null;
  body_style?: string | null;
  drive_train?: string | null;
  fuel_type?: string | null;
  finance_offer?: BmwOffer | null;
  lease_offer?: BmwOffer | null;
};

type DetectionRunResult = {
  detectedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  reviews: Array<{ id: number; sourceItemKey: string | null; offerTitle: string }>;
};

const BMW_OFFERS_API_URL = "https://www.bmwusa.com/offers-api/current-offers/v2?bySeries=true";

function cleanText(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\r\n/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function parseCurrencyLike(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[$,]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberLike(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function hasFinanceOffer(offer?: BmwOffer | null) {
  return Boolean(offer && (offer.apr_1 || offer.apr_2 || offer.months_1 || offer.months_2 || offer.additional_disclaimer));
}

function hasLeaseOffer(offer?: BmwOffer | null) {
  return Boolean(offer && (offer.monthly_payment || offer.lease_term || offer.due_at_signing_except_ny || offer.additional_disclaimer));
}

function getModelYear(vehicle: BmwVehicleVariant) {
  return vehicle.model_year ? String(vehicle.model_year) : null;
}

function getOfferModel(vehicle: BmwVehicleVariant) {
  const year = getModelYear(vehicle);
  const name = cleanText(vehicle.name);
  return [year, name].filter(Boolean).join(" ") || name || vehicle.code || "BMW Offer";
}

function getFinanceHeadline(vehicle: BmwVehicleVariant, offer: BmwOffer) {
  const model = getOfferModel(vehicle);
  const apr = parseNumberLike(offer.apr_1) ?? parseNumberLike(offer.apr_2);
  const months = parseNumberLike(offer.months_2) ?? parseNumberLike(offer.months_1);
  if (apr !== null && months !== null) return `${model} Finance ${apr.toFixed(2)}% APR for ${months} months`;
  if (apr !== null) return `${model} Finance ${apr.toFixed(2)}% APR`;
  return `${model} Finance Offer`;
}

function getLeaseHeadline(vehicle: BmwVehicleVariant, offer: BmwOffer) {
  const model = getOfferModel(vehicle);
  const monthly = parseCurrencyLike(offer.monthly_payment);
  const term = parseNumberLike(offer.lease_term);
  if (monthly !== null && term !== null) return `${model} Lease $${monthly.toLocaleString()} / ${term} months`;
  if (monthly !== null) return `${model} Lease $${monthly.toLocaleString()}/month`;
  return `${model} Lease Offer`;
}

function getSourceItemKey(vehicle: BmwVehicleVariant, offer: BmwOffer, offerType: "finance" | "lease") {
  return [
    "bmw-offers-api",
    vehicle.code || vehicle.name || vehicle.series || "unknown-model",
    offerType,
    offer.id || offer.code || "no-offer-id",
    normalizeDate(offer.end_date) || "no-expiration",
  ].join(":");
}

function buildOfferReviewInput(source: EngineSource, jobId: number, vehicle: BmwVehicleVariant, offer: BmwOffer, offerType: "finance" | "lease"): InsertOfferReview {
  const offerModel = getOfferModel(vehicle);
  const normalizedPayload = offerType === "finance"
    ? {
        offerType,
        modelCode: vehicle.code || null,
        series: vehicle.series || null,
        modelYear: getModelYear(vehicle),
        modelName: cleanText(vehicle.name),
        apr: parseNumberLike(offer.apr_1) ?? parseNumberLike(offer.apr_2),
        months: parseNumberLike(offer.months_2) ?? parseNumberLike(offer.months_1),
        expirationDate: normalizeDate(offer.end_date),
        startDate: normalizeDate(offer.start_date),
        disclaimer: cleanText(offer.additional_disclaimer),
        loyaltyCredit: parseCurrencyLike(offer.loyalty_credit),
        purchaseCredit: parseCurrencyLike(offer.purchase_credit),
        totalCredits: parseCurrencyLike(offer.total_credits),
      }
    : {
        offerType,
        modelCode: vehicle.code || null,
        series: vehicle.series || null,
        modelYear: getModelYear(vehicle),
        modelName: cleanText(vehicle.name),
        monthlyPayment: parseCurrencyLike(offer.monthly_payment),
        leaseTermMonths: parseNumberLike(offer.lease_term),
        dueAtSigning: parseCurrencyLike(offer.due_at_signing_except_ny),
        expirationDate: normalizeDate(offer.end_date),
        startDate: normalizeDate(offer.start_date),
        disclaimer: cleanText(offer.additional_disclaimer),
        loyaltyCredit: parseCurrencyLike(offer.loyalty_credit),
        leaseCredit: parseCurrencyLike(offer.lease_credit),
        totalCredits: parseCurrencyLike(offer.total_credits),
      };

  return {
    sourceId: source.id,
    sourceKey: source.key,
    moduleKey: source.moduleKey,
    jobId,
    dealershipId: null,
    brand: "BMW",
    accountName: "BMW USA National Offers",
    offerTitle: offerType === "finance" ? getFinanceHeadline(vehicle, offer) : getLeaseHeadline(vehicle, offer),
    offerModel,
    offerType,
    status: "detected",
    sourceUrl: source.sourceUrl || BMW_OFFERS_API_URL,
    sourcePayload: JSON.stringify({
      vehicle: {
        code: vehicle.code || null,
        name: cleanText(vehicle.name),
        modelYear: getModelYear(vehicle),
        series: vehicle.series || null,
        bodyStyle: vehicle.body_style || null,
        driveTrain: vehicle.drive_train || null,
      },
      offer,
    }),
    normalizedPayload: JSON.stringify(normalizedPayload),
    effectiveDate: normalizeDate(offer.start_date),
    expirationDate: normalizeDate(offer.end_date),
    notes: cleanText(`Imported from BMW Offers API (${offerType})`),
  };
}

export async function runBmwOfferDetection(storage: IStorage, source: EngineSource, jobId: number): Promise<DetectionRunResult> {
  const response = await fetch(BMW_OFFERS_API_URL, {
    headers: {
      "accept": "application/json",
      "user-agent": "Mozilla/5.0 PostEngine BMW Detector",
    },
  });

  if (!response.ok) {
    throw new Error(`BMW offers API returned ${response.status}`);
  }

  const payload = (await response.json()) as BmwApiResponse;
  const vehicles = payload.vehicles || {};

  let detectedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const reviews: Array<{ id: number; sourceItemKey: string | null; offerTitle: string }> = [];

  for (const variants of Object.values(vehicles)) {
    if (!variants || typeof variants !== "object") continue;

    for (const vehicle of Object.values(variants)) {
      if (!vehicle || typeof vehicle !== "object") continue;

      const offerPairs: Array<{ offerType: "finance" | "lease"; offer: BmwOffer | null | undefined }> = [
        { offerType: "finance", offer: vehicle.finance_offer },
        { offerType: "lease", offer: vehicle.lease_offer },
      ];

      for (const pair of offerPairs) {
        const offer = pair.offer;
        if (pair.offerType === "finance" && !hasFinanceOffer(offer)) {
          skippedCount += 1;
          continue;
        }
        if (pair.offerType === "lease" && !hasLeaseOffer(offer)) {
          skippedCount += 1;
          continue;
        }
        if (!offer) {
          skippedCount += 1;
          continue;
        }

        detectedCount += 1;
        const sourceItemKey = getSourceItemKey(vehicle, offer, pair.offerType);
        const existing = storage.getOfferReviewBySourceItemKey(sourceItemKey);
        const reviewInput = buildOfferReviewInput(source, jobId, vehicle, offer, pair.offerType);
        const review = storage.upsertOfferReviewBySourceItemKey(sourceItemKey, reviewInput);
        if (existing) {
          updatedCount += 1;
        } else {
          insertedCount += 1;
        }
        reviews.push({ id: review.id, sourceItemKey, offerTitle: review.offerTitle });
      }
    }
  }

  return {
    detectedCount,
    insertedCount,
    updatedCount,
    skippedCount,
    reviews,
  };
}
