import { parseTikTokSettings, postTargetsTikTok, validateTikTokPost } from "@shared/tiktok";
import { storeTikTokDefaults } from "./zernio-accounts";

export function normalizeTikTokForStorage(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, "tiktokSettings")) return;
  const value = body.tiktokSettings;
  if (value == null || value === "") {
    body.tiktokSettings = null;
    return;
  }
  const parsed = parseTikTokSettings(value);
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  body.tiktokSettings = JSON.stringify(parsed.value);
}

export function tiktokWriteErrors(data: {
  dealershipId?: number | null;
  platforms?: unknown;
  caption?: string | null;
  captionTiktok?: string | null;
  captionExact?: unknown;
  mediaUrls?: unknown;
  mediaType?: string | null;
  tiktokSettings?: unknown;
}): string[] {
  if (!postTargetsTikTok(data.platforms)) return [];
  const dealershipId = Number(data.dealershipId);
  return validateTikTokPost(data, {
    storeDefaults: Number.isInteger(dealershipId) ? storeTikTokDefaults(dealershipId) : null,
    requireOwnCaption: true,
  }).errors;
}
