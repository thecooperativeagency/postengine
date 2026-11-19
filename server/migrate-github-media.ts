/**
 * One-time copy of GitHub-hosted post images onto the local media volume.
 * Queued, draft, and scheduled posts are rewritten. Published posts are left
 * alone because Zernio already fetched those URLs.
 */

import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { isGithubHostedUrl, saveHostedMedia } from "./media-store";

const MIGRATE_STATUSES = new Set(["queued", "draft", "scheduled"]);

async function downloadToTemp(url: string, dest: string): Promise<boolean> {
  const headers: Record<string, string> = {};
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) return false;
  fs.writeFileSync(dest, buf);
  return true;
}

export async function migrateGithubMedia(): Promise<{
  examined: number;
  updated: number;
  failed: number;
}> {
  let examined = 0;
  let updated = 0;
  let failed = 0;
  const posts = storage.getPosts().filter((post) => MIGRATE_STATUSES.has(post.status));

  for (const post of posts) {
    if (!post.mediaUrls) continue;
    let urls: string[] = [];
    try {
      const parsed = JSON.parse(post.mediaUrls);
      if (!Array.isArray(parsed)) continue;
      urls = parsed.filter((url) => typeof url === "string");
    } catch {
      continue;
    }
    if (!urls.some(isGithubHostedUrl)) continue;
    examined++;

    const next: string[] = [];
    let postFailed = false;
    for (const url of urls) {
      if (!isGithubHostedUrl(url)) {
        next.push(url);
        continue;
      }
      const tmp = path.join("/tmp", `pe-migrate-${post.id}-${cryptoRandom()}`);
      try {
        const ok = await downloadToTemp(url, tmp);
        if (!ok) {
          postFailed = true;
          next.push(url);
          continue;
        }
        const name = path.basename(url.split("?")[0]) || "asset.jpg";
        next.push(saveHostedMedia(tmp, name));
      } catch {
        postFailed = true;
        next.push(url);
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* temp file may not exist */ }
      }
    }

    if (postFailed) failed++;
    if (next.some((url, i) => url !== urls[i])) {
      storage.updatePost(post.id, { mediaUrls: JSON.stringify(next) });
      updated++;
    }
  }

  return { examined, updated, failed };
}

function cryptoRandom(): string {
  return Math.random().toString(16).slice(2);
}
