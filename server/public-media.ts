import fs from "node:fs";
import { mkdir, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const PUBLIC_MEDIA_ROUTE_PREFIX = "/media/generated";
const DEFAULT_PUBLIC_BASE_URL = "https://postengine.thecoopbrla.com";

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function sanitizeFilename(filename: string) {
  return filename
    .replace(/[^a-zA-Z0-9._/-]/g, "-")
    .replace(/\//g, "-")
    .replace(/--+/g, "-")
    .toLowerCase();
}

export function resolvePublicMediaBaseUrl() {
  const configured = process.env.POSTENGINE_PUBLIC_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim();
  return trimTrailingSlashes(configured || DEFAULT_PUBLIC_BASE_URL);
}

export function getPublicMediaDir() {
  const configured = process.env.POSTENGINE_PUBLIC_MEDIA_DIR?.trim() || process.env.MEDIA_GENERATED_DIR?.trim();
  if (configured) return path.resolve(configured);
  if (process.env.RAILWAY_VOLUME_MOUNT_PATH) {
    return path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "media", "generated");
  }
  if (process.env.NODE_ENV === "production") return "/data/media/generated";
  return path.join(homedir(), ".postengine", "public-media");
}

export async function hostPublicMediaFile(sourcePath: string, filename: string) {
  const publicDir = getPublicMediaDir();
  await mkdir(publicDir, { recursive: true });

  const safeName = sanitizeFilename(path.basename(filename) || "asset.jpg");
  const targetFilename = `${randomBytes(6).toString("hex")}-${safeName}`;
  const targetPath = path.join(publicDir, targetFilename);

  await copyFile(sourcePath, targetPath);

  return `${resolvePublicMediaBaseUrl()}${PUBLIC_MEDIA_ROUTE_PREFIX}/${targetFilename}`;
}

export function publicMediaFileExists(filename: string) {
  return fs.existsSync(path.join(getPublicMediaDir(), filename));
}
