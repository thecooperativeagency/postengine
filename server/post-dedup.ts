const ACTIVE_DUPLICATE_STATUSES = new Set(["queued", "scheduled", "approved", "held", "published"]);
const RECENT_DUPLICATE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;
/** Reel cadence is every 5 days; same-car variants are supposed to land ~10–20 days apart. */
const REELS_ADJACENT_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

export interface VehicleDuplicateCandidate {
  id?: number;
  dealershipId: number;
  vehicleInfo?: string | null;
  status: string;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  postType?: string | null;
  folderSource?: string | null;
}

export type VehicleDuplicateMode = "queue" | "publish";

function normalizeVehicleInfo(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDuplicateKeys(value: string | null | undefined) {
  return [normalizeVehicleInfo(value)];
}

function getAnchorTime(candidate: VehicleDuplicateCandidate) {
  return candidate.publishedAt || candidate.scheduledFor || candidate.createdAt || null;
}

function isReels(postType?: string | null) {
  return String(postType || "").toLowerCase() === "reels";
}

function normalizeFolderSource(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function isDistinctReelCut(target: VehicleDuplicateCandidate, existing: VehicleDuplicateCandidate) {
  if (!isReels(target.postType) && !isReels(existing.postType)) return false;
  const targetFolder = normalizeFolderSource(target.folderSource);
  const existingFolder = normalizeFolderSource(existing.folderSource);
  return Boolean(targetFolder && existingFolder && targetFolder !== existingFolder);
}

export function findRecentVehicleDuplicate(
  target: VehicleDuplicateCandidate,
  existingPosts: VehicleDuplicateCandidate[],
  nowIso?: string,
  mode: VehicleDuplicateMode = "queue",
) {
  const targetVehicles = buildDuplicateKeys(target.vehicleInfo);
  if (targetVehicles.length === 0 || !targetVehicles[0]) return null;

  const anchorIso = nowIso || getAnchorTime(target);
  const anchorTime = anchorIso ? Date.parse(anchorIso) : Date.now();
  if (!Number.isFinite(anchorTime)) return null;

  const windowMs =
    isReels(target.postType) ? REELS_ADJACENT_WINDOW_MS : RECENT_DUPLICATE_WINDOW_MS;

  for (const existing of existingPosts) {
    if (existing.id === target.id) continue;
    if (existing.dealershipId !== target.dealershipId) continue;

    if (mode === "publish") {
      // Calendar siblings are intentional. Only a post that already went live can block send.
      if (existing.status !== "published" || !existing.publishedAt) continue;
    } else if (!ACTIVE_DUPLICATE_STATUSES.has(existing.status)) {
      continue;
    }

    if (isDistinctReelCut(target, existing)) continue;

    const existingVehicles = buildDuplicateKeys(existing.vehicleInfo);
    const sharesFingerprint = existingVehicles.some((vehicle) => targetVehicles.includes(vehicle));
    if (!sharesFingerprint) continue;

    const existingAnchor = mode === "publish" ? existing.publishedAt : getAnchorTime(existing);
    if (!existingAnchor) continue;
    const existingTime = Date.parse(existingAnchor);
    if (!Number.isFinite(existingTime)) continue;

    if (Math.abs(anchorTime - existingTime) <= windowMs) {
      return existing;
    }
  }

  return null;
}

export function recentVehicleBlockReason(
  duplicate: { id?: number; vehicleInfo?: string | null },
  mode: VehicleDuplicateMode,
): string {
  const vehicle = duplicate.vehicleInfo || "Unknown vehicle";
  if (mode === "publish") {
    return `Blocked duplicate vehicle publish; matched recent post ${duplicate.id}: ${vehicle}`;
  }
  return `Recent duplicate vehicle already active on post ${duplicate.id}: ${vehicle}`;
}
