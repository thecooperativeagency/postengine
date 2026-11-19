import { afterEach, test } from "node:test";
import * as assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import sharp from "sharp";

import { withPublishLock, resetPublishLocks } from "../server/publish-lock";
import { getPublicMediaDir, hostPublicMediaFile, resolvePublicMediaBaseUrl } from "../server/public-media";
import { ensureInstagramSafeImage } from "../server/zernio-publisher";

afterEach(() => {
  resetPublishLocks();
  delete process.env.POSTENGINE_PUBLIC_BASE_URL;
  delete process.env.POSTENGINE_PUBLIC_MEDIA_DIR;
});

test("withPublishLock blocks overlapping work for the same post id", async () => {
  let releaseFirst!: () => void;
  const first = withPublishLock(247, async () => {
    await new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    return "first-finished";
  });

  const second = await withPublishLock(247, async () => "second-should-not-run");

  assert.deepEqual(second, {
    acquired: false,
    result: null,
  });

  releaseFirst();

  assert.deepEqual(await first, {
    acquired: true,
    result: "first-finished",
  });
});

test("withPublishLock releases the lock after an error", async () => {
  await assert.rejects(
    () => withPublishLock(247, async () => {
      throw new Error("boom");
    }),
    /boom/,
  );

  const retry = await withPublishLock(247, async () => "recovered");
  assert.deepEqual(retry, {
    acquired: true,
    result: "recovered",
  });
});

test("resolvePublicMediaBaseUrl prefers explicit env and trims trailing slash", () => {
  process.env.POSTENGINE_PUBLIC_BASE_URL = "https://preview.example.com///";
  assert.equal(resolvePublicMediaBaseUrl(), "https://preview.example.com");
});

test("ensureInstagramSafeImage rehosts even when the image does not need a crop", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "postengine-ig-safe-"));
  process.env.POSTENGINE_PUBLIC_MEDIA_DIR = path.join(tempRoot, "public-media");
  process.env.POSTENGINE_PUBLIC_BASE_URL = "https://preview.example.com";
  delete process.env.GITHUB_TOKEN;

  const sourcePath = path.join(tempRoot, "source.jpg");
  await sharp({
    create: {
      width: 640,
      height: 640,
      channels: 3,
      background: { r: 32, g: 64, b: 96 },
    },
  }).jpeg().toFile(sourcePath);

  const imageBytes = fs.readFileSync(sourcePath);
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {
      "content-type": "image/jpeg",
      "content-length": imageBytes.length,
    });
    res.end(imageBytes);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server failed to bind");

  const imageUrl = `http://127.0.0.1:${address.port}/source.jpg`;
  const hostedUrl = await ensureInstagramSafeImage(imageUrl);

  server.close();

  assert.match(hostedUrl, /^https:\/\/preview\.example\.com\/media\/generated\/[a-f0-9]{12}-pe-ig-input-\d+\.jpg$/);
  const publicDir = getPublicMediaDir();
  const files = fs.readdirSync(publicDir);
  assert.equal(files.length, 1);
  assert.equal(Buffer.compare(fs.readFileSync(path.join(publicDir, files[0])), imageBytes), 0);
});


test("hostPublicMediaFile copies the file into the public media directory and returns a public url", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "postengine-public-media-"));
  process.env.POSTENGINE_PUBLIC_MEDIA_DIR = path.join(tempRoot, "public-media");
  process.env.POSTENGINE_PUBLIC_BASE_URL = "https://preview.example.com";

  const sourcePath = path.join(tempRoot, "source.jpg");
  fs.writeFileSync(sourcePath, "fake-image-data");

  const hostedUrl = await hostPublicMediaFile(sourcePath, "folder/Needs Cleaning!!.jpg");
  const publicDir = getPublicMediaDir();
  const files = fs.readdirSync(publicDir);

  assert.equal(hostedUrl, `https://preview.example.com/media/generated/${files[0]}`);
  assert.equal(files.length, 1);
  assert.match(files[0], /^[a-f0-9]{12}-needs-cleaning-.jpg$/);
  assert.equal(fs.readFileSync(path.join(publicDir, files[0]), "utf8"), "fake-image-data");
});
