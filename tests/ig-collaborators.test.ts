import { test } from "node:test";
import * as assert from "node:assert/strict";

import { buildZernioPostBody, collectDroppedCollaborators } from "../server/zernio-payload";
import { IgFieldError, normalizeIgFieldsForStorage, parseIgCollaborators, parseIgUserTags } from "../shared/ig-mentions";

const now = new Date("2026-11-17T12:00:00.000Z");

test("IG reel payload includes collaborators and userTags and omits contentType", () => {
  const body = buildZernioPostBody({
    content: "Reel caption",
    accountId: "acct_example",
    platform: "instagram",
    mediaUrls: ["https://cdn.example.com/reel.mp4"],
    mediaType: "video",
    scheduledAt: "2026-11-17T18:00:00.000Z",
    now,
    igCollaborators: JSON.stringify(["example_user"]),
    igUserTags: JSON.stringify([{ username: "example_user" }]),
  });

  assert.deepEqual(body, {
    content: "Reel caption",
    platforms: [
      {
        accountId: "acct_example",
        platform: "instagram",
        platformSpecificData: {
          shareToFeed: true,
          collaborators: ["example_user"],
          userTags: [{ username: "example_user" }],
        },
      },
    ],
    mediaItems: [{ url: "https://cdn.example.com/reel.mp4", type: "video" }],
    scheduledFor: "2026-11-17T18:00:00.000Z",
  });
  const specific = (body.platforms as Array<{ platformSpecificData: Record<string, unknown> }>)[0].platformSpecificData;
  assert.equal("contentType" in specific, false);
});

test("IG image payload omits collaborator and user tag keys when unset", () => {
  const body = buildZernioPostBody({
    content: "Still caption",
    accountId: "acct_example",
    platform: "instagram",
    mediaUrls: ["https://cdn.example.com/photo.jpg"],
    mediaType: "image",
    scheduledAt: "2026-11-17T18:00:00.000Z",
    now,
    igCollaborators: [],
    igUserTags: null,
  });

  assert.deepEqual(body.platforms, [
    { accountId: "acct_example", platform: "instagram" },
  ]);
});

test("IG image payload includes collaborators and username-only tags without Reel fields", () => {
  const body = buildZernioPostBody({
    content: "Still caption",
    accountId: "acct_example",
    platform: "instagram",
    mediaUrls: ["https://cdn.example.com/photo.jpg"],
    mediaType: "image",
    scheduledAt: "2026-11-17T18:00:00.000Z",
    now,
    igCollaborators: ["example_user"],
    igUserTags: [{ username: "example_user", x: 0.5, y: 0.5 }],
  });
  assert.deepEqual(body.platforms, [
    {
      accountId: "acct_example",
      platform: "instagram",
      platformSpecificData: {
        collaborators: ["example_user"],
        userTags: [{ username: "example_user" }],
      },
    },
  ]);
});

test("Facebook payload never receives Instagram collaborators or user tags", () => {
  const body = buildZernioPostBody({
    content: "Facebook caption",
    accountId: "acct_example",
    platform: "facebook",
    mediaUrls: ["https://cdn.example.com/reel.mp4"],
    mediaType: "video",
    scheduledAt: "2026-11-17T18:00:00.000Z",
    now,
    igCollaborators: ["example_user"],
    igUserTags: [{ username: "example_user" }],
  });

  assert.deepEqual(body.platforms, [
    { accountId: "acct_example", platform: "facebook" },
  ]);
});

test("collaborators normalize @, case, and whitespace and reject a fourth username", () => {
  assert.deepEqual(parseIgCollaborators([" @Example_User ", "example_user"]), ["example_user"]);

  const body: Record<string, unknown> = {
    igCollaborators: "@example_user, SECOND.user",
    igUserTags: [{ username: "@Tagged_User" }],
  };
  normalizeIgFieldsForStorage(body);
  assert.equal(body.igCollaborators, JSON.stringify(["example_user", "second.user"]));
  assert.equal(body.igUserTags, JSON.stringify([{ username: "tagged_user" }]));

  assert.throws(
    () => parseIgCollaborators(["one", "two", "three", "four"]),
    (error: unknown) => error instanceof IgFieldError && error.message === "Instagram allows at most 3 collaborators",
  );
  assert.throws(
    () => parseIgUserTags(["not a user"]),
    (error: unknown) => error instanceof IgFieldError && /Invalid Instagram username/.test(error.message),
  );
});

test("collectDroppedCollaborators reads the Instagram entry and ignores an empty response", () => {
  assert.equal(collectDroppedCollaborators({ post: { _id: "abc", platforms: [{ platform: "facebook" }] } }), null);
  assert.deepEqual(
    collectDroppedCollaborators({
      post: {
        platforms: [
          {
            platform: "instagram",
            status: "published",
            platformSpecificData: {
              collaborators: ["example_user"],
              droppedCollaborators: [{ username: "example_user", reason: "Text of Instagram's error" }],
            },
          },
        ],
      },
    }),
    [{ username: "example_user", reason: "Text of Instagram's error" }],
  );
});
