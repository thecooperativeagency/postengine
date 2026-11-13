import { test } from "node:test";
import * as assert from "node:assert/strict";

import { findRecentVehicleDuplicate } from "../server/post-dedup";

test("findRecentVehicleDuplicate matches the same dealership and normalized vehicle info inside the cooldown window", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 247,
      dealershipId: 2,
      vehicleInfo: "2026 BMW   M4 Competition",
      status: "scheduled",
      scheduledFor: "2026-07-01T15:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-06-26T23:01:32.371Z",
    },
    [
      {
        id: 216,
        dealershipId: 2,
        vehicleInfo: "2026 bmw m4 competition",
        status: "published",
        scheduledFor: "2026-06-17T15:00:00.000Z",
        publishedAt: "2026-06-29T22:25:14.532Z",
        createdAt: "2026-06-10T20:15:40.072Z",
      },
    ],
  );

  assert.equal(duplicate?.id, 216);
});

test("findRecentVehicleDuplicate ignores posts outside the cooldown window", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 300,
      dealershipId: 2,
      vehicleInfo: "2026 bmw m4 competition",
      status: "queued",
      scheduledFor: null,
      publishedAt: null,
      createdAt: "2026-08-20T15:00:00.000Z",
    },
    [
      {
        id: 216,
        dealershipId: 2,
        vehicleInfo: "2026 bmw m4 competition",
        status: "published",
        scheduledFor: "2026-06-17T15:00:00.000Z",
        publishedAt: "2026-06-29T22:25:14.532Z",
        createdAt: "2026-06-10T20:15:40.072Z",
      },
    ],
  );

  assert.equal(duplicate, null);
});

test("findRecentVehicleDuplicate ignores other dealerships and non-active statuses", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 247,
      dealershipId: 2,
      vehicleInfo: "2026 bmw m4 competition",
      status: "scheduled",
      scheduledFor: "2026-07-01T15:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-06-26T23:01:32.371Z",
    },
    [
      {
        id: 1,
        dealershipId: 3,
        vehicleInfo: "2026 bmw m4 competition",
        status: "published",
        scheduledFor: "2026-06-29T15:00:00.000Z",
        publishedAt: "2026-06-29T22:25:14.532Z",
        createdAt: "2026-06-10T20:15:40.072Z",
      },
      {
        id: 2,
        dealershipId: 2,
        vehicleInfo: "2026 bmw m4 competition",
        status: "rejected",
        scheduledFor: "2026-06-29T15:00:00.000Z",
        publishedAt: null,
        createdAt: "2026-06-10T20:15:40.072Z",
      },
    ],
  );

  assert.equal(duplicate, null);
});


test("findRecentVehicleDuplicate does not collapse distinct non-photo vehicle names that only differ by a numeric trim token", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 700,
      dealershipId: 2,
      vehicleInfo: "Audi A4 Trim 2",
      status: "queued",
      scheduledFor: "2026-07-01T15:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-06-26T23:01:32.371Z",
    },
    [
      {
        id: 701,
        dealershipId: 2,
        vehicleInfo: "Audi A4 Trim 3",
        status: "published",
        scheduledFor: "2026-06-29T15:00:00.000Z",
        publishedAt: "2026-06-29T22:25:14.532Z",
        createdAt: "2026-06-10T20:15:40.072Z",
      },
    ],
  );

  assert.equal(duplicate, null);
});

test("findRecentVehicleDuplicate does not treat later reel cuts of the same car as duplicates", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 445,
      dealershipId: 3,
      vehicleInfo: "A6",
      status: "scheduled",
      postType: "Reels",
      folderSource: "reels-ready/abr-a6-va",
      scheduledFor: "2026-10-08T16:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-10-06T13:36:53.420Z",
    },
    [
      {
        id: 449,
        dealershipId: 3,
        vehicleInfo: "A6",
        status: "scheduled",
        postType: "Reels",
        folderSource: "reels-ready/abr-a6-vb",
        scheduledFor: "2026-10-28T16:00:00.000Z",
        publishedAt: null,
        createdAt: "2026-10-06T13:36:54.463Z",
      },
    ],
  );

  assert.equal(duplicate, null);
});

test("publish mode ignores future scheduled posts of the same vehicle", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 445,
      dealershipId: 3,
      vehicleInfo: "A6",
      status: "scheduled",
      postType: "Reels",
      folderSource: "reels-ready/abr-a6-va",
      scheduledFor: "2026-10-08T16:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-10-06T13:36:53.420Z",
    },
    [
      {
        id: 449,
        dealershipId: 3,
        vehicleInfo: "A6",
        status: "scheduled",
        postType: "Reels",
        folderSource: "reels-ready/abr-a6-vb",
        scheduledFor: "2026-10-28T16:00:00.000Z",
        publishedAt: null,
        createdAt: "2026-10-06T13:36:54.463Z",
      },
    ],
    "2026-10-08T16:00:19.207Z",
    "publish",
  );

  assert.equal(duplicate, null);
});

test("publish mode still blocks a still that already went live in the cooldown window", () => {
  const duplicate = findRecentVehicleDuplicate(
    {
      id: 500,
      dealershipId: 2,
      vehicleInfo: "2026 BMW X5",
      status: "scheduled",
      postType: "New Cars",
      scheduledFor: "2026-10-08T15:00:00.000Z",
      publishedAt: null,
      createdAt: "2026-10-01T15:00:00.000Z",
    },
    [
      {
        id: 499,
        dealershipId: 2,
        vehicleInfo: "2026 BMW X5",
        status: "published",
        postType: "New Cars",
        scheduledFor: "2026-10-06T15:00:00.000Z",
        publishedAt: "2026-10-06T15:00:40.000Z",
        createdAt: "2026-09-30T15:00:00.000Z",
      },
    ],
    "2026-10-08T15:00:00.000Z",
    "publish",
  );

  assert.equal(duplicate?.id, 499);
});
