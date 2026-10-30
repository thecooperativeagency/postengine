/**
 * Media Host — PostEngine
 * Downloads images from Google Drive and stores them on the app volume
 * so Zernio can fetch a public URL from this service.
 */

import fs from "fs";
import path from "path";
import { downloadDriveFile } from "./drive-api";
import { githubMediaUploadEnabled, saveHostedMedia } from "./media-store";

export async function hostImage(fileId: string, filename: string): Promise<string | null> {
  const safeName = filename
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/--+/g, "-")
    .toLowerCase();
  const tmpPath = path.join("/tmp", `pe-media-${fileId}-${safeName}`);

  console.log("[MediaHost] Downloading file from Drive...");
  try {
    const downloaded = await downloadDriveFile(fileId, tmpPath);
    if (!downloaded) return null;
    if (githubMediaUploadEnabled()) {
      console.error("[MediaHost] GITHUB_MEDIA_UPLOAD=1; GitHub upload stays off. Using the volume URL.");
    }
    return saveHostedMedia(tmpPath, safeName);
  } catch (e) {
    console.error("[MediaHost] Failed to host Drive file:", e instanceof Error ? e.message : "unknown");
    return null;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* temp file may not exist */ }
  }
}
