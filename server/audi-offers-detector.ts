import type { EngineSource, InsertOfferReview } from "@shared/schema";
import type { IStorage } from "./storage";

type DetectionRunResult = {
  detectedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  reviews: Array<{ id: number; sourceItemKey: string | null; offerTitle: string }>;
};

type ParsedAudiOffer = {
  sourceItemKey: string;
  offerTitle: string;
  offerModel: string;
  offerType: "bonus" | "lease" | "finance";
  effectiveDate: string | null;
  expirationDate: string | null;
  sourcePayload: Record<string, unknown>;
  normalizedPayload: Record<string, unknown>;
  notes: string;
};

const AUDI_OFFERS_PAGE_URL = "https://www.audiusa.com/en/offers/";
const AUDI_OFFERS_MIRROR_URL = `https://r.jina.ai/http://${AUDI_OFFERS_PAGE_URL}`;

function cleanText(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/\r\n/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function normalizeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseCurrencyLike(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberLike(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function extractModelFromCopy(line: string) {
  const match = line.match(/(20\d{2} Audi [A-Za-z0-9\- ]+?(?:quattro|TFSI|e-tron|Sportback|SUV|Avant|Cabriolet|Roadster))/i);
  return cleanText(match?.[1] ?? null);
}

function extractExpiration(block: string[]) {
  const line = block.find((entry) => /^Offer ends /i.test(entry));
  if (!line) return null;
  return normalizeDate(line.replace(/^Offer ends /i, ""));
}

function extractLeaseFromFeatured(lines: string[]) {
  const offers: ParsedAudiOffer[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^#### 20\d{2} Audi /i.test(line)) continue;

    const model = cleanText(line.replace(/^####\s+/, ""));
    if (!model) continue;

    const paymentLine = lines[i + 1] ?? "";
    const paymentLabel = lines[i + 2] ?? "";
    const monthsLine = lines[i + 3] ?? "";
    const monthsLabel = lines[i + 4] ?? "";
    const dueLine = lines[i + 5] ?? "";
    const dueLabel = lines[i + 6] ?? "";
    const disclaimer = cleanText(lines[i + 7] ?? null);
    const expirationLine = lines[i + 8] ?? "";
    const offerTypeLine = lines[i + 9] ?? "";

    if (!/^#### \$[\d,]+$/.test(paymentLine) || !/Monthly payment/i.test(paymentLabel) || !/^#### \d+$/.test(monthsLine) || monthsLabel !== "Months") {
      continue;
    }

    const monthlyPayment = cleanText(paymentLine.replace(/^####\s+/, ""));
    const months = cleanText(monthsLine.replace(/^####\s+/, ""));
    const dueAtSigning = /^#### \$[\d,]+$/.test(dueLine) && /Due at Signing/i.test(dueLabel)
      ? cleanText(dueLine.replace(/^####\s+/, ""))
      : null;
    const expirationDate = /^Offer ends /i.test(expirationLine)
      ? normalizeDate(expirationLine.replace(/^Offer ends /i, ""))
      : null;

    if (!monthlyPayment || !months) continue;

    offers.push({
      sourceItemKey: ["audi-offers-mirror", slugify(model), "lease", slugify(`${monthlyPayment}-${months}`), expirationDate || "no-expiration"].join(":"),
      offerTitle: `${model} Lease ${monthlyPayment} / ${months} months`,
      offerModel: model,
      offerType: "lease",
      effectiveDate: null,
      expirationDate,
      sourcePayload: {
        model,
        monthlyPayment,
        months,
        dueAtSigning,
        disclaimer,
        source: "featured-offers",
      },
      normalizedPayload: {
        offerType: "lease",
        modelName: model,
        monthlyPayment: parseCurrencyLike(monthlyPayment),
        leaseTermMonths: parseNumberLike(months),
        dueAtSigning: parseCurrencyLike(dueAtSigning),
        disclaimer,
      },
      notes: "Imported from Audi USA offers page mirror (featured lease block)",
    });
  }

  return offers;
}

function extractCopyDrivenOffers(lines: string[]) {
  const offers: ParsedAudiOffer[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/(select, new 20\d{2} Audi|Current Audi owners can receive)/i.test(line)) continue;

    const model = extractModelFromCopy(line);
    if (!model) continue;

    const previousLines = lines.slice(Math.max(0, i - 4), i);
    const headingLine = [...previousLines].reverse().find((entry) => entry.startsWith("### ") || entry.startsWith("#### $") || /^#### [\d.]+%$/.test(entry));
    if (!headingLine) continue;

    const block = [headingLine, line];
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      if (/^Offer ends /i.test(lines[j]) || /Bonus Offer|Lease Offer|\*View offer details/i.test(lines[j])) {
        block.push(lines[j]);
      }
    }

    const expirationDate = extractExpiration(block);
    const headingText = cleanText(headingLine.replace(/^###\s+/, "").replace(/^####\s+/, "")) || "Audi Offer";

    let offerType: ParsedAudiOffer["offerType"] = "bonus";
    let offerTitle = headingText;
    let normalizedPayload: Record<string, unknown> = {
      offerType,
      modelName: model,
      headline: headingText,
      description: cleanText(line),
    };

    if (/Monthly payment/i.test(block.join(" "))) {
      offerType = "lease";
      const months = block.find((entry, idx) => /^\d+$/.test(entry.replace(/^####\s+/, "")) && block[idx + 1] === "Months");
      const parsedMonths = months ? cleanText(months.replace(/^####\s+/, "")) : null;
      offerTitle = parsedMonths ? `${model} Lease ${headingText} / ${parsedMonths} months` : `${model} Lease ${headingText}`;
      normalizedPayload = {
        offerType,
        modelName: model,
        monthlyPayment: parseCurrencyLike(headingText),
        leaseTermMonths: parseNumberLike(parsedMonths),
        description: cleanText(line),
      };
    } else if (/APR/i.test(block.join(" ")) || /%$/.test(headingText)) {
      offerType = "finance";
      const monthsLine = block.find((entry, idx) => /^#### \d+$/.test(entry) && block[idx + 1] === "Months");
      const months = monthsLine ? cleanText(monthsLine.replace(/^####\s+/, "")) : null;
      offerTitle = months ? `${model} Finance ${headingText} APR for ${months} months` : `${model} Finance ${headingText} APR`;
      normalizedPayload = {
        offerType,
        modelName: model,
        apr: parseNumberLike(headingText.replace(/%/g, "")),
        months: parseNumberLike(months),
        description: cleanText(line),
      };
    } else {
      offerType = /Loyalty/i.test(headingText) ? "bonus" : "bonus";
      offerTitle = `${model} ${headingText}`;
      normalizedPayload = {
        offerType,
        modelName: model,
        bonusHeadline: headingText,
        description: cleanText(line),
      };
    }

    offers.push({
      sourceItemKey: ["audi-offers-mirror", slugify(model), offerType, slugify(headingText), expirationDate || "no-expiration"].join(":"),
      offerTitle,
      offerModel: model,
      offerType,
      effectiveDate: null,
      expirationDate,
      sourcePayload: {
        headingLine,
        description: cleanText(line),
        context: previousLines,
      },
      normalizedPayload,
      notes: "Imported from Audi USA offers page mirror (copy-derived block)",
    });
  }

  return offers;
}

function dedupeOffers(offers: ParsedAudiOffer[]) {
  const deduped = new Map<string, ParsedAudiOffer>();
  for (const offer of offers) {
    if (!deduped.has(offer.sourceItemKey)) {
      deduped.set(offer.sourceItemKey, offer);
    }
  }
  return Array.from(deduped.values());
}

function parseAudiOffers(markdown: string) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = dedupeOffers([
    ...extractLeaseFromFeatured(lines),
    ...extractCopyDrivenOffers(lines),
  ]);

  return parsed;
}

function buildOfferReviewInput(source: EngineSource, jobId: number, offer: ParsedAudiOffer): InsertOfferReview {
  return {
    sourceId: source.id,
    sourceKey: source.key,
    moduleKey: source.moduleKey,
    jobId,
    dealershipId: null,
    brand: "Audi",
    accountName: "Audi USA National Offers",
    offerTitle: offer.offerTitle,
    offerModel: offer.offerModel,
    offerType: offer.offerType,
    status: "detected",
    sourceUrl: source.sourceUrl || AUDI_OFFERS_PAGE_URL,
    sourcePayload: JSON.stringify(offer.sourcePayload),
    normalizedPayload: JSON.stringify(offer.normalizedPayload),
    effectiveDate: offer.effectiveDate,
    expirationDate: offer.expirationDate,
    notes: cleanText(offer.notes),
  };
}

export async function runAudiOfferDetection(storage: IStorage, source: EngineSource, jobId: number): Promise<DetectionRunResult> {
  const response = await fetch(AUDI_OFFERS_MIRROR_URL, {
    headers: {
      "accept": "text/plain, text/markdown;q=0.9, */*;q=0.8",
      "user-agent": "Mozilla/5.0 PostEngine Audi Detector",
    },
  });

  if (!response.ok) {
    throw new Error(`Audi offers mirror returned ${response.status}`);
  }

  const markdown = await response.text();
  const parsedOffers = parseAudiOffers(markdown);
  if (parsedOffers.length === 0) {
    throw new Error("Audi offers mirror returned no parseable offers");
  }

  let detectedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  const reviews: Array<{ id: number; sourceItemKey: string | null; offerTitle: string }> = [];

  for (const offer of parsedOffers) {
    if (!offer.offerModel || !offer.offerTitle) {
      skippedCount += 1;
      continue;
    }

    detectedCount += 1;
    const existing = storage.getOfferReviewBySourceItemKey(offer.sourceItemKey);
    const review = storage.upsertOfferReviewBySourceItemKey(offer.sourceItemKey, buildOfferReviewInput(source, jobId, offer));
    if (existing) {
      updatedCount += 1;
    } else {
      insertedCount += 1;
    }

    reviews.push({ id: review.id, sourceItemKey: offer.sourceItemKey, offerTitle: review.offerTitle });
  }

  return {
    detectedCount,
    insertedCount,
    updatedCount,
    skippedCount,
    reviews,
  };
}
