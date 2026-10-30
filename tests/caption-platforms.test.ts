import { test } from "node:test";
import * as assert from "node:assert/strict";
import { normalizeCaptionPlatforms } from "../server/caption-writer";

test("normalizeCaptionPlatforms dedupes and maps gmb aliases", () => {
  assert.deepEqual(
    normalizeCaptionPlatforms(["instagram", "gmb", "facebook", "instagram", "Google Business", "tiktok"]),
    ["instagram", "googlebusiness", "facebook", "tiktok"],
  );
  assert.deepEqual(normalizeCaptionPlatforms(["snapchat", ""]), []);
});
