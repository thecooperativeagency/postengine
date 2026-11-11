import { findRecentVehicleDuplicate, recentVehicleBlockReason } from "./post-dedup";

export const PUBLISH_OVERDUE_WINDOW_MS = 2 * 60 * 60 * 1000;
export const CHICAGO_TZ = "America/Chicago";
export const APPROVAL_WINDOW_REASON = "Scheduled time is past the approval window; re-approval is required";
export const ACTIVE_QUEUE_STATUSES = ["queued", "scheduled", "approved"] as const;
/** Past-due scheduled rows the automatic expiry sweep must leave untouched. */
export const SCHEDULED_EXPIRY_EXCLUDED_IDS = [
  450, 459, 473, 485, 486, 489, 490, 495, 498, 500, 43, 451, 496,
] as const;

export type PublishGatePost = {
  id: number;
  status: string;
  scheduledFor?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  heldAt?: string | null;
  heldReason?: string | null;
  statusBeforeHold?: string | null;
  publishBackoffUntil?: string | null;
  dealershipId: number;
  vehicleInfo?: string | null;
  caption?: string | null;
  captionFacebook?: string | null;
  captionGmb?: string | null;
  mediaUrls?: string | null;
  mediaType?: string | null;
  platforms?: string | null;
  postType?: string | null;
  folderSource?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  notes?: string | null;
  publishResults?: string | null;
  expiredAt?: string | null;
  expiredReason?: string | null;
  scheduleExpiryExempt?: boolean | null;
};

export type DealershipRef = {
  id: number;
  name: string;
};

export type PublishGateDecision = {
  ok: boolean;
  reason: string;
};

export type HoldScope = "due" | "all_scheduled";

const UNHOLDABLE = new Set(["published", "rejected", "draft"]);

export function publishOverdueWindowMs(): number {
  const raw = process.env.PUBLISH_OVERDUE_WINDOW_MINUTES?.trim();
  if (!raw) return PUBLISH_OVERDUE_WINDOW_MS;
  const minutes = Number(raw);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
    return PUBLISH_OVERDUE_WINDOW_MS;
  }
  return minutes * 60 * 1000;
}

export function formatChicagoYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - date.getTime();
}

function addUtcDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

export function chicagoDayRange(ymd: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const startOf = (value: string) => {
    const guess = new Date(`${value}T00:00:00.000Z`);
    const first = new Date(guess.getTime() - tzOffsetMs(guess, CHICAGO_TZ));
    return new Date(guess.getTime() - tzOffsetMs(first, CHICAGO_TZ));
  };
  return { start: startOf(ymd), end: startOf(addUtcDays(ymd, 1)) };
}

export function evaluatePublishGate(
  post: PublishGatePost,
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
): PublishGateDecision {
  if (post.status === "held" || post.heldAt) {
    return { ok: false, reason: "Post is on hold" };
  }
  if (post.status === "queued" || post.status === "draft" || post.status === "scheduled") {
    return { ok: false, reason: `Post is ${post.status}, not explicitly approved for publish` };
  }
  if (post.status === "published") {
    return { ok: false, reason: "Post is already published" };
  }
  if (post.status === "rejected") {
    return { ok: false, reason: "Post is rejected" };
  }
  if (post.status === "expired") {
    return { ok: false, reason: "Post is expired and out of the active queue" };
  }
  if (post.status !== "approved") {
    return { ok: false, reason: `Post status ${post.status} is not approved` };
  }
  const approvedAt = post.approvedAt?.trim();
  const approvedBy = post.approvedBy?.trim();
  if (!approvedAt || !approvedBy) {
    return { ok: false, reason: "Post needs approved_at and approved_by" };
  }
  if (!post.scheduledFor) {
    return { ok: false, reason: "Post has no scheduled time" };
  }
  const scheduled = new Date(post.scheduledFor);
  const approved = new Date(approvedAt);
  if (Number.isNaN(scheduled.getTime())) {
    return { ok: false, reason: "Post has an invalid scheduled time" };
  }
  if (Number.isNaN(approved.getTime())) {
    return { ok: false, reason: "Post has an invalid approved_at" };
  }
  if (scheduled > now) {
    return { ok: false, reason: "Post is not due yet" };
  }
  const effective = Math.max(scheduled.getTime(), approved.getTime());
  if (now.getTime() - effective > windowMs) {
    return { ok: false, reason: APPROVAL_WINDOW_REASON };
  }
  return { ok: true, reason: "ok" };
}


export type PublishIdempotencyDecision = PublishGateDecision & { zernioIds: string[] };

export function parsePublishResultsJson(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function collectZernioPostIds(raw: string | null | undefined): string[] {
  const parsed = parsePublishResultsJson(raw);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(parsed)) {
    if (key === "music" || key === "duplicateVehicle" || key === "error") continue;
    if (!value || typeof value !== "object") continue;
    const postId = (value as { postId?: unknown }).postId;
    if (postId == null) continue;
    const id = String(postId).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function evaluatePublishIdempotency(
  post: Pick<PublishGatePost, "status"> & { publishResults?: string | null },
): PublishIdempotencyDecision {
  const zernioIds = collectZernioPostIds(post.publishResults);
  if (post.status === "published") {
    return { ok: false, reason: "Post is already published", zernioIds };
  }
  if (zernioIds.length > 0) {
    return { ok: false, reason: "Post already has a Zernio post id", zernioIds };
  }
  return { ok: true, reason: "ok", zernioIds: [] };
}

export function selectPublishablePosts<T extends PublishGatePost>(
  posts: T[],
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
): T[] {
  return posts.filter((post) => {
    if (!evaluatePublishGate(post, now, windowMs).ok) return false;
    if (!post.publishBackoffUntil) return true;
    const backoffDate = new Date(post.publishBackoffUntil);
    return Number.isNaN(backoffDate.getTime()) || backoffDate <= now;
  });
}

export function shouldHoldPost(
  post: PublishGatePost,
  now: Date,
  scope: HoldScope = "due",
  excludeIds: Iterable<number> = [],
): boolean {
  const excluded = new Set(excludeIds);
  if (excluded.has(post.id)) return false;
  if (UNHOLDABLE.has(post.status)) return false;
  if (post.status === "held") return false;
  if (post.status !== "scheduled" && post.status !== "approved" && post.status !== "queued") {
    return false;
  }
  if (scope === "all_scheduled") {
    return post.status === "scheduled" || post.status === "approved";
  }
  if (post.status === "queued") return false;
  if (!post.scheduledFor) return false;
  const scheduled = new Date(post.scheduledFor);
  return !Number.isNaN(scheduled.getTime()) && scheduled <= now;
}

export function buildHoldPatch(post: PublishGatePost, now = new Date(), reason = "backlog hold") {
  return {
    status: "held" as const,
    heldAt: now.toISOString(),
    heldReason: reason,
    statusBeforeHold: post.status,
  };
}

export function buildReleaseHoldPatch(post: PublishGatePost) {
  if (post.status !== "held") return null;
  const previous = post.statusBeforeHold && post.statusBeforeHold !== "held"
    ? post.statusBeforeHold
    : "scheduled";
  return {
    status: previous,
    heldAt: null,
    heldReason: null,
    statusBeforeHold: null,
  };
}

export function buildApprovePublishPatch(approvedBy: string, now = new Date()) {
  const name = approvedBy.trim();
  if (!name) {
    throw new Error("approvedBy is required");
  }
  return {
    status: "approved" as const,
    approvedAt: now.toISOString(),
    approvedBy: name,
  };
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function normalizeVehicle(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findSameVehicleWarnings<T extends PublishGatePost>(
  post: T,
  posts: T[],
): Array<{ id: number; vehicleInfo: string | null; status: string; scheduledFor: string | null; publishedAt: string | null }> {
  const target = normalizeVehicle(post.vehicleInfo);
  if (!target) return [];
  return posts
    .filter((other) => {
      if (other.id === post.id) return false;
      if (other.dealershipId !== post.dealershipId) return false;
      if (!["queued", "scheduled", "approved", "held", "published"].includes(other.status)) return false;
      return normalizeVehicle(other.vehicleInfo) === target;
    })
    .map((other) => ({
      id: other.id,
      vehicleInfo: other.vehicleInfo ?? null,
      status: other.status,
      scheduledFor: other.scheduledFor ?? null,
      publishedAt: other.publishedAt ?? null,
    }));
}

export type PreviewRow = {
  id: number;
  store: string;
  dealershipId: number;
  status: string;
  vehicleInfo: string | null;
  postType: string | null;
  caption: string | null;
  captionFacebook: string | null;
  captionGmb: string | null;
  mediaUrls: string[];
  mediaType: string | null;
  platforms: string[];
  scheduledFor: string | null;
  scheduledForChicago: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  heldAt: string | null;
  publishable: boolean;
  publishBlockReason: string | null;
  duplicateWarnings: string[];
};

function formatChicagoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: CHICAGO_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export function toPreviewRow<T extends PublishGatePost>(
  post: T,
  dealerships: DealershipRef[],
  allPosts: T[],
  now = new Date(),
): PreviewRow {
  const decision = evaluatePublishGate(post, now);
  const duplicates = findSameVehicleWarnings(post, allPosts);
  return {
    id: post.id,
    store: dealerships.find((dealer) => dealer.id === post.dealershipId)?.name || "Unknown",
    dealershipId: post.dealershipId,
    status: post.status,
    vehicleInfo: post.vehicleInfo ?? null,
    postType: post.postType ?? null,
    caption: post.caption ?? null,
    captionFacebook: post.captionFacebook ?? null,
    captionGmb: post.captionGmb ?? null,
    mediaUrls: parseJsonArray(post.mediaUrls),
    mediaType: post.mediaType ?? null,
    platforms: parseJsonArray(post.platforms),
    scheduledFor: post.scheduledFor ?? null,
    scheduledForChicago: formatChicagoTimestamp(post.scheduledFor),
    approvedAt: post.approvedAt ?? null,
    approvedBy: post.approvedBy ?? null,
    heldAt: post.heldAt ?? null,
    publishable: decision.ok,
    publishBlockReason: decision.ok ? null : decision.reason,
    duplicateWarnings: duplicates.map((duplicate) => {
      const when = duplicate.publishedAt || duplicate.scheduledFor || "unknown time";
      return `Same vehicle as #${duplicate.id} (${duplicate.vehicleInfo || "unknown"}, ${duplicate.status}, ${when})`;
    }),
  };
}

export function buildDuePreview<T extends PublishGatePost>(args: {
  posts: T[];
  dealerships: DealershipRef[];
  dateYmd: string;
  now?: Date;
  publishEnabled?: boolean;
  driveScanEnabled?: boolean;
}) {
  const now = args.now ?? new Date();
  const { start, end } = chicagoDayRange(args.dateYmd);
  const dueToday: PreviewRow[] = [];
  const overdue: PreviewRow[] = [];

  for (const post of args.posts) {
    if (["published", "rejected", "draft"].includes(post.status)) continue;
    if (!post.scheduledFor) continue;
    const scheduled = new Date(post.scheduledFor);
    if (Number.isNaN(scheduled.getTime())) continue;
    const row = toPreviewRow(post, args.dealerships, args.posts, now);
    if (scheduled >= start && scheduled < end) dueToday.push(row);
    else if (scheduled < start) overdue.push(row);
  }

  dueToday.sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)) || a.id - b.id);
  overdue.sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)) || a.id - b.id);

  return {
    date: args.dateYmd,
    timezone: CHICAGO_TZ,
    generatedAt: now.toISOString(),
    publishEnabled: Boolean(args.publishEnabled),
    driveScanEnabled: Boolean(args.driveScanEnabled),
    dueToday,
    overdue,
  };
}

const ACTIVE_QUEUE_STATUS_SET = new Set<string>(ACTIVE_QUEUE_STATUSES);
const SCHEDULED_EXPIRY_EXCLUDED_ID_SET = new Set<number>(SCHEDULED_EXPIRY_EXCLUDED_IDS);

export function isActiveQueuePost(post: { status: string }): boolean {
  return ACTIVE_QUEUE_STATUS_SET.has(post.status);
}

export function slotPastApprovalWindow(
  post: { scheduledFor?: string | null },
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
): boolean {
  if (!post.scheduledFor) return false;
  const scheduled = new Date(post.scheduledFor);
  if (Number.isNaN(scheduled.getTime())) return false;
  return now.getTime() - scheduled.getTime() > windowMs;
}

export function evaluateApproveForPublish(
  post: PublishGatePost,
  siblings: PublishGatePost[] = [],
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
): PublishGateDecision {
  if (post.status === "held" || post.heldAt) {
    return { ok: false, reason: "Release the hold before approving this post for publish" };
  }
  if (post.status === "published" || post.status === "rejected") {
    return { ok: false, reason: `Cannot approve a ${post.status} post` };
  }
  if (post.status === "expired") {
    return { ok: false, reason: "Restore this expired post before approving it for publish" };
  }
  const idem = evaluatePublishIdempotency(post);
  if (idem.zernioIds.length > 0) {
    return { ok: false, reason: "Post already has a Zernio post id" };
  }
  if (!post.scheduledFor) {
    return { ok: false, reason: "Post has no scheduled time" };
  }
  if (Number.isNaN(new Date(post.scheduledFor).getTime())) {
    return { ok: false, reason: "Post has an invalid scheduled time" };
  }
  if (slotPastApprovalWindow(post, now, windowMs)) {
    return { ok: false, reason: APPROVAL_WINDOW_REASON };
  }
  const publishDuplicate = findRecentVehicleDuplicate(post, siblings, undefined, "publish");
  if (publishDuplicate) {
    return { ok: false, reason: recentVehicleBlockReason(publishDuplicate, "publish") };
  }
  const queueDuplicate = findRecentVehicleDuplicate(post, siblings);
  if (queueDuplicate) {
    return { ok: false, reason: recentVehicleBlockReason(queueDuplicate, "queue") };
  }
  return { ok: true, reason: "ok" };
}

function pushReason(reasons: string[], reason: string | null | undefined) {
  if (!reason || reasons.includes(reason)) return;
  reasons.push(reason);
}

export function listPublishBlockReasons(
  post: PublishGatePost,
  options: {
    now?: Date;
    windowMs?: number;
    siblings?: PublishGatePost[];
    publishEnabled?: boolean;
  } = {},
): string[] {
  const now = options.now ?? new Date();
  const windowMs = options.windowMs ?? publishOverdueWindowMs();
  const reasons: string[] = [];
  const gate = evaluatePublishGate(post, now, windowMs);
  if (!gate.ok) pushReason(reasons, gate.reason);
  if (post.status !== "approved" && slotPastApprovalWindow(post, now, windowMs)) {
    pushReason(reasons, APPROVAL_WINDOW_REASON);
  }
  const idem = evaluatePublishIdempotency(post);
  if (!idem.ok) pushReason(reasons, idem.reason);

  const siblings = options.siblings ?? [];
  const publishDuplicate = findRecentVehicleDuplicate(post, siblings, undefined, "publish");
  if (publishDuplicate) {
    pushReason(reasons, recentVehicleBlockReason(publishDuplicate, "publish"));
  } else {
    const queueDuplicate = findRecentVehicleDuplicate(post, siblings);
    if (queueDuplicate) pushReason(reasons, recentVehicleBlockReason(queueDuplicate, "queue"));
  }

  if (post.publishBackoffUntil) {
    const backoff = new Date(post.publishBackoffUntil);
    if (!Number.isNaN(backoff.getTime()) && backoff > now) {
      pushReason(reasons, "Publish backoff is active");
    }
  }
  if (options.publishEnabled === false) {
    pushReason(reasons, "Publisher is off");
  }
  // Approve can be stricter than a fresh approval window. Only add that
  // reason when the gate already refuses, so a publishable row is not
  // marked blocked.
  if (!gate.ok) {
    const approve = evaluateApproveForPublish(post, siblings, now, windowMs);
    if (!approve.ok) pushReason(reasons, approve.reason);
  }
  return reasons;
}

export function shouldExpireScheduledPost(
  post: PublishGatePost,
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
  excludeIds: Iterable<number> = SCHEDULED_EXPIRY_EXCLUDED_ID_SET,
): boolean {
  const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds);
  if (excluded.has(post.id)) return false;
  if (post.status === "held" || post.heldAt) return false;
  if (post.scheduleExpiryExempt) return false;
  if (post.status !== "scheduled") return false;
  return slotPastApprovalWindow(post, now, windowMs);
}

export function buildExpireScheduledPatch(now = new Date()) {
  return {
    status: "expired" as const,
    expiredAt: now.toISOString(),
    expiredReason: "Past due and not approved",
  };
}

export function buildRestoreExpiredPatch() {
  return {
    status: "scheduled" as const,
    expiredAt: null,
    expiredReason: null,
    scheduleExpiryExempt: true,
  };
}

export function applyScheduledExpiry<T extends PublishGatePost>(
  posts: T[],
  now = new Date(),
  options?: { excludeIds?: Iterable<number>; windowMs?: number },
): {
  posts: Array<T & { expiredAt?: string | null; expiredReason?: string | null }>;
  expiredIds: number[];
  deletedIds: number[];
} {
  const windowMs = options?.windowMs ?? publishOverdueWindowMs();
  const excludeIds = options?.excludeIds ?? SCHEDULED_EXPIRY_EXCLUDED_ID_SET;
  const expiredIds: number[] = [];
  const next = posts.map((post) => {
    if (!shouldExpireScheduledPost(post, now, windowMs, excludeIds)) return post;
    expiredIds.push(post.id);
    return { ...post, ...buildExpireScheduledPatch(now) };
  });
  return { posts: next, expiredIds, deletedIds: [] };
}
