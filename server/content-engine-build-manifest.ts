import type {
  ContentEngineBuildManifestEntry,
  Dealership,
  OfferReview,
  OfferReviewDownstreamUse,
  OfferReviewTarget,
} from "../shared/schema";

type ManifestEntrySeed = Pick<
  ContentEngineBuildManifestEntry,
  "offerReviewId" | "dealershipId" | "channel" | "placement" | "moduleKey" | "reviewStatus"
>;

type ManifestSyncStorage = {
  getOfferReview(id: number): OfferReview | undefined;
  getOfferReviewTargets(offerReviewId?: number): OfferReviewTarget[];
  getOfferReviewDownstreamUses(offerReviewId?: number, dealershipId?: number): OfferReviewDownstreamUse[];
  replaceContentEngineBuildManifestEntriesForOfferReview(
    offerReviewId: number,
    entries: ManifestEntrySeed[],
  ): ContentEngineBuildManifestEntry[];
};

const BUILD_PLAN_CHANNELS = ["specials-page", "sales-email"] as const;
const placementOrder: Record<string, number> = { hero: 0, primary: 1, supporting: 2 };
const channelLabels: Record<(typeof BUILD_PLAN_CHANNELS)[number], string> = {
  "specials-page": "Specials page",
  "sales-email": "Sales email",
};

export function deriveContentEngineBuildManifestEntries(
  review: OfferReview | undefined,
  targets: OfferReviewTarget[],
  downstreamUses: OfferReviewDownstreamUse[],
): ManifestEntrySeed[] {
  if (!review || !["approved", "published"].includes(review.status)) {
    return [];
  }

  const selectedDealershipIds = new Set(
    targets
      .filter((target) => target.selectionStatus === "selected")
      .map((target) => target.dealershipId),
  );

  return downstreamUses
    .filter((use) => use.isActive && selectedDealershipIds.has(use.dealershipId))
    .map((use) => ({
      offerReviewId: review.id,
      dealershipId: use.dealershipId,
      channel: use.channel,
      placement: use.placement,
      moduleKey: review.moduleKey,
      reviewStatus: review.status,
    }))
    .sort((a, b) => a.dealershipId - b.dealershipId || a.channel.localeCompare(b.channel));
}

export function syncContentEngineBuildManifest(
  storage: ManifestSyncStorage,
  offerReviewId: number,
): ContentEngineBuildManifestEntry[] {
  const review = storage.getOfferReview(offerReviewId);
  const nextEntries = deriveContentEngineBuildManifestEntries(
    review,
    storage.getOfferReviewTargets(offerReviewId),
    storage.getOfferReviewDownstreamUses(offerReviewId),
  );

  return storage.replaceContentEngineBuildManifestEntriesForOfferReview(offerReviewId, nextEntries);
}

export function getOfferReviewTransitionError(
  review: OfferReview,
  nextStatus: string,
  manifestEntries: Array<Pick<ContentEngineBuildManifestEntry, "id">>,
): string | null {
  if (nextStatus !== "published") {
    return null;
  }

  if (manifestEntries.length === 0) {
    return "Offer review cannot be published before at least one downstream handoff row exists";
  }

  return null;
}

export function buildContentEngineBuildPlan({
  dealerships,
  manifests,
  reviews,
}: {
  dealerships: Dealership[];
  manifests: ContentEngineBuildManifestEntry[];
  reviews: OfferReview[];
}) {
  const reviewMap = new Map(reviews.map((review) => [review.id, review]));

  return {
    generatedAt: new Date().toISOString(),
    dealerships: dealerships.map((dealership) => {
      const dealershipManifests = manifests.filter((manifest) => manifest.dealershipId === dealership.id);
      const channels = BUILD_PLAN_CHANNELS.map((channel) => {
        const offers = dealershipManifests
          .filter((manifest) => manifest.channel === channel)
          .flatMap((manifest) => {
            const review = reviewMap.get(manifest.offerReviewId);
            if (!review) {
              return [];
            }

            return [{
              offerReviewId: review.id,
              offerTitle: review.offerTitle,
              offerModel: review.offerModel,
              offerType: review.offerType,
              placement: manifest.placement,
              sourceUrl: review.sourceUrl,
              expirationDate: review.expirationDate,
              notes: review.notes,
            }];
          })
          .sort((a, b) => {
            return (placementOrder[a.placement] ?? 99) - (placementOrder[b.placement] ?? 99)
              || a.offerTitle.localeCompare(b.offerTitle);
          });

        return {
          channel,
          channelLabel: channelLabels[channel],
          offerCount: offers.length,
          offers,
        };
      });

      return {
        dealershipId: dealership.id,
        dealershipName: dealership.name,
        readyOfferCount: channels.reduce((sum, channel) => sum + channel.offerCount, 0),
        channels,
      };
    }),
  };
}
