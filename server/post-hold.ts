import { buildHoldPatch } from "./publish-gate";

const HOLDABLE = new Set(["draft", "queued", "scheduled", "approved"]);

export function readHoldRequest(body: Record<string, unknown>): { hold: boolean; reason: string } {
  const hold = body.hold === true;
  const reason = typeof body.holdReason === "string" && body.holdReason.trim()
    ? body.holdReason.trim().slice(0, 500)
    : "held on create";
  delete body.hold;
  delete body.holdReason;
  return { hold, reason };
}

export function holdPatchIfRequested(
  post: { status: string },
  hold: boolean,
  now = new Date(),
  reason = "held on create",
) {
  if (!hold) return null;
  if (post.status === "published" || post.status === "rejected") {
    return { error: "Cannot hold a published or rejected post" as const };
  }
  if (!HOLDABLE.has(post.status)) {
    return { error: `Cannot hold a ${post.status} post` as const };
  }
  return { patch: buildHoldPatch(post as Parameters<typeof buildHoldPatch>[0], now, reason) };
}
