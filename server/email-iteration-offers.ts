import type { OfferReview, OfferReviewDownstreamUse, OfferReviewTarget } from "../shared/schema";

export type EmailIterationOfferOption = {
  id: number;
  offerTitle: string;
  offerModel: string | null;
  offerType: string | null;
  expirationDate: string | null;
  sourceUrl: string | null;
  channels: string[];
  placements: string[];
};

export function buildEmailIterationOfferOptionsByDealership(
  reviews: OfferReview[],
  targets: OfferReviewTarget[],
  downstreamUses: OfferReviewDownstreamUse[],
) {
  const approvedReviews = new Map(
    reviews
      .filter((review) => ["approved", "published"].includes(review.status))
      .map((review) => [review.id, review]),
  );

  const downstreamByPair = new Map<string, OfferReviewDownstreamUse[]>();
  for (const downstreamUse of downstreamUses) {
    if (!downstreamUse.isActive) continue;
    const key = `${downstreamUse.offerReviewId}:${downstreamUse.dealershipId}`;
    const existing = downstreamByPair.get(key) ?? [];
    existing.push(downstreamUse);
    downstreamByPair.set(key, existing);
  }

  const optionsByDealership = new Map<number, EmailIterationOfferOption[]>();

  for (const target of targets) {
    const review = approvedReviews.get(target.offerReviewId);
    if (!review) continue;
    if (target.selectionStatus !== "selected") continue;

    const pairUses = downstreamByPair.get(`${target.offerReviewId}:${target.dealershipId}`) ?? [];
    const existing = optionsByDealership.get(target.dealershipId) ?? [];
    existing.push({
      id: review.id,
      offerTitle: review.offerTitle,
      offerModel: review.offerModel,
      offerType: review.offerType,
      expirationDate: review.expirationDate,
      sourceUrl: review.sourceUrl,
      channels: Array.from(new Set(pairUses.map((use) => use.channel))).sort(),
      placements: Array.from(new Set(pairUses.map((use) => use.placement))).sort(),
    });
    optionsByDealership.set(target.dealershipId, existing);
  }

  for (const [dealershipId, options] of Array.from(optionsByDealership.entries())) {
    optionsByDealership.set(
      dealershipId,
      options.sort((left, right) => {
        const leftEmail = left.channels.includes("sales-email") ? 0 : 1;
        const rightEmail = right.channels.includes("sales-email") ? 0 : 1;
        if (leftEmail !== rightEmail) return leftEmail - rightEmail;
        return left.offerTitle.localeCompare(right.offerTitle);
      }),
    );
  }

  return optionsByDealership;
}
