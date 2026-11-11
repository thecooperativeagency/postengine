import { applyScheduledExpiry } from "./publish-gate";
import { storage } from "./storage";

/** Move past-due scheduled posts to expired. Never deletes and never touches held rows. */
export function runScheduledExpirySweep(now = new Date()) {
  const scheduled = storage.getPosts({ status: "scheduled" });
  const plan = applyScheduledExpiry(scheduled, now);
  const expiredIds: number[] = [];

  for (const id of plan.expiredIds) {
    const planned = plan.posts.find((row) => row.id === id);
    const current = storage.getPost(id);
    if (!planned || !current) continue;
    if (current.status !== "scheduled" || current.heldAt) continue;
    const saved = storage.updatePost(id, {
      status: "expired",
      expiredAt: planned.expiredAt ?? null,
      expiredReason: planned.expiredReason ?? "Past due and not approved",
    });
    if (!saved) continue;
    storage.logActivity({
      postId: saved.id,
      dealershipId: saved.dealershipId,
      action: "expired",
      details: `Moved out of the active queue (past due, not approved): ${saved.vehicleInfo || saved.postType || "post"}`,
    });
    expiredIds.push(saved.id);
  }

  return { expiredIds, deletedIds: [] as number[] };
}

export function startScheduledExpirySweeper() {
  const run = () => {
    try {
      const result = runScheduledExpirySweep();
      if (result.expiredIds.length > 0) {
        console.log(
          `[Queue] Expired ${result.expiredIds.length} past-due scheduled post(s) out of the active queue: ${result.expiredIds.join(", ")}`,
        );
      }
    } catch (error) {
      console.error("[Queue] Scheduled expiry sweep failed:", error);
    }
  };
  run();
  const timer = setInterval(run, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
