import { test } from "node:test";
import * as assert from "node:assert/strict";

import { archivePostSourceOrThrow, bulkApprovePosts, filterPostsForApi } from "../server/routes";
import { createQueuedDrivePost, getOpenCadenceDates, getOpenReplacementSlots, selectDiverseFiles } from "../server/drive-scanner";
import { storage, DuplicateFolderSourceError } from "../server/storage";

test("archivePostSourceOrThrow blocks scheduled transitions when archive returns false", () => {
  assert.throws(
    () => archivePostSourceOrThrow(
      { id: 12, dealershipId: 3, status: "queued", folderSource: "folder/file" },
      "scheduled",
      () => false,
    ),
    /Drive archive move failed/,
  );
});

test("bulkApprovePosts returns successful and failed items without scheduling archive failures", () => {
  const posts = new Map<number, { id: number; dealershipId: number; status: string; folderSource: string | null; postType: string; vehicleInfo: string | null }>([
    [1, { id: 1, dealershipId: 10, status: "queued", folderSource: "folder/success", postType: "inventory", vehicleInfo: "Car A" }],
    [2, { id: 2, dealershipId: 10, status: "queued", folderSource: "folder/fail", postType: "inventory", vehicleInfo: "Car B" }],
  ]);
  const updates: number[] = [];
  const logged: number[] = [];

  const result = bulkApprovePosts([1, 2, 999], {
    getPost: (id) => posts.get(id),
    updatePost: (id) => {
      const post = posts.get(id);
      if (!post) return undefined;
      post.status = "scheduled";
      updates.push(id);
      return post;
    },
    logScheduled: (post) => {
      logged.push(post.id);
    },
    archive: (_dealershipId, folderSource) => folderSource !== "folder/fail",
  });

  assert.deepEqual(result.successful.map((post) => post.id), [1]);
  assert.deepEqual(result.failed, [
    { id: 2, error: "Drive archive move failed for post 2 (folder/fail): Drive archive move returned false", folderSource: "folder/fail" },
    { id: 999, error: "Post not found" },
  ]);
  assert.deepEqual(updates, [1]);
  assert.deepEqual(logged, [1]);
  assert.equal(posts.get(1)?.status, "scheduled");
  assert.equal(posts.get(2)?.status, "queued");
});

test("bulkApprovePosts blocks duplicate recent vehicle posts from being scheduled", () => {
  const posts = new Map<number, { id: number; dealershipId: number; status: string; folderSource: string | null; postType: string; vehicleInfo: string | null }>([
    [1, { id: 1, dealershipId: 10, status: "queued", folderSource: "folder/dup", postType: "inventory", vehicleInfo: "2026 BMW M4 Competition" }],
  ]);

  const result = bulkApprovePosts([1], {
    getPost: (id) => posts.get(id),
    updatePost: (id) => posts.get(id),
    logScheduled: () => {
      throw new Error("should not schedule duplicate vehicle");
    },
    archive: () => true,
    findDuplicate: () => ({ id: 999, vehicleInfo: "2026 bmw m4 competition", publishedAt: "2026-06-29T22:25:14.532Z" }),
  });

  assert.deepEqual(result.successful, []);
  assert.deepEqual(result.failed, [
    { id: 1, error: "Recent duplicate vehicle already active on post 999: 2026 bmw m4 competition", folderSource: "folder/dup" },
  ]);
});

test("createQueuedDrivePost skips duplicate folder source errors without aborting", (t) => {
  const mock = t.mock.method(storage, "createPost", () => {
    throw new DuplicateFolderSourceError("folder/file");
  });

  assert.equal(
    createQueuedDrivePost(
      {
        dealershipId: 1,
        status: "queued",
        postType: "inventory",
        vehicleInfo: "Test Vehicle",
        caption: "Caption",
        captionFacebook: "Caption",
        captionGmb: "Caption",
        hashtags: null,
        ctaBlock: null,
        mediaUrls: "[]",
        mediaType: "image",
        platforms: "[\"instagram\"]",
        scheduledFor: null,
        publishedAt: null,
        folderSource: "folder/file",
        notes: null,
      },
      {
        dealershipName: "Test Dealer",
        postType: "New Cars",
        folderSource: "folder/file",
      },
    ),
    false,
  );

  assert.equal(mock.mock.callCount(), 1);
});

test("selectDiverseFiles keeps only one file per shoot cluster", () => {
  const selected = selectDiverseFiles(
    [
      {
        id: "1",
        classification: {
          modelKey: "911",
          lookBucket: "exterior",
          shotType: "exterior",
          shootCluster: "911 carrera s porsche showroom",
        },
      },
      {
        id: "2",
        classification: {
          modelKey: "911",
          lookBucket: "exterior",
          shotType: "exterior",
          shootCluster: "911 carrera s porsche showroom",
        },
      },
      {
        id: "3",
        classification: {
          modelKey: "911",
          lookBucket: "lifestyle",
          shotType: "lifestyle",
          shootCluster: "porsche design watches porschelifestyle",
        },
      },
    ],
    3,
  );

  const clusterCounts = selected.reduce<Record<string, number>>((counts, file) => {
    const key = file.classification?.shootCluster || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  assert.equal(selected.length, 2);
  assert.equal(clusterCounts["911 carrera s porsche showroom"], 1);
  assert.equal(clusterCounts["porsche design watches porschelifestyle"], 1);
});

test("createQueuedDrivePost skips recently duplicated vehicles before creating a new queue item", (t) => {
  const recentPublishedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const getPostsMock = t.mock.method(storage, "getPosts", () => ([
    {
      id: 216,
      dealershipId: 1,
      status: "published",
      postType: "inventory",
      vehicleInfo: "2026 bmw m4 competition",
      scheduledFor: recentPublishedAt,
      publishedAt: recentPublishedAt,
      createdAt: recentPublishedAt,
    },
  ] as any));
  const createPostMock = t.mock.method(storage, "createPost", () => {
    throw new Error("should not create duplicate vehicle");
  });

  assert.equal(
    createQueuedDrivePost(
      {
        dealershipId: 1,
        status: "queued",
        postType: "inventory",
        vehicleInfo: "2026 BMW M4 Competition",
        caption: "Caption",
        captionFacebook: "Caption",
        captionGmb: "Caption",
        hashtags: null,
        ctaBlock: null,
        mediaUrls: "[]",
        mediaType: "image",
        platforms: "[\"instagram\"]",
        scheduledFor: null,
        publishedAt: null,
        folderSource: "folder/file-2",
        notes: null,
      },
      {
        dealershipName: "Test Dealer",
        postType: "New Cars",
        folderSource: "folder/file-2",
      },
    ),
    false,
  );

  assert.equal(getPostsMock.mock.callCount(), 1);
  assert.equal(createPostMock.mock.callCount(), 0);
});

test("getOpenReplacementSlots ignores rejected dates that already have an active scheduled post", () => {
  assert.deepEqual(
    getOpenReplacementSlots(
      [
        "2026-05-22T15:00:00.000Z",
        "2026-05-26T15:00:00.000Z",
      ],
      [
        "2026-05-22T15:00:00.000Z",
        "2026-05-26T15:00:00.000Z",
      ],
    ),
    [],
  );
});

test("getOpenReplacementSlots keeps only uncovered rejected slots and de-dupes them", () => {
  assert.deepEqual(
    getOpenReplacementSlots(
      ["2026-05-24T15:00:00.000Z"],
      [
        "2026-05-22T15:00:00.000Z",
        "2026-05-22T15:00:00.000Z",
        "2026-05-24T15:00:00.000Z",
        null,
      ],
    ),
    ["2026-05-22T15:00:00.000Z"],
  );
});

test("getOpenCadenceDates skips dealership dates that are already occupied by another active post", () => {
  assert.deepEqual(
    getOpenCadenceDates(
      ["2026-05-26T15:00:00.000Z"],
      ["2026-05-26T15:00:00.000Z"],
    ),
    [],
  );
});

test("getOpenCadenceDates preserves only unoccupied cadence dates", () => {
  assert.deepEqual(
    getOpenCadenceDates(
      [
        "2026-05-21T15:00:00.000Z",
        "2026-05-26T15:00:00.000Z",
      ],
      ["2026-05-26T15:00:00.000Z"],
    ),
    ["2026-05-21T15:00:00.000Z"],
  );
});

test("filterPostsForApi hides rejected posts by default from the working list", () => {
  const visible = filterPostsForApi(
    [
      { id: 1, status: "queued" },
      { id: 2, status: "published" },
      { id: 3, status: "rejected" },
    ],
    {},
  );

  assert.deepEqual(visible.map((post) => post.id), [1, 2]);
});

test("filterPostsForApi keeps rejected posts when explicitly requested", () => {
  const visible = filterPostsForApi(
    [
      { id: 1, status: "queued" },
      { id: 2, status: "rejected" },
    ],
    { includeRejected: true },
  );

  assert.deepEqual(visible.map((post) => post.id), [1, 2]);
});

test("filterPostsForApi keeps explicit status views intact", () => {
  const visible = filterPostsForApi(
    [
      { id: 2, status: "rejected" },
    ],
    { status: "rejected" },
  );

  assert.deepEqual(visible.map((post) => post.id), [2]);
});
