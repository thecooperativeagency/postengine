/**
 * Public media files live on the same disk as SQLite (the Railway volume)
 * and are served at /media/generated/, which is the path already stored on
 * live posts (https://postengine.thecoopbrla.com/media/generated/...).
 * GitHub upload is off unless GITHUB_MEDIA_UPLOAD=1, and even then a failed
 * upload does not change the URL. The volume file is the one Zernio fetches.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

export function mediaDir(): string {
  if (process.env.MEDIA_DIR?.trim()) return path.resolve(process.env.MEDIA_DIR.trim());
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "media");
  }
  if (process.env.SQLITE_PATH?.trim()) {
    return path.join(path.dirname(path.resolve(process.env.SQLITE_PATH.trim())), "media");
  }
  return path.join(process.cwd(), "data", "media");
}

/** Live files from ~/.postengine/public-media land here. */
export function generatedMediaDir(): string {
  if (process.env.MEDIA_GENERATED_DIR?.trim()) {
    return path.resolve(process.env.MEDIA_GENERATED_DIR.trim());
  }
  return path.join(mediaDir(), "generated");
}

export function githubMediaUploadEnabled(): boolean {
  return process.env.GITHUB_MEDIA_UPLOAD?.trim() === "1";
}

export function publicAppUrl(): string {
  return (process.env.PUBLIC_APP_URL || "http://localhost:3456").replace(/\/$/, "");
}

export function publicMediaUrl(filename: string): string {
  return `${publicAppUrl()}/media/generated/${encodeURIComponent(filename)}`;
}

export function saveHostedMedia(localPath: string, filename: string): string {
  const dir = generatedMediaDir();
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(filename)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/--+/g, "-")
    .toLowerCase() || "asset.jpg";
  const stored = `${crypto.randomBytes(6).toString("hex")}-${safe}`;
  fs.copyFileSync(localPath, path.join(dir, stored));
  return publicMediaUrl(stored);
}

export function isGithubHostedUrl(url: string): boolean {
  return /raw\.githubusercontent\.com|github\.com\/.*\/raw\//i.test(url);
}
