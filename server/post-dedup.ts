const ACTIVE_DUPLICATE_STATUSES = new Set(["queued", "scheduled", "published"]);
const RECENT_DUPLICATE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

export interface VehicleDuplicateCandidate {
  id?: number;
  dealershipId: number;
  vehicleInfo?: string | null;
  status: string;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
}

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

export function findRecentVehicleDuplicate(
  target: VehicleDuplicateCandidate,
  existingPosts: VehicleDuplicateCandidate[],
  nowIso?: string,
) {
  const targetVehicles = buildDuplicateKeys(target.vehicleInfo);
  if (targetVehicles.length === 0 || !targetVehicles[0]) return null;

  const anchorIso = nowIso || getAnchorTime(target);
  const anchorTime = anchorIso ? Date.parse(anchorIso) : Date.now();
  if (!Number.isFinite(anchorTime)) return null;

  for (const existing of existingPosts) {
    if (existing.id === target.id) continue;
    if (existing.dealershipId !== target.dealershipId) continue;
    if (!ACTIVE_DUPLICATE_STATUSES.has(existing.status)) continue;

    const existingVehicles = buildDuplicateKeys(existing.vehicleInfo);
    const sharesFingerprint = existingVehicles.some((vehicle) => targetVehicles.includes(vehicle));
    if (!sharesFingerprint) continue;

    const existingAnchor = getAnchorTime(existing);
    if (!existingAnchor) continue;
    const existingTime = Date.parse(existingAnchor);
    if (!Number.isFinite(existingTime)) continue;

    if (Math.abs(anchorTime - existingTime) <= RECENT_DUPLICATE_WINDOW_MS) {
      return existing;
    }
  }

  return null;
}
