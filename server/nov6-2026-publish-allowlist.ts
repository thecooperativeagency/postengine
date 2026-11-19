/**
 * One-time Nov 6, 2026 (America/Chicago) publish allowlist.
 * Each request may approve exactly one ready ID. Approving one never approves another.
 * Does not edit captions or media.
 *
 * 498 and 450 passed the model-level availability check; there is no publish all-clear yet.
 * 486 and 473 did not clear availability and stay held with the backlog pending a new review.
 */
export const NOV6_2026_READY_POST_IDS = [498, 450] as const;
export const NOV6_2026_HELD_FOR_REVIEW_IDS = [486, 473] as const;
export const NOV6_2026_CANDIDATE_POST_IDS = [498, 486, 450, 473] as const;
export const NOV6_2026_APPROVAL_DATE = "2026-11-06";
export const NOV6_2026_APPROVE_NONCE = "nov6-2026-one";

export type Nov6AllowlistResult = {
  ok: boolean;
  reason: string;
};

export function isNov6ReadyPostId(id: number): boolean {
  return (NOV6_2026_READY_POST_IDS as readonly number[]).includes(id);
}

export function validateNov6PublishApproval(ids: number[], dateYmd: string, nonce?: string): Nov6AllowlistResult {
  if (nonce !== undefined && nonce !== NOV6_2026_APPROVE_NONCE) {
    return { ok: false, reason: "Nonce does not match the Nov 6 single-post approval" };
  }
  if (dateYmd !== NOV6_2026_APPROVAL_DATE) {
    return {
      ok: false,
      reason: `This one-time approval is tied to ${NOV6_2026_APPROVAL_DATE} (America/Chicago), not ${dateYmd}`,
    };
  }
  const unique = [...new Set(ids.map(Number))];
  if (unique.length !== 1 || !Number.isInteger(unique[0])) {
    return {
      ok: false,
      reason: "Approve exactly one post per request so approving one never approves another",
    };
  }
  const id = unique[0];
  if ((NOV6_2026_HELD_FOR_REVIEW_IDS as readonly number[]).includes(id)) {
    return {
      ok: false,
      reason: `Post ${id} is held pending a new review; the Nov 6 availability check did not clear it`,
    };
  }
  if (!isNov6ReadyPostId(id)) {
    return {
      ok: false,
      reason: `This one-time path accepts only a single ready ID: ${NOV6_2026_READY_POST_IDS.join(", ")}`,
    };
  }
  return { ok: true, reason: "ok" };
}
