/**
 * Zernio Publisher — PostEngine
 * Sends approved posts to Zernio API for publishing on Instagram, Facebook, and Google Business.
 * Called when a post status changes to "scheduled" or on a polling loop for due posts.
 */

import { storage } from "./storage";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const ZERNIO_BASE = "https://zernio.com/api/v1";
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";
const GITHUB_REPO = "thecooperativeagency/postengine";
const MEDIA_BRANCH = "main";
const MEDIA_FOLDER = "media";

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
      `${FFPROBE} -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`,
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
      `${FFMPEG} -y -i "${inputPath}" -vf "${cropFilter}" "${outputPath}"`,
      { encoding: "utf-8", timeout: 60000 }
    );
    return fs.existsSync(outputPath);
  } catch (e) {
    console.error("[Zernio] ffmpeg crop error:", e);
    return false;
  }
}

/**
 * Upload a local file to GitHub and return its raw URL.
 */
async function uploadCroppedToGithub(localPath: string, filename: string): Promise<string | null> {
  let token = "";
  if (process.env.GITHUB_TOKEN) {
    token = process.env.GITHUB_TOKEN;
  } else {
    try {
      const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
      const match = envFile.match(/GITHUB_TOKEN=(.+)/);
      if (match) token = match[1].trim();
    } catch {}
  }
  if (!token) {
    console.error("[Zernio] No GitHub token for upload");
    return null;
  }

  try {
    const content = fs.readFileSync(localPath);
    const base64Content = content.toString("base64");
    const githubPath = `${MEDIA_FOLDER}/${filename}`;

    // Check if already exists
    let sha: string | undefined;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
    );
    if (checkRes.ok) {
      const existing = await checkRes.json() as any;
      sha = existing.sha;
    }

    const body: any = { message: `Add IG-cropped media: ${filename}`, content: base64Content, branch: MEDIA_BRANCH };
    if (sha) body.sha = sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (uploadRes.ok) {
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${MEDIA_BRANCH}/${githubPath}`;
      console.log(`[Zernio] ✅ Uploaded cropped image ${filename} → ${rawUrl}`);
      return rawUrl;
    } else {
      const err = await uploadRes.json() as any;
      console.error("[Zernio] GitHub upload failed:", err.message);
      return null;
    }
  } catch (e: any) {
    console.error("[Zernio] Upload error:", e.message);
    return null;
  }
}

/**
 * Given a GitHub raw image URL, check if it needs cropping for Instagram (ratio 0.75–1.91).
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

    // Upload to GitHub
    const newUrl = await uploadCroppedToGithub(tmpOutput, croppedFilename);
    if (!newUrl) {
      console.warn(`[Zernio] Upload failed, using original`);
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
    const raw = fs.readFileSync(path.join(process.cwd(), ".zernio-accounts.json"), "utf-8");
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
