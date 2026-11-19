import { z } from "zod";

/**
 * TikTok posting defaults live here so they can change in one place.
 * Lance has not confirmed duet, stitch, AI disclosure, or commercial disclosure.
 * Per-store overrides belong in `.zernio-accounts.json` under `tiktok_defaults`.
 * Per-post overrides belong in `posts.tiktok_settings`.
 */
export const TIKTOK_CAPTION_MAX = 2200;
export const TIKTOK_VIDEO_MIN_SEC = 3;
export const TIKTOK_VIDEO_MAX_SEC = 600;
export const TIKTOK_VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "m4v"] as const;

export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;

export const TIKTOK_COMMERCIAL_TYPES = ["none", "brand_organic", "brand_content"] as const;

export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];
export type TikTokCommercialType = (typeof TIKTOK_COMMERCIAL_TYPES)[number];

export const TIKTOK_DEFAULTS = {
  privacy_level: "PUBLIC_TO_EVERYONE" as TikTokPrivacyLevel,
  allow_comment: true,
  allow_duet: true,
  allow_stitch: true,
  video_cover_timestamp_ms: 1000,
  video_made_with_ai: false,
  commercialContentType: "none" as TikTokCommercialType,
  draft: false,
};

export const tiktokSettingsSchema = z.object({
  privacy_level: z.enum(TIKTOK_PRIVACY_LEVELS).optional(),
  allow_comment: z.boolean().optional(),
  allow_duet: z.boolean().optional(),
  allow_stitch: z.boolean().optional(),
  video_cover_timestamp_ms: z.number().int().min(0).max(60 * 60 * 1000).optional(),
  video_cover_image_url: z.string().optional(),
  video_made_with_ai: z.boolean().optional(),
  commercialContentType: z.enum(TIKTOK_COMMERCIAL_TYPES).optional(),
  draft: z.boolean().optional(),
}).strict();

export type TikTokSettingsOverride = z.infer<typeof tiktokSettingsSchema>;

export type TikTokSettings = {
  privacy_level: TikTokPrivacyLevel;
  allow_comment: boolean;
  allow_duet: boolean;
  allow_stitch: boolean;
  video_cover_timestamp_ms: number;
  video_cover_image_url?: string;
  video_made_with_ai: boolean;
  commercialContentType: TikTokCommercialType;
  draft: boolean;
};

export type TikTokCreatorInfo = {
  privacyLevels?: string[];
  postingLimits?: { maxVideoDurationSec?: number };
  interactionSettings?: {
    allow_comment?: { enabled?: boolean };
    allow_duet?: { enabled?: boolean };
    allow_stitch?: { enabled?: boolean };
  };
  commercialContentTypes?: string[];
};

export type TikTokProbe = {
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  codec?: string | null;
  error?: string | null;
};

export type TikTokValidation = {
  errors: string[];
  warnings: string[];
  settings: TikTokSettings;
};

const PRIVACY_SET = new Set<string>(TIKTOK_PRIVACY_LEVELS);

export function postTargetsTikTok(platforms: unknown): boolean {
  return readPlatformList(platforms).includes("tiktok");
}

export function readPlatformList(platforms: unknown): string[] {
  if (Array.isArray(platforms)) {
    return platforms.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof platforms !== "string" || !platforms.trim()) return [];
  try {
    const parsed = JSON.parse(platforms);
    if (Array.isArray(parsed)) {
      return parsed.map((value) => String(value).trim().toLowerCase()).filter(Boolean);
    }
  } catch {
    // fall through to a comma list
  }
  return platforms.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
}

export function parseTikTokSettings(value: unknown): { ok: true; value: TikTokSettingsOverride } | { ok: false; error: string } {
  if (value == null || value === "") return { ok: true, value: {} };
  try {
    const raw = typeof value === "string" ? JSON.parse(value) : value;
    if (raw == null) return { ok: true, value: {} };
    return { ok: true, value: tiktokSettingsSchema.parse(raw) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/unrecognized[_ ]keys?/i.test(message)) {
      return { ok: false, error: "Unknown TikTok setting" };
    }
    return { ok: false, error: "TikTok settings are invalid" };
  }
}

function withoutEmpty(override: TikTokSettingsOverride): Partial<TikTokSettings> {
  const next: Partial<TikTokSettings> = {};
  (Object.keys(override) as Array<keyof TikTokSettingsOverride>).forEach((key) => {
    const value = override[key];
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  });
  return next;
}

export function mergeTikTokSettings(
  storeDefaults?: unknown,
  postSettings?: unknown,
  creatorInfo?: TikTokCreatorInfo | null,
): { ok: true; settings: TikTokSettings } | { ok: false; error: string } {
  const store = parseTikTokSettings(storeDefaults);
  if (!store.ok) return store;
  const post = parseTikTokSettings(postSettings);
  if (!post.ok) return post;
  const settings: TikTokSettings = {
    ...TIKTOK_DEFAULTS,
    ...withoutEmpty(store.value),
    ...withoutEmpty(post.value),
  };
  const interactions = creatorInfo?.interactionSettings;
  if (interactions?.allow_comment?.enabled === false) settings.allow_comment = false;
  if (interactions?.allow_duet?.enabled === false) settings.allow_duet = false;
  if (interactions?.allow_stitch?.enabled === false) settings.allow_stitch = false;
  return { ok: true, settings };
}

function isCaptionExact(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/** TikTok caption. Exact mode is verbatim. Otherwise trim only — hashtags stay, and the Instagram CTA is never added. */
export function resolveTikTokCaption(post: {
  caption?: string | null;
  captionTiktok?: string | null;
  caption_tiktok?: string | null;
  captionExact?: unknown;
  caption_exact?: unknown;
}): string {
  const fallback = post.caption == null ? "" : String(post.caption);
  const own = post.captionTiktok ?? post.caption_tiktok;
  const chosen = own == null || String(own).length === 0 ? fallback : String(own);
  if (isCaptionExact(post.captionExact ?? post.caption_exact)) return chosen;
  return chosen.trim();
}

function readMediaUrls(mediaUrls: unknown): string[] {
  if (Array.isArray(mediaUrls)) {
    return mediaUrls.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  }
  if (typeof mediaUrls !== "string" || !mediaUrls.trim()) return [];
  try {
    const parsed = JSON.parse(mediaUrls);
    if (Array.isArray(parsed)) {
      return parsed.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
    }
  } catch {
    return [];
  }
  return [];
}

function mediaExtension(url: string): string {
  const path = url.split("?")[0]?.split("#")[0] || "";
  const match = path.match(/\.([a-z0-9]+)$/i);
  return (match?.[1] || "").toLowerCase();
}

export function validateTikTokPost(
  post: {
    platforms?: unknown;
    caption?: string | null;
    captionTiktok?: string | null;
    caption_tiktok?: string | null;
    captionExact?: unknown;
    caption_exact?: unknown;
    mediaUrls?: unknown;
    mediaType?: string | null;
    tiktokSettings?: unknown;
    tiktok_settings?: unknown;
  },
  options: {
    storeDefaults?: unknown;
    creatorInfo?: TikTokCreatorInfo | null;
    accountMapped?: boolean;
    requireAccount?: boolean;
    requireOwnCaption?: boolean;
    probe?: TikTokProbe | null;
  } = {},
): TikTokValidation {
  const merged = mergeTikTokSettings(
    options.storeDefaults,
    post.tiktokSettings ?? post.tiktok_settings,
    options.creatorInfo,
  );
  const settings: TikTokSettings = merged.ok
    ? merged.settings
    : { ...TIKTOK_DEFAULTS };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!merged.ok) errors.push(merged.error);

  if (!postTargetsTikTok(post.platforms)) {
    return { errors, warnings, settings };
  }

  if (options.requireAccount && options.accountMapped === false) {
    errors.push("TikTok account is not mapped for this store");
  }

  const urls = readMediaUrls(post.mediaUrls);
  const mediaType = String(post.mediaType || "").toLowerCase();
  if (mediaType !== "video" || urls.length !== 1) {
    errors.push("TikTok needs one video");
  } else if (!TIKTOK_VIDEO_EXTENSIONS.includes(mediaExtension(urls[0]) as typeof TIKTOK_VIDEO_EXTENSIONS[number])) {
    errors.push("TikTok video must be MP4, MOV, or WebM");
  }

  const ownCaption = post.captionTiktok ?? post.caption_tiktok;
  if (options.requireOwnCaption && (ownCaption == null || String(ownCaption).trim() === "")) {
    errors.push("TikTok caption is required");
  }
  const caption = resolveTikTokCaption(post);
  if (!errors.some((error) => error === "TikTok caption is required") && (caption.length < 1 || caption.length > TIKTOK_CAPTION_MAX)) {
    errors.push(`TikTok caption must be 1–${TIKTOK_CAPTION_MAX} characters`);
  }

  if (!PRIVACY_SET.has(settings.privacy_level)) {
    errors.push("TikTok privacy level is invalid");
  }
  const allowedPrivacy = options.creatorInfo?.privacyLevels?.filter(Boolean);
  if (allowedPrivacy && allowedPrivacy.length > 0 && !allowedPrivacy.includes(settings.privacy_level)) {
    errors.push(`TikTok privacy level ${settings.privacy_level} is not allowed for this account`);
  }
  if (settings.commercialContentType !== "none" && settings.privacy_level === "SELF_ONLY") {
    errors.push("Branded TikTok content cannot be private");
  }
  if (settings.video_cover_image_url) {
    let coverOk = false;
    try {
      coverOk = new URL(settings.video_cover_image_url).protocol === "https:";
    } catch {
      coverOk = false;
    }
    if (!coverOk) errors.push("TikTok cover image must be an https URL");
  }

  const probe = options.probe;
  if (probe?.error) {
    warnings.push("Could not inspect the TikTok video");
  }
  if (probe && !probe.error && typeof probe.durationSec === "number" && Number.isFinite(probe.durationSec)) {
    const creatorMax = options.creatorInfo?.postingLimits?.maxVideoDurationSec;
    const maxSec = typeof creatorMax === "number" && creatorMax > 0
      ? Math.min(creatorMax, TIKTOK_VIDEO_MAX_SEC)
      : TIKTOK_VIDEO_MAX_SEC;
    if (probe.durationSec < TIKTOK_VIDEO_MIN_SEC || probe.durationSec > maxSec) {
      errors.push(`TikTok video must be between ${TIKTOK_VIDEO_MIN_SEC} seconds and ${maxSec} seconds`);
    }
  }
  if (
    probe
    && !probe.error
    && typeof probe.width === "number"
    && typeof probe.height === "number"
    && probe.width > 0
    && probe.height > 0
  ) {
    const ratio = probe.width / probe.height;
    const target = 9 / 16;
    if (Math.abs(ratio - target) / target > 0.12) {
      warnings.push("TikTok prefers a 9:16 vertical video");
    }
  }
  if (probe && !probe.error && probe.codec) {
    const codec = probe.codec.toLowerCase();
    if (codec !== "h264" && codec !== "avc1") {
      warnings.push("TikTok prefers H.264 video");
    }
  }

  return { errors, warnings, settings };
}

export function summarizeTikTokSettings(postSettings: unknown, storeDefaults?: unknown): string {
  const merged = mergeTikTokSettings(storeDefaults, postSettings);
  if (!merged.ok) return merged.error;
  const settings = merged.settings;
  const bits = [
    settings.privacy_level,
    settings.allow_comment ? "comments on" : "comments off",
    settings.allow_duet ? "duet on" : "duet off",
    settings.allow_stitch ? "stitch on" : "stitch off",
  ];
  if (settings.video_made_with_ai) bits.push("made with AI");
  if (settings.commercialContentType !== "none") bits.push(settings.commercialContentType);
  if (typeof settings.video_cover_timestamp_ms === "number") {
    bits.push(`cover ${settings.video_cover_timestamp_ms}ms`);
  }
  return bits.join(" · ");
}
