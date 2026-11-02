/** Store queue and runway math for the dashboard. No Drive ids, captions, or secrets. */

export interface CoveragePost {
  id?: number;
  dealershipId: number;
  status: string;
  scheduledFor?: string | null;
  publishedAt?: string | null;
  createdAt?: string | null;
  folderSource?: string | null;
  vehicleInfo?: string | null;
  postType?: string | null;
}

export interface DriveArrival {
  id: number | null;
  dealershipId: number;
  vehicleInfo: string | null;
  postType: string | null;
  status: string;
  createdAt: string | null;
}

function startOfLocalDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** When this post covers the runway: a future/past schedule, or a publish. */
export function coverageInstant(post: CoveragePost): number | null {
  if (post.status === "scheduled") return parseTime(post.scheduledFor);
  if (post.status === "published") return parseTime(post.publishedAt || post.scheduledFor);
  return null;
}

/**
 * Whole days since the latest scheduled or published coverage.
 * 0 when something is scheduled today or later.
 * null when the store has never been scheduled or published.
 */
export function daysBehind(posts: CoveragePost[], now = new Date()): number | null {
  const times = posts.map(coverageInstant).filter((time): time is number => time != null);
  if (times.length === 0) return null;
  const latestDay = startOfLocalDay(new Date(Math.max(...times)));
  const today = startOfLocalDay(now);
  return Math.max(0, Math.round((today - latestDay) / 86_400_000));
}

export function driveArrivals(posts: CoveragePost[], limit = 8): DriveArrival[] {
  return posts
    .filter((post) => typeof post.folderSource === "string" && post.folderSource.trim().length > 0)
    .slice()
    .sort((a, b) => (parseTime(b.createdAt) ?? 0) - (parseTime(a.createdAt) ?? 0))
    .slice(0, limit)
    .map((post) => ({
      id: post.id ?? null,
      dealershipId: post.dealershipId,
      vehicleInfo: post.vehicleInfo ?? null,
      postType: post.postType ?? null,
      status: post.status,
      createdAt: post.createdAt ?? null,
    }));
}

export function countStatus(posts: CoveragePost[], status: string): number {
  return posts.filter((post) => post.status === status).length;
}

export interface StoreSummary {
  postCount: number;
  scheduledCount: number;
  draftCount: number;
  queuedCount: number;
  daysBehind: number | null;
  driveInCount: number;
}

export function summarizeStore(posts: CoveragePost[], now = new Date()): StoreSummary {
  return {
    postCount: posts.length,
    scheduledCount: countStatus(posts, "scheduled"),
    draftCount: countStatus(posts, "draft"),
    queuedCount: countStatus(posts, "queued"),
    daysBehind: daysBehind(posts, now),
    driveInCount: posts.filter((post) => typeof post.folderSource === "string" && post.folderSource.trim().length > 0).length,
  };
}
