/**
 * Zernio Publisher — PostEngine
 * Sends approved posts to Zernio API for publishing on Instagram, Facebook, and Google Business.
 * Called when a post status changes to "scheduled" or on a polling loop for due posts.
 */

import { storage } from "./storage";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { resolveBin } from "./local-bin";
import { saveHostedMedia } from "./media-store";

const ZERNIO_BASE = "https://zernio.com/api/v1";

function ffmpegBin(): string {
  return resolveBin("FFMPEG_PATH", "/opt/homebrew/bin/ffmpeg", "ffmpeg");
}

function ffprobeBin(): string {
  return resolveBin("FFPROBE_PATH", "/opt/homebrew/bin/ffprobe", "ffprobe");
}

function getZernioKey(): string {
  if (process.env.ZERNIO_API_KEY) return process.env.ZERNIO_API_KEY;
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
    const match = envFile.match(/ZERNIO_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "";
}

/**
 * Check image dimensions via ffprobe. Returns { width, height } or null.
 */
function getImageDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const out = execSync(
      `"${ffprobeBin()}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`,
      { encoding: "utf-8", timeout: 15000 }
    ).trim();
    const [w, h] = out.split(",").map(Number);
    if (!w || !h) return null;
    return { width: w, height: h };
  } catch (e) {
    console.error("[Zernio] ffprobe error:", e);
    return null;
  }
}

/**
 * Crop image to Instagram-safe 4:5 ratio (0.8) using center crop.
 * Returns path to cropped file, or null on failure.
 */
function cropFor45(inputPath: string, outputPath: string): boolean {
  try {
    const dims = getImageDimensions(inputPath);
    if (!dims) return false;
    const { width, height } = dims;

    // Determine crop filter
    // Target ratio: 4:5 = 0.8 (width/height = 0.8, so height = width * 1.25)
    let cropFilter: string;
    const targetHeight = Math.floor(width * 1.25);
    if (targetHeight <= height) {
      // Image is taller than 4:5 — crop height to width*1.25, center vertically
      const cropH = targetHeight;
      const cropY = Math.floor((height - cropH) / 2);
      cropFilter = `crop=${width}:${cropH}:0:${cropY}`;
    } else {
      // Image is wider than 4:5 — crop width to height*0.8, center horizontally
      const cropW = Math.floor(height * 0.8);
      const cropX = Math.floor((width - cropW) / 2);
      cropFilter = `crop=${cropW}:${height}:${cropX}:0`;
    }

    execSync(
      `"${ffmpegBin()}" -y -i "${inputPath}" -vf "${cropFilter}" "${outputPath}"`,
      { encoding: "utf-8", timeout: 60000 }
    );
    return fs.existsSync(outputPath);
  } catch (e) {
    console.error("[Zernio] ffmpeg crop error:", e);
    return false;
  }
}

/**
 * Given an image URL, check if it needs cropping for Instagram (ratio 0.75–1.91).
 * If so, download, crop to 4:5, upload cropped version, return new URL.
 * If within range, return original URL.
 */
async function ensureInstagramSafeImage(imageUrl: string): Promise<string> {
  const tmpInput = path.join("/tmp", `pe-ig-input-${Date.now()}.jpg`);
  const basename = path.basename(imageUrl.split("?")[0]).replace(/\.[^.]+$/, "");
  const croppedFilename = `${basename}-ig-crop.jpg`;
  const tmpOutput = path.join("/tmp", `pe-ig-crop-${Date.now()}.jpg`);

  try {
    // Download image
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.warn(`[Zernio] Could not download image for dimension check: ${imageUrl}`);
      return imageUrl;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpInput, buf);

    // Check dimensions
    const dims = getImageDimensions(tmpInput);
    if (!dims) {
      console.warn(`[Zernio] Could not read dimensions for ${imageUrl}`);
      return imageUrl;
    }

    const ratio = dims.width / dims.height;
    const IG_MIN = 0.75;
    const IG_MAX = 1.91;

    if (ratio >= IG_MIN && ratio <= IG_MAX) {
      // Already safe
      return imageUrl;
    }

    console.log(`[Zernio] Auto-cropping image for Instagram: ${croppedFilename} (ratio ${ratio.toFixed(3)} outside ${IG_MIN}–${IG_MAX})`);

    // Crop
    const cropped = cropFor45(tmpInput, tmpOutput);
    if (!cropped) {
      console.warn(`[Zernio] Crop failed, using original`);
      return imageUrl;
    }

    let newUrl: string;
    try {
      newUrl = saveHostedMedia(tmpOutput, croppedFilename);
    } catch (e) {
      console.warn("[Zernio] Could not store cropped image:", e instanceof Error ? e.message : "unknown");
      return imageUrl;
    }

    return newUrl;
  } catch (e: any) {
    console.error("[Zernio] ensureInstagramSafeImage error:", e.message);
    return imageUrl;
  } finally {
    try { fs.unlinkSync(tmpInput); } catch {}
    try { fs.unlinkSync(tmpOutput); } catch {}
  }
}

// Load account mapping from config
function getAccountMap(): Record<string, Record<string, string>> {
  try {
    const accountsPath = process.env.ZERNIO_ACCOUNTS_PATH?.trim()
      || path.join(process.cwd(), ".zernio-accounts.json");
    const raw = fs.readFileSync(accountsPath, "utf-8");
    const config = JSON.parse(raw);
    return config.accounts || {};
  } catch {
    return {};
  }
}

// Map dealership ID to account key
function getDealershipKey(dealershipId: number): string {
  const map: Record<number, string> = {
    1: "bmw_jackson",
    2: "brian_harris_bmw",
    3: "audi_baton_rouge",
    4: "harris_porsche",
    5: "opencraw",
    6: "cooperative_agency",
  };
  return map[dealershipId] || "";
}

interface ZernioPostPayload {
  accountId: string;
  platform: string; // instagram, facebook, googlebusiness
  content: string;
  mediaUrls?: string[];
  scheduledAt?: string; // ISO string — if omitted, posts immediately
}

async function zernioPost(payload: ZernioPostPayload): Promise<{ success: boolean; postId?: string; error?: string }> {
  const apiKey = getZernioKey();
  if (!apiKey) return { success: false, error: "No Zernio API key" };

  try {
    const body: any = {
      content: payload.content,
      platforms: [{ accountId: payload.accountId, platform: payload.platform }],
    };

    if (payload.mediaUrls && payload.mediaUrls.length > 0) {
      body.mediaItems = payload.mediaUrls.map(url => ({ url, type: "image" }));
    }

    // Always schedule at least 2 minutes ahead so Zernio has time to process
    const scheduleTime = payload.scheduledAt
      ? new Date(payload.scheduledAt)
      : new Date(Date.now() + 2 * 60 * 1000);

    // If scheduled time is in the past, push to 2 min from now
    const now = new Date();
    const finalSchedule = scheduleTime < now
      ? new Date(now.getTime() + 2 * 60 * 1000)
      : scheduleTime;

    body.scheduledFor = finalSchedule.toISOString();

    const res = await fetch(`${ZERNIO_BASE}/posts`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json() as any;

    if (res.ok && data.post?._id) {
      const postId = data.post._id;
      const status = data.post.status;
      return { success: true, postId };
    } else {
      return { success: false, error: JSON.stringify(data) };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Publish a single post to all its platforms via Zernio.
 */
export async function publishPost(postId: number): Promise<{ success: boolean; results: Record<string, any> }> {
  const post = storage.getPost(postId);
  if (!post) return { success: false, results: { error: "Post not found" } };

  const accountMap = getAccountMap();
  const dealershipKey = getDealershipKey(post.dealershipId);
  const accounts = accountMap[dealershipKey];

  if (!accounts) {
    console.error(`[Zernio] No account mapping for dealership ${post.dealershipId}`);
    return { success: false, results: { error: "No account mapping found" } };
  }

  const platforms = JSON.parse(post.platforms || '["instagram","facebook","googlebusiness"]') as string[];
  const mediaUrls = post.mediaUrls ? JSON.parse(post.mediaUrls) : [];
  const results: Record<string, any> = {};
  let allSuccess = true;

  for (const platform of platforms) {
    const accountId = accounts[platform];
    if (!accountId) {
      console.warn(`[Zernio] No account ID for ${platform} on ${dealershipKey}`);
      results[platform] = { skipped: true, reason: "No account ID" };
      continue;
    }

    // Instagram requires media — skip if no images
    if (platform === "instagram" && mediaUrls.length === 0) {
      console.warn(`[Zernio] Skipping Instagram — no media attached`);
      results[platform] = { skipped: true, reason: "Instagram requires media" };
      continue;
    }

    // Use platform-specific caption
    let caption = post.caption || "";
    if (platform === "googlebusiness" && (post as any).captionGmb) {
      caption = (post as any).captionGmb;
    } else if (platform === "facebook" && (post as any).captionFacebook) {
      caption = (post as any).captionFacebook;
    }

    console.log(`[Zernio] Publishing to ${platform} (${accountId})...`);

    // Auto-crop images for Instagram if aspect ratio is outside allowed range
    let finalMediaUrls = mediaUrls.length > 0 ? [...mediaUrls] : [];
    if (platform === "instagram" && finalMediaUrls.length > 0) {
      finalMediaUrls = await Promise.all(finalMediaUrls.map(url => ensureInstagramSafeImage(url)));
    }

    const result = await zernioPost({
      accountId,
      platform,
      content: caption,
      mediaUrls: finalMediaUrls.length > 0 ? finalMediaUrls : undefined,
      scheduledAt: post.scheduledFor || undefined,
    });

    results[platform] = result;
    if (!result.success) {
      allSuccess = false;
      console.error(`[Zernio] Failed ${platform}:`, result.error);
    } else {
      console.log(`[Zernio] ✅ ${platform} published (${result.postId})`);
    }
  }

  // Update post status — EARLY RETURN to avoid duplicate block below
  if (allSuccess) {
    storage.updatePost(postId, {
      status: "published",
      publishedAt: new Date().toISOString(),
    });
    storage.logActivity({
      postId,
      dealershipId: post.dealershipId,
      action: "published",
      details: `Published to ${platforms.join(", ")} via Zernio`,
    });
  }

  return { success: allSuccess, results };
}

/**
 * Polling loop — checks for posts due to publish and fires them.
 * Runs every minute.
 */
export function startPublishPoller() {
  console.log("[Zernio] Publisher poller started — checking every 60 seconds");

  setInterval(async () => {
    const now = new Date();
    const allPosts = storage.getPosts({ status: "scheduled" });

    const duePosts = allPosts.filter(p => {
      if (!p.scheduledFor) return false;
      return new Date(p.scheduledFor) <= now;
    });

    if (duePosts.length === 0) return;

    console.log(`[Zernio] ${duePosts.length} post(s) due for publishing...`);

    for (const post of duePosts) {
      console.log(`[Zernio] Publishing post ${post.id}: ${post.vehicleInfo}`);
      const result = await publishPost(post.id);
      console.log(`[Zernio] Post ${post.id} result:`, result.success ? "✅ Published" : "❌ Failed");
    }
  }, 60 * 1000); // every 60 seconds
}
