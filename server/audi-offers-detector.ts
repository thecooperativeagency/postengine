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

type AudiImageReference = {
  index: number;
  url: string;
  model: string | null;
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

function parsePercentLike(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.replace(/%/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberLike(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function extractImageUrl(line: string) {
  return line.match(/\((https?:\/\/[^)]+)\)/)?.[1] ?? null;
}

function extractModelFromCopy(line: string) {
  const match = line.match(/(20\d{2} Audi [A-Za-z0-9\- ]+(?:quattro|TFSI|e-tron|Sportback|SUV|Avant|Cabriolet|Roadster))/i);
  return cleanText(match?.[1] ?? null);
}

function extractExplicitModel(line: string) {
  if (!/^#### 20\d{2} Audi /i.test(line)) return null;
  return cleanText(line.replace(/^####\s+/, ""));
}

function extractAnyModel(line: string) {
  return extractExplicitModel(line) || extractModelFromCopy(line);
}

function getModelFamily(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const families = ["sq8", "sq7", "sq5", "s5", "s3", "q8", "q7", "q5", "q3", "a6", "a5", "a3"];
  return families.find((family) => normalized.includes(` ${family}`) || normalized.includes(`/${family}`) || normalized.includes(`-${family}`) || normalized.endsWith(family)) || null;
}

function inferModelFromImageUrl(url: string | null | undefined) {
  if (!url) return null;
  const lower = url.toLowerCase();
  const year = lower.match(/\/assets\/(20\d{2})\//)?.[1] || lower.match(/\/(20\d{2})_/ )?.[1] || null;
  const prefix = year ? `${year} Audi` : "Audi";

  if (lower.includes("/q3/")) return `${prefix} Q3 quattro`;
  if (lower.includes("all-new-q5")) return `${prefix} Q5 quattro`;
  if (lower.includes("/sq5-sb/")) return `${prefix} SQ5 Sportback`;
  if (lower.includes("q5-sb")) return `${prefix} Q5 Sportback 45 TFSI`;
  if (lower.includes("/sq5/")) return `${prefix} SQ5`;
  if (lower.includes("/sq8/")) return `${prefix} SQ8 quattro`;
  if (lower.includes("/sq7/")) return `${prefix} SQ7 quattro`;
  if (lower.includes("/q8/")) return `${prefix} Q8`;
  if (lower.includes("/q7/")) return `${prefix} Q7`;
  if (lower.includes("/s5/")) return `${prefix} S5`;
  if (lower.includes("/a6/")) return `${prefix} A6 Sedan quattro`;
  if (lower.includes("/a5/")) return `${prefix} A5 quattro`;
  if (lower.includes("/s3/")) return `${prefix} S3 Sedan quattro`;
  if (lower.includes("/a3/")) return `${prefix} A3 Sedan 40 TFSI`;

  return null;
}

function extractExpiration(block: string[]) {
  const line = block.find((entry) => /^Offer ends /i.test(entry));
  if (!line) return null;
  return normalizeDate(line.replace(/^Offer ends /i, ""));
}

function buildImageReferences(lines: string[]) {
  const references: AudiImageReference[] = [];
  const modelByUrl = new Map<string, string>();

  for (let i = 0; i < lines.length; i += 1) {
    const url = extractImageUrl(lines[i]);
    if (!url) continue;

    let model = modelByUrl.get(url) ?? null;
    const inferredModel = inferModelFromImageUrl(url);
    if (model && inferredModel) {
      const existingFamily = getModelFamily(model);
      const inferredFamily = getModelFamily(inferredModel);
      if (existingFamily && inferredFamily && existingFamily !== inferredFamily) {
        model = inferredModel;
      }
    }
    if (!model && inferredModel) {
      model = inferredModel;
    }

    if (!model) {
      for (let distance = 1; distance <= 12; distance += 1) {
        const previous = lines[i - distance];
        if (previous) {
          const candidate = extractAnyModel(previous);
          if (candidate) {
            model = candidate;
            break;
          }
        }

        const next = lines[i + distance];
        if (next) {
          const candidate = extractExplicitModel(next);
          if (candidate) {
            model = candidate;
            break;
          }
        }
      }
    }

    if (model && !modelByUrl.has(url)) {
      modelByUrl.set(url, model);
    }

    references.push({
      index: i,
      url,
      model: model || modelByUrl.get(url) || null,
    });
  }

  return references;
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
    const headingLine = [...previousLines].reverse().find((entry) => entry.startsWith("### "));
    if (!headingLine) continue;

    const block = [headingLine, line];
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      if (/^Offer ends /i.test(lines[j]) || /Bonus Offer|Lease Offer|\*View offer details/i.test(lines[j])) {
        block.push(lines[j]);
      }
    }

    const expirationDate = extractExpiration(block);
    const headingText = cleanText(headingLine.replace(/^###\s+/, "")) || "Audi Offer";

    offers.push({
      sourceItemKey: ["audi-offers-mirror", slugify(model), "bonus", slugify(headingText), expirationDate || "no-expiration"].join(":"),
      offerTitle: `${model} ${headingText}`,
      offerModel: model,
      offerType: "bonus",
      effectiveDate: null,
      expirationDate,
      sourcePayload: {
        headingLine,
        description: cleanText(line),
        context: previousLines,
      },
      normalizedPayload: {
        offerType: "bonus",
        modelName: model,
        bonusHeadline: headingText,
        description: cleanText(line),
      },
      notes: "Imported from Audi USA offers page mirror (copy-derived feature block)",
    });
  }

  return offers;
}

function parseStandardCardOffer(lines: string[], imageReference: AudiImageReference | null): ParsedAudiOffer | null {
  const headlineIndex = lines.findIndex((entry, index) => {
    if (!entry.startsWith("#### ")) return false;
    if (/^#### 20\d{2} Audi /i.test(entry)) return false;
    if (index > 0 && lines[index - 1] === "MSRP starts from") return false;
    return /^#### (\$[\d,]+(?: [A-Za-z].*)?|[\d.]+%)$/i.test(entry);
  });

  if (headlineIndex === -1) return null;

  const headlineLine = lines[headlineIndex];
  const headlineText = cleanText(headlineLine.replace(/^####\s+/, ""));
  if (!headlineText) return null;

  const model = lines.map(extractAnyModel).find(Boolean) || imageReference?.model || null;
  if (!model) return null;

  const block = lines.slice(headlineIndex);
  const expirationDate = extractExpiration(block);
  const description = block.find((entry, index) => {
    if (index === 0) return false;
    return !entry.startsWith("#### ") && !/^\*APR$/i.test(entry) && !/Monthly payment/i.test(entry) && entry !== "Months" && !/Due at Signing/i.test(entry) && !/^Offer ends /i.test(entry) && !/^\*View offer details/i.test(entry) && !/^MSRP starts from$/i.test(entry);
  }) || null;

  if (block.some((entry) => /Monthly payment/i.test(entry))) {
    const paymentText = headlineText;
    const monthsIndex = block.findIndex((entry, index) => /^#### \d+$/.test(entry) && block[index + 1] === "Months");
    const monthsText = monthsIndex >= 0 ? cleanText(block[monthsIndex].replace(/^####\s+/, "")) : null;
    const dueIndex = block.findIndex((entry, index) => /^#### \$[\d,]+$/.test(entry) && /Due at Signing/i.test(block[index + 1] ?? ""));
    const dueAtSigningText = dueIndex >= 0 ? cleanText(block[dueIndex].replace(/^####\s+/, "")) : null;
    const disclaimer = description ? cleanText(description) : null;

    if (!monthsText) return null;

    return {
      sourceItemKey: ["audi-offers-mirror", slugify(model), "lease", slugify(`${paymentText}-${monthsText}`), expirationDate || "no-expiration"].join(":"),
      offerTitle: `${model} Lease ${paymentText} / ${monthsText} months`,
      offerModel: model,
      offerType: "lease",
      effectiveDate: null,
      expirationDate,
      sourcePayload: {
        imageUrl: imageReference?.url || null,
        headline: headlineText,
        description: disclaimer,
        source: "standard-card",
      },
      normalizedPayload: {
        offerType: "lease",
        modelName: model,
        monthlyPayment: parseCurrencyLike(paymentText),
        leaseTermMonths: parseNumberLike(monthsText),
        dueAtSigning: parseCurrencyLike(dueAtSigningText),
        disclaimer,
      },
      notes: "Imported from Audi USA offers page mirror (standard lease card)",
    };
  }

  if (/^\d+(?:\.\d+)?%$/.test(headlineText) || block.some((entry) => /^\*APR$/i.test(entry))) {
    const monthsIndex = block.findIndex((entry, index) => /^#### \d+$/.test(entry) && block[index + 1] === "Months");
    const monthsText = monthsIndex >= 0 ? cleanText(block[monthsIndex].replace(/^####\s+/, "")) : null;

    return {
      sourceItemKey: ["audi-offers-mirror", slugify(model), "finance", slugify(`${headlineText}-${monthsText || "no-term"}`), expirationDate || "no-expiration"].join(":"),
      offerTitle: monthsText ? `${model} Finance ${headlineText} APR for ${monthsText} months` : `${model} Finance ${headlineText} APR`,
      offerModel: model,
      offerType: "finance",
      effectiveDate: null,
      expirationDate,
      sourcePayload: {
        imageUrl: imageReference?.url || null,
        headline: headlineText,
        description: cleanText(description),
        source: "standard-card",
      },
      normalizedPayload: {
        offerType: "finance",
        modelName: model,
        apr: parsePercentLike(headlineText),
        months: parseNumberLike(monthsText),
        description: cleanText(description),
      },
      notes: "Imported from Audi USA offers page mirror (standard finance card)",
    };
  }

  return {
    sourceItemKey: ["audi-offers-mirror", slugify(model), "bonus", slugify(headlineText), expirationDate || "no-expiration"].join(":"),
    offerTitle: `${model} ${headlineText}`,
    offerModel: model,
    offerType: "bonus",
    effectiveDate: null,
    expirationDate,
    sourcePayload: {
      imageUrl: imageReference?.url || null,
      headline: headlineText,
      description: cleanText(description),
      source: "standard-card",
    },
    normalizedPayload: {
      offerType: "bonus",
      modelName: model,
      bonusHeadline: headlineText,
      bonusValue: parseCurrencyLike(headlineText),
      description: cleanText(description),
    },
    notes: "Imported from Audi USA offers page mirror (standard bonus card)",
  };
}

function extractStandardCardOffers(lines: string[], imageReferences: AudiImageReference[]) {
  const offers: ParsedAudiOffer[] = [];

  for (let i = 0; i < imageReferences.length; i += 1) {
    const current = imageReferences[i];
    const next = imageReferences[i + 1];
    const block = lines.slice(current.index + 1, next ? next.index : lines.length);
    if (!block.length) continue;

    const offer = parseStandardCardOffer(block, current);
    if (offer) {
      offers.push(offer);
    }
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

export function parseAudiOffers(markdown: string) {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const imageReferences = buildImageReferences(lines);
  const parsed = dedupeOffers([
    ...extractLeaseFromFeatured(lines),
    ...extractCopyDrivenOffers(lines),
    ...extractStandardCardOffers(lines, imageReferences),
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
