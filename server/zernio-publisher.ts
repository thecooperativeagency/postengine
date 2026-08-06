/**
 * Zernio Publisher — PostEngine
 * Sends approved posts to Zernio API for publishing on Instagram, Facebook, and Google Business.
 * Called when a post status changes to "scheduled" or on a polling loop for due posts.
 */

import { storage } from "./storage";
import { composePostContent } from "./post-composer";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { cleanupNormalizedImage, normalizeImageForSocial } from "./image-normalizer";
import { hostPublicMediaFile } from "./public-media";
import { withPublishLock } from "./publish-lock";
import { findRecentVehicleDuplicate } from "./post-dedup";
import {
  formatMusicNote,
  isMusicAutoBedEnabled,
  parseMusicIdFromNotes,
  prepareReelWithMusic,
} from "./music";

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
 * Normalize portrait images taller than 4:5 before Instagram publishing.
 * Leaves horizontal, square, and already-compliant portrait assets alone.
 */
export async function ensureInstagramSafeImage(imageUrl: string): Promise<string> {
  const tmpInput = path.join("/tmp", `pe-ig-input-${Date.now()}.jpg`);
  const basename = path.basename(imageUrl.split("?")[0]).replace(/\.[^.]+$/, "");
  let normalizedPath = tmpInput;
  let hostedUrl: string | undefined;

  try {
    const res = await fetch(imageUrl);
    if (!res.ok) {
      console.warn(`[Zernio] Could not download image for dimension check: ${imageUrl}`);
      return imageUrl;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmpInput, buf);

    const normalized = await normalizeImageForSocial(tmpInput);
    normalizedPath = normalized.path;

    const sourcePath = normalized.wasNormalized ? normalized.path : tmpInput;
    const outputFilename = normalized.wasNormalized
      ? `${basename}-ig-4x5${path.extname(normalized.filename) || ".jpg"}`
      : path.basename(normalized.filename);

    if (normalized.wasNormalized) {
      console.log(
        `[Zernio] Auto-cropping image for Instagram: ${outputFilename} (${normalized.originalWidth}x${normalized.originalHeight} → ${normalized.finalWidth}x${normalized.finalHeight})`
      );
    }

    const githubUrl = await uploadCroppedToGithub(sourcePath, outputFilename);
    if (githubUrl) {
      hostedUrl = githubUrl;
    } else {
      hostedUrl = await hostPublicMediaFile(sourcePath, outputFilename);
      console.log(`[Zernio] Hosted Instagram image locally: ${hostedUrl}`);
    }

    if (!hostedUrl) {
      throw new Error("Failed to host Instagram image");
    }

    return hostedUrl;
  } catch (e: any) {
    console.error("[Zernio] ensureInstagramSafeImage error:", e.message);
    return imageUrl;
  } finally {
    cleanupNormalizedImage(normalizedPath, tmpInput);
    try { fs.unlinkSync(tmpInput); } catch {}
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
  mediaType?: string;
  scheduledAt?: string; // ISO string — if omitted, posts immediately
}

async function zernioPost(payload: ZernioPostPayload): Promise<{ success: boolean; postId?: string; error?: string; rawError?: any }> {
  const apiKey = getZernioKey();
  if (!apiKey) return { success: false, error: "No Zernio API key" };

  try {
    const urls = payload.mediaUrls || [];
    const isSingleVideo = payload.mediaType === "video" && urls.length <= 1;

    const body: any = {
      content: payload.content,
      platforms: [
        payload.platform === "instagram" && isSingleVideo
          ? {
              accountId: payload.accountId,
              platform: payload.platform,
              platformSpecificData: {
                contentType: "reels",
                shareToFeed: true,
              },
            }
          : { accountId: payload.accountId, platform: payload.platform },
      ],
    };

    if (urls.length > 0) {
      body.mediaItems = urls.map((url) => ({
        url,
        type: /\.(mp4|mov|m4v|webm)(\?|$)/i.test(url) ? "video" : "image",
      }));
      // Single pure-video posts with no extension in the URL still force video type
      if (isSingleVideo && body.mediaItems.length === 1 && body.mediaItems[0].type !== "video") {
        body.mediaItems[0].type = "video";
      }
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
      return { success: false, error: JSON.stringify(data), rawError: data };
    }
  } catch (e: any) {
    return { success: false, error: e.message, rawError: e };
  }
}

function parsePublishResults(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isDuplicateContentError(result: any): boolean {
  const haystack = [
    typeof result?.error === "string" ? result.error : "",
    typeof result?.rawError?.error === "string" ? result.rawError.error : "",
  ].join(" ").toLowerCase();

  return haystack.includes("exact content is already scheduled")
    || haystack.includes("within the last 24 hours")
    || haystack.includes("already scheduled, publishing, or was posted");
}

function computeBackoffMinutes(attempts: number): number {
  if (attempts <= 1) return 15;
  if (attempts === 2) return 60;
  if (attempts === 3) return 6 * 60;
  return 24 * 60;
}

/**
 * Publish a single post to all its platforms via Zernio.
 */
export async function publishPost(postId: number): Promise<{ success: boolean; results: Record<string, any> }> {
  const locked = await withPublishLock(postId, () => publishPostUnlocked(postId));
  if (!locked.acquired || !locked.result) {
    return {
      success: false,
      results: {
        skipped: true,
        reason: "Publish already in progress",
      },
    };
  }

  return locked.result;
}

async function publishPostUnlocked(postId: number): Promise<{ success: boolean; results: Record<string, any> }> {
  const post = storage.getPost(postId);
  if (!post) return { success: false, results: { error: "Post not found" } };

  const duplicate = findRecentVehicleDuplicate(post, storage.getPosts({ dealershipId: post.dealershipId }));
  if (duplicate) {
    const blockedAt = new Date().toISOString();
    const reason = `Blocked duplicate vehicle publish; matched recent post ${duplicate.id}: ${duplicate.vehicleInfo || "Unknown vehicle"}`;
    storage.updatePost(postId, {
      status: "rejected",
      lastPublishAttemptAt: blockedAt,
      publishResults: JSON.stringify({ duplicateVehicle: { blocked: true, duplicatePostId: duplicate.id, blockedAt, reason } }),
      notes: `${post.notes || ""}${post.notes ? "\n" : ""}[duplicate blocked ${blockedAt}] ${reason}`,
    } as any);
    storage.logActivity({
      postId,
      dealershipId: post.dealershipId,
      action: "rejected",
      details: reason,
    });
    return { success: false, results: { duplicateVehicle: { blocked: true, duplicatePostId: duplicate.id, reason } } };
  }

  const accountMap = getAccountMap();
  const dealershipKey = getDealershipKey(post.dealershipId);
  const accounts = accountMap[dealershipKey];
  const dealership = storage.getDealership(post.dealershipId);

  if (!accounts) {
    console.error(`[Zernio] No account mapping for dealership ${post.dealershipId}`);
    return { success: false, results: { error: "No account mapping found" } };
  }

  const platforms = JSON.parse(post.platforms || '["instagram","facebook","googlebusiness"]') as string[];
  let mediaUrls = post.mediaUrls ? JSON.parse(post.mediaUrls) : [];
  const mediaType = (post.mediaType || "image") as string;
  const priorResults = parsePublishResults((post as any).publishResults);
  const results: Record<string, any> = { ...priorResults };
  const attempts = ((post as any).publishAttempts || 0) + 1;
  const attemptAt = new Date().toISOString();
  let allSuccess = true;
  let anyNewSuccess = false;

  // Auto bed music under single-video reels (provider-agnostic module; Epidemic today).
  // Fail-open: if music fails, publish original video.
  // Skip when already finished by reel pipeline or prior bed.
  const notesLower = String(post.notes || "").toLowerCase();
  const alreadyFinishedReel =
    notesLower.includes("[reel-finished]") ||
    notesLower.includes("[music]") ||
    Boolean(priorResults.music?.trackId) ||
    String(post.postType || "").toLowerCase() === "reels";

  if (
    mediaType === "video" &&
    mediaUrls.length === 1 &&
    isMusicAutoBedEnabled() &&
    !alreadyFinishedReel &&
    !parseMusicIdFromNotes(post.notes)
  ) {
    try {
      const recentMusicIds = storage
        .getPosts({ dealershipId: post.dealershipId })
        .map((p) => parseMusicIdFromNotes(p.notes))
        .filter((id): id is string => Boolean(id))
        .slice(0, 40);

      const prepared = await prepareReelWithMusic({
        videoUrl: mediaUrls[0],
        context: {
          tenantId: null,
          dealershipId: post.dealershipId,
          brand: dealership?.brand || null,
          postType: post.postType || null,
          vehicleInfo: post.vehicleInfo || null,
          excludeTrackIds: recentMusicIds,
        },
      });

      if (prepared?.publicVideoUrl) {
        mediaUrls = [prepared.publicVideoUrl];
        results.music = {
          provider: prepared.selection.provider,
          trackId: prepared.selection.id,
          title: prepared.selection.title,
          bpm: prepared.selection.bpm,
          score: prepared.selection.score,
          reason: prepared.selection.reason,
          publicVideoUrl: prepared.publicVideoUrl,
          appliedAt: attemptAt,
        };
        storage.updatePost(postId, {
          mediaUrls: JSON.stringify(mediaUrls),
          notes: `${post.notes || ""}${post.notes ? "\n" : ""}${formatMusicNote(prepared.selection)}`,
          publishResults: JSON.stringify(results),
        } as any);
        console.log(
          `[Zernio] 🎵 Bed music: ${prepared.selection.title} (${prepared.selection.id}) → ${prepared.publicVideoUrl}`,
        );
      }
    } catch (musicErr: any) {
      console.error("[Zernio] Music bed failed (publishing original video):", musicErr?.message || musicErr);
      results.music = {
        error: musicErr?.message || String(musicErr),
        failedAt: attemptAt,
      };
    }
  }

  for (const platform of platforms) {
    const prior = priorResults[platform];
    if (prior?.success) {
      results[platform] = prior;
      continue;
    }

    const accountId = accounts[platform];
    if (!accountId) {
      console.warn(`[Zernio] No account ID for ${platform} on ${dealershipKey}`);
      results[platform] = { skipped: true, reason: "No account ID", skippedAt: attemptAt };
      continue;
    }

    if (platform === "instagram" && mediaUrls.length === 0) {
      console.warn(`[Zernio] Skipping Instagram — no media attached`);
      results[platform] = { skipped: true, reason: "Instagram requires media", skippedAt: attemptAt };
      continue;
    }

    const composed = composePostContent(post, dealership);

    let caption = composed.instagram;
    if (platform === "googlebusiness") {
      caption = composed.googlebusiness;
    } else if (platform === "facebook") {
      caption = composed.facebook;
    }

    console.log(`[Zernio] Publishing to ${platform} (${accountId})...`);

    let finalMediaUrls = mediaUrls.length > 0 ? [...mediaUrls] : [];
    if (platform === "instagram" && mediaType !== "video" && finalMediaUrls.length > 0) {
      finalMediaUrls = await Promise.all(finalMediaUrls.map(url => ensureInstagramSafeImage(url)));
    }

    const result = await zernioPost({
      accountId,
      platform,
      content: caption,
      mediaUrls: finalMediaUrls.length > 0 ? finalMediaUrls : undefined,
      mediaType,
      scheduledAt: post.scheduledFor || undefined,
    });

    if (result.success) {
      anyNewSuccess = true;
      results[platform] = {
        success: true,
        postId: result.postId,
        publishedAt: attemptAt,
      };
      console.log(`[Zernio] ✅ ${platform} published (${result.postId})`);
    } else {
      allSuccess = false;
      const duplicate = isDuplicateContentError(result);
      results[platform] = {
        success: false,
        duplicate,
        error: result.error,
        rawError: result.rawError,
        failedAt: attemptAt,
      };
      console.error(`[Zernio] Failed ${platform}:`, result.error);
    }
  }

  const platformStates = platforms.map((platform) => results[platform]);
  const unresolved = platformStates.filter((state) => state && !state.success && !state.skipped);
  const allResolved = platformStates.every((state) => !state || state.success || state.skipped || state.duplicate);
  const duplicateOnlyFailure = unresolved.length > 0 && unresolved.every((state) => state.duplicate);

  if (allSuccess || allResolved || duplicateOnlyFailure) {
    storage.updatePost(postId, {
      status: "published",
      publishedAt: new Date().toISOString(),
      publishAttempts: attempts,
      lastPublishAttemptAt: attemptAt,
      publishBackoffUntil: null,
      publishResults: JSON.stringify(results),
    } as any);
    storage.logActivity({
      postId,
      dealershipId: post.dealershipId,
      action: "published",
      details: `Published to ${platforms.join(", ")} via Zernio${duplicateOnlyFailure ? " (duplicate-protected reconciliation)" : ""}`,
    });
    return { success: true, results };
  }

  const backoffMinutes = computeBackoffMinutes(attempts);
  const backoffUntil = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
  storage.updatePost(postId, {
    publishAttempts: attempts,
    lastPublishAttemptAt: attemptAt,
    publishBackoffUntil: backoffUntil,
    publishResults: JSON.stringify(results),
    notes: `${post.notes || ""}${post.notes ? "\n" : ""}[publish retry scheduled ${attemptAt}] backoff until ${backoffUntil}`,
  } as any);

  if (anyNewSuccess) {
    storage.logActivity({
      postId,
      dealershipId: post.dealershipId,
      action: "partial_publish",
      details: `Partial publish succeeded; retrying remaining platforms after backoff until ${backoffUntil}`,
    });
  }

  return { success: false, results };
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
      if (new Date(p.scheduledFor) > now) return false;
      const backoffUntil = (p as any).publishBackoffUntil;
      if (backoffUntil) {
        const backoffDate = new Date(backoffUntil);
        if (!Number.isNaN(backoffDate.getTime()) && backoffDate > now) {
          return false;
        }
      }
      return true;
    });

    if (duePosts.length === 0) return;

    console.log(`[Zernio] ${duePosts.length} post(s) due for publishing...`);

    for (const post of duePosts) {
      try {
        console.log(`[Zernio] Publishing post ${post.id}: ${post.vehicleInfo}`);
        const result = await publishPost(post.id);
        console.log(`[Zernio] Post ${post.id} result:`, result.success ? "✅ Published" : "❌ Failed");
      } catch (error) {
        console.error(`[Zernio] Post ${post.id} crashed during publish reconciliation:`, error);
      }
    }
  }, 60 * 1000); // every 60 seconds
}
