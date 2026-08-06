import type { MusicPickContext } from "./types";

export interface MusicProfile {
  /** Search terms tried in order until candidates found */
  queries: string[];
  minBpm: number;
  maxBpm: number;
  preferNoVocals: boolean;
  moodSlugs: string[];
  energy: MusicPickContext["energy"];
}

const DEFAULT_PROFILE: MusicProfile = {
  queries: [
    "modern luxury automotive instrumental",
    "cinematic premium car commercial",
    "smooth modern corporate",
  ],
  minBpm: 80,
  maxBpm: 120,
  preferNoVocals: true,
  moodSlugs: [],
  energy: "luxury",
};

const BRAND_PROFILES: Record<string, Partial<MusicProfile>> = {
  bmw: {
    queries: [
      "premium german automotive cinematic",
      "modern luxury driving instrumental",
      "confident sleek electronic",
    ],
    minBpm: 85,
    maxBpm: 125,
    energy: "luxury",
  },
  audi: {
    queries: [
      "progressive luxury automotive",
      "modern elegant tech driving",
      "sleek electronic instrumental",
    ],
    minBpm: 90,
    maxBpm: 128,
    energy: "luxury",
  },
  porsche: {
    queries: [
      "sport luxury performance driving",
      "powerful elegant automotive",
      "dynamic cinematic instrumental",
    ],
    minBpm: 95,
    maxBpm: 135,
    energy: "energetic",
  },
};

const POST_TYPE_HINTS: Record<string, Partial<MusicProfile>> = {
  "new cars": {
    queries: ["new car reveal premium", "fresh modern automotive launch"],
    energy: "luxury",
  },
  "pre-owned cars": {
    queries: ["confident modern lifestyle driving", "smooth premium automotive"],
    energy: "default",
  },
  service: {
    queries: ["trustworthy modern workshop", "clean professional instrumental"],
    minBpm: 75,
    maxBpm: 110,
    energy: "calm",
  },
  "customer media": {
    queries: ["warm premium lifestyle delivery", "feel good modern instrumental"],
    energy: "default",
  },
};

function norm(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

/**
 * Resolve music profile from brand + post type.
 * Tenant overrides can be layered later without changing the picker.
 */
export function resolveMusicProfile(ctx: Pick<MusicPickContext, "brand" | "postType" | "energy">): MusicProfile {
  const brand = norm(ctx.brand);
  const postType = norm(ctx.postType);
  const brandPartial = BRAND_PROFILES[brand] || {};
  const typePartial = POST_TYPE_HINTS[postType] || {};

  const queries = [
    ...(typePartial.queries || []),
    ...(brandPartial.queries || []),
    ...DEFAULT_PROFILE.queries,
  ];

  const dedupedQueries: string[] = [];
  for (const q of queries) {
    if (q && dedupedQueries.indexOf(q) === -1) dedupedQueries.push(q);
  }

  return {
    queries: dedupedQueries,
    minBpm: typePartial.minBpm ?? brandPartial.minBpm ?? DEFAULT_PROFILE.minBpm,
    maxBpm: typePartial.maxBpm ?? brandPartial.maxBpm ?? DEFAULT_PROFILE.maxBpm,
    preferNoVocals:
      typePartial.preferNoVocals ?? brandPartial.preferNoVocals ?? DEFAULT_PROFILE.preferNoVocals,
    moodSlugs: typePartial.moodSlugs ?? brandPartial.moodSlugs ?? DEFAULT_PROFILE.moodSlugs,
    energy: ctx.energy || typePartial.energy || brandPartial.energy || DEFAULT_PROFILE.energy,
  };
}
