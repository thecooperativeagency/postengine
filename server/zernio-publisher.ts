/**
 * Zernio Publisher — PostEngine
 * Sends approved posts to Zernio API for publishing on Instagram, Facebook, and Google Business.
 * Called when a post status changes to "scheduled" or on a polling loop for due posts.
 */

import { storage } from "./storage";
import fs from "fs";
import path from "path";

const ZERNIO_BASE = "https://zernio.com/api/v1";

function getZernioKey(): string {
  if (process.env.ZERNIO_API_KEY) return process.env.ZERNIO_API_KEY;
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
    const match = envFile.match(/ZERNIO_API_KEY=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "";
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

    const result = await zernioPost({
      accountId,
      platform,
      content: caption,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
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

  // Update post status
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
