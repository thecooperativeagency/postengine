import { applyMissedSlotReschedule, missedSlotMoveLogDetails } from "./missed-slot";
import { storage } from "./storage";

/** Move missed scheduled/approved posts to the next open store slot. Never expires rows and never touches held rows. */
export function runMissedSlotReschedule(now = new Date()) {
  const posts = storage.getPosts();
  const plan = applyMissedSlotReschedule(posts, now);
  const movedIds: number[] = [];
  const moves: Array<{
    id: number;
    dealershipId: number;
    status: string;
    from: string;
    to: string;
    fromChicago: string | null;
    toChicago: string | null;
  }> = [];

  for (const move of plan.moves) {
    const current = storage.getPost(move.id);
    if (!current) continue;
    if (current.status === "held" || current.heldAt) continue;
    if (current.status !== "scheduled" && current.status !== "approved") continue;
    if (current.scheduledFor !== move.from) continue;
    const saved = storage.updatePost(move.id, {
      scheduledFor: move.to,
      rescheduledFrom: move.from,
      rescheduledAt: now.toISOString(),
    });
    if (!saved) continue;
    const details = missedSlotMoveLogDetails(move.from, move.to);
    storage.logActivity({
      postId: saved.id,
      dealershipId: saved.dealershipId,
      action: "rescheduled",
      details: `${details}: ${saved.vehicleInfo || saved.postType || "post"}`,
    });
    movedIds.push(saved.id);
    moves.push({
      id: saved.id,
      dealershipId: saved.dealershipId,
      status: saved.status,
      from: move.from,
      to: saved.scheduledFor || move.to,
      fromChicago: move.fromChicago,
      toChicago: move.toChicago,
    });
  }

  return { movedIds, moves };
}

export function startMissedSlotRescheduler() {
  const run = () => {
    try {
      const result = runMissedSlotReschedule();
      if (result.moves.length > 0) {
        const summary = result.moves
          .map((move) => `#${move.id} ${move.fromChicago ?? move.from} -> ${move.toChicago ?? move.to}`)
          .join("; ");
        console.log(
          `[Queue] Rescheduled ${result.moves.length} missed post(s) to the next open store slot: ${summary}`,
        );
      }
    } catch (error) {
      console.error("[Queue] Missed-slot reschedule failed:", error);
    }
  };
  run();
  const timer = setInterval(run, 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}
