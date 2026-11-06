import { test } from "node:test";
import * as assert from "node:assert/strict";
import { classifyMediaType, inferPostMediaType } from "../server/media-upload";

test("classifyMediaType recognizes images and videos", () => {
  assert.equal(classifyMediaType("car.jpg", "image/jpeg"), "image");
  assert.equal(classifyMediaType("clip.MP4", "video/mp4"), "video");
  assert.equal(classifyMediaType("mystery.bin"), "unknown");
});

test("inferPostMediaType maps single/multi media shapes", () => {
  assert.equal(inferPostMediaType(["image"]), "image");
  assert.equal(inferPostMediaType(["video"]), "video");
  assert.equal(inferPostMediaType(["image", "image"]), "carousel");
  assert.equal(inferPostMediaType(["image", "video"]), "carousel");
});
