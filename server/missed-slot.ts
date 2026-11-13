import {
  CHICAGO_TZ,
  addUtcDays,
  chicagoTimeOfDay,
  chicagoWallTime,
  earliestRescheduleYmd,
  evaluatePublishIdempotency,
  formatChicagoTimestamp,
  formatChicagoYmd,
  publishOverdueWindowMs,
  slotPastApprovalWindow,
  type PublishGatePost,
} from "./publish-gate";

const OCCUPYING_STATUSES = new Set(["queued", "scheduled", "approved", "published"]);
const RESCHEDULE_STATUSES = new Set(["scheduled", "approved"]);

export type MissedSlotMove<T extends PublishGatePost = PublishGatePost> = {
  id: number;
  dealershipId: number;
  status: string;
  from: string;
  to: string;
  fromChicago: string | null;
  toChicago: string | null;
  post: T;
};

export type MissedSlotRescheduleResult<T extends PublishGatePost = PublishGatePost> = {
  posts: T[];
  moves: Array<MissedSlotMove<T>>;
};

export function postOccupiesChicagoDay(post: PublishGatePost): string | null {
  if (!OCCUPYING_STATUSES.has(post.status)) return null;
  const raw = post.scheduledFor || (post.status === "published" ? post.publishedAt : null);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return formatChicagoYmd(date);
}

export function shouldRescheduleMissedPost(
  post: PublishGatePost,
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
): boolean {
  if (post.status === "held" || post.heldAt) return false;
  if (post.status === "rejected" || post.status === "published" || post.status === "expired" || post.status === "draft") {
    return false;
  }
  if (!RESCHEDULE_STATUSES.has(post.status)) return false;
  if (post.publishedAt) return false;
  if (evaluatePublishIdempotency(post).zernioIds.length > 0) return false;
  if (!post.scheduledFor) return false;
  return slotPastApprovalWindow(post, now, windowMs);
}

export function nextOpenSlot(
  post: PublishGatePost,
  occupiedDays: ReadonlySet<string>,
  now = new Date(),
): Date {
  if (!post.scheduledFor) {
    throw new Error("Post has no scheduled time");
  }
  const original = new Date(post.scheduledFor);
  if (Number.isNaN(original.getTime())) {
    throw new Error("Post has an invalid scheduled time");
  }
  const time = chicagoTimeOfDay(original);
  let day = earliestRescheduleYmd(now);
  while (occupiedDays.has(day)) {
    day = addUtcDays(day, 1);
  }
  return chicagoWallTime(day, time);
}

export function buildMissedSlotReschedulePatch(
  post: PublishGatePost,
  nextSlot: Date,
  now = new Date(),
) {
  const from = post.scheduledFor!;
  const to = nextSlot.toISOString();
  return {
    scheduledFor: to,
    rescheduledFrom: from,
    rescheduledAt: now.toISOString(),
  };
}

export function missedSlotMoveLogDetails(from: string, to: string): string {
  const fromChicago = formatChicagoTimestamp(from);
  const toChicago = formatChicagoTimestamp(to);
  return `Moved missed slot from ${fromChicago ?? from} to ${toChicago ?? to} (${CHICAGO_TZ})`;
}

export function applyMissedSlotReschedule<T extends PublishGatePost>(
  posts: T[],
  now = new Date(),
  windowMs = publishOverdueWindowMs(),
): MissedSlotRescheduleResult<T> {
  const occupancy = new Map<number, Set<string>>();
  const ensureStore = (dealershipId: number) => {
    let days = occupancy.get(dealershipId);
    if (!days) {
      days = new Set();
      occupancy.set(dealershipId, days);
    }
    return days;
  };

  for (const post of posts) {
    const day = postOccupiesChicagoDay(post);
    if (day) ensureStore(post.dealershipId).add(day);
  }

  const candidates = posts
    .filter((post) => shouldRescheduleMissedPost(post, now, windowMs))
    .sort((a, b) => String(a.scheduledFor).localeCompare(String(b.scheduledFor)) || a.id - b.id);

  const byId = new Map(posts.map((post) => [post.id, post]));
  const moves: Array<MissedSlotMove<T>> = [];

  for (const post of candidates) {
    const days = ensureStore(post.dealershipId);
    const currentDay = postOccupiesChicagoDay(post);
    if (currentDay) days.delete(currentDay);
    const nextSlot = nextOpenSlot(post, days, now);
    const patch = buildMissedSlotReschedulePatch(post, nextSlot, now);
    const updated = { ...post, ...patch };
    byId.set(post.id, updated);
    days.add(formatChicagoYmd(nextSlot));
    moves.push({
      id: post.id,
      dealershipId: post.dealershipId,
      status: post.status,
      from: patch.rescheduledFrom,
      to: patch.scheduledFor,
      fromChicago: formatChicagoTimestamp(patch.rescheduledFrom),
      toChicago: formatChicagoTimestamp(patch.scheduledFor),
      post: updated,
    });
  }

  return {
    posts: posts.map((post) => byId.get(post.id) ?? post),
    moves,
  };
}
