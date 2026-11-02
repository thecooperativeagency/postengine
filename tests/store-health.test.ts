import test from "node:test";
import assert from "node:assert/strict";
import { countStatus, daysBehind, driveArrivals, summarizeStore, type CoveragePost } from "../shared/store-health";

const NOW = new Date(2026, 10, 2, 15, 0, 0);

function post(partial: Partial<CoveragePost> & Pick<CoveragePost, "dealershipId" | "status">): CoveragePost {
  return partial;
}

test("days behind is zero when a post is scheduled today or later", () => {
  assert.equal(
    daysBehind([
      post({ dealershipId: 1, status: "published", publishedAt: "2026-10-28T15:00:00" }),
      post({ dealershipId: 1, status: "scheduled", scheduledFor: "2026-11-02T10:00:00" }),
    ], NOW),
    0,
  );
  assert.equal(
    daysBehind([post({ dealershipId: 1, status: "scheduled", scheduledFor: "2026-11-06T10:00:00" })], NOW),
    0,
  );
});

test("days behind counts whole days since the last coverage", () => {
  assert.equal(
    daysBehind([post({ dealershipId: 1, status: "published", publishedAt: "2026-10-29T18:00:00" })], NOW),
    4,
  );
});

test("queued and draft posts do not count as coverage", () => {
  assert.equal(
    daysBehind([
      post({ dealershipId: 1, status: "queued", scheduledFor: "2026-11-02T10:00:00" }),
      post({ dealershipId: 1, status: "draft", publishedAt: "2026-11-02T10:00:00" }),
    ], NOW),
    null,
  );
});

test("drive arrivals keep recent imports and drop folder ids", () => {
  const rows = driveArrivals([
    post({ id: 1, dealershipId: 2, status: "queued", createdAt: "2026-11-01T12:00:00", folderSource: "secret-folder/file", vehicleInfo: "Red coupe", postType: "New Cars" }),
    post({ id: 2, dealershipId: 2, status: "queued", createdAt: "2026-10-01T12:00:00", vehicleInfo: "Typed by hand", postType: "promo" }),
    post({ id: 3, dealershipId: 3, status: "draft", createdAt: "2026-11-02T08:00:00", folderSource: "other-folder/file", vehicleInfo: "Service bay", postType: "Service" }),
  ]);
  assert.deepEqual(rows.map((row) => row.id), [3, 1]);
  assert.equal("folderSource" in rows[0], false);
  assert.equal(rows[1].vehicleInfo, "Red coupe");
  assert.equal(summarizeStore([
    post({ dealershipId: 2, status: "queued", folderSource: "sample", createdAt: "2026-11-02T08:00:00" }),
    post({ dealershipId: 2, status: "published", publishedAt: "2026-10-29T18:00:00" }),
  ], NOW).queuedCount, 1);
  assert.equal(summarizeStore([
    post({ dealershipId: 2, status: "published", publishedAt: "2026-10-29T18:00:00" }),
  ], NOW).daysBehind, 4);
  assert.equal(countStatus([
    post({ dealershipId: 1, status: "queued" }),
    post({ dealershipId: 1, status: "queued" }),
    post({ dealershipId: 1, status: "scheduled" }),
  ], "queued"), 2);
});
