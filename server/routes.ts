import type { Express } from "express";
import { spawn } from "child_process";
import fs from "fs";
import type { Server } from "http";
import path from "path";
import { storage } from "./storage";
import {
  insertPostSchema,
  insertDealershipSchema,
  insertEngineModuleSchema,
  insertAccountModuleSchema,
  insertEngineSourceSchema,
  insertOfferReviewSchema,
  insertEmailIterationSetupSchema,
  insertCadenceSchema,
  REEL_INVENTORY_FLOOR_WEEKS,
} from "@shared/schema";
import type { OfferReview } from "@shared/schema";
import { z } from "zod";
import { scanDriveFolders, archiveFile, loadFolders, listFolder, isVideoMedia } from "./drive-scanner";
import { generateCaption } from "./caption-writer";
import { publishPost } from "./zernio-publisher";
import { sendApprovalRequest, sendWeeklySummary } from "./telegram-notify";
import { composePostContent } from "./post-composer";
import { runBmwOfferDetection } from "./bmw-offers-detector";
import { runAudiOfferDetection } from "./audi-offers-detector";
import {
  buildContentEngineBuildPlan,
  getOfferReviewTransitionError,
  syncContentEngineBuildManifest,
} from "./content-engine-build-manifest";
import { buildEmailIterationOfferOptionsByDealership } from "./email-iteration-offers";
import {
  ENGINE_DASHBOARD_PASSWORD_ENV,
  isAuthorizedDashboardPassword,
  isDashboardProtectionEnabled,
  readDashboardPassword,
} from "./dashboard-auth";
import { findRecentVehicleDuplicate } from "./post-dedup";

const ARCHIVE_REQUIRED_STATUSES = new Set(["scheduled", "published"]);
const DEFAULT_HIDDEN_POST_STATUSES = new Set(["rejected"]);
const DRIVE_SCAN_STALE_MS = 30 * 60 * 1000;
const emailIterationSetupUpdateSchema = insertEmailIterationSetupSchema.partial().omit({
  dealershipId: true,
  campaignKey: true,
  campaignType: true,
});

function sweepStaleDriveScanJobs(now = Date.now()) {
  const staleBefore = new Date(now - DRIVE_SCAN_STALE_MS).toISOString();
  const runningJobs = storage.getRunningEngineJobsByType("drive-scan");
  const activeJobs = [] as typeof runningJobs;

  for (const job of runningJobs) {
    const startedAt = job.startedAt ? Date.parse(job.startedAt) : NaN;
    if (!Number.isFinite(startedAt) || startedAt >= now - DRIVE_SCAN_STALE_MS) {
      activeJobs.push(job);
      continue;
    }

    storage.updateEngineJob(job.id, {
      status: "failed",
      completedAt: new Date(now).toISOString(),
      summary: "Drive scan marked failed after exceeding the stale-job window",
      errorMessage: `Drive scan was still marked running after ${Math.floor(DRIVE_SCAN_STALE_MS / 60000)} minutes`,
    });
  }

  return activeJobs;
}

function resolveDriveScanRunner() {
  const tsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx");
  const scriptPath = path.join(process.cwd(), "server", "run-drive-scan-job.ts");

  if (!fs.existsSync(tsxPath)) {
    throw new Error(`Drive scan runner missing tsx binary at ${tsxPath}`);
  }

  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Drive scan runner script not found at ${scriptPath}`);
  }

  return { tsxPath, scriptPath };
}

function runDriveScanJob(scanJobId: number, weeks: number) {
  const { tsxPath, scriptPath } = resolveDriveScanRunner();
  const stdoutFd = fs.openSync("/tmp/postengine.log", "a");
  const stderrFd = fs.openSync("/tmp/postengine-error.log", "a");

  try {
    const child = spawn(tsxPath, [scriptPath, String(scanJobId), String(weeks)], {
      cwd: process.cwd(),
      detached: true,
      env: process.env,
      stdio: ["ignore", stdoutFd, stderrFd],
    });

    child.on("error", (error) => {
      storage.updateEngineJob(scanJobId, {
        status: "failed",
        completedAt: new Date().toISOString(),
        summary: "Drive scan failed to start",
        errorMessage: error.message,
      });
    });

    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
  }
}

function getDriveScanStatus() {
  const activeScans = sweepStaleDriveScanJobs();
  const currentScan = activeScans[0] ?? null;

  return {
    running: Boolean(currentScan),
    jobId: currentScan?.id ?? null,
    startedAt: currentScan?.startedAt ?? null,
  };
}

function parseStringArray(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value) as string[];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function parseNumberArray(value: string | null | undefined) {
  if (!value) return [] as number[];
  try {
    const parsed = JSON.parse(value) as number[];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "number" && Number.isFinite(entry)) : [];
  } catch {
    return [];
  }
}

type PostArchiveCandidate = {
  id: number;
  dealershipId: number;
  status: string;
  folderSource: string | null;
};

export function archivePostSourceOrThrow(
  existing: PostArchiveCandidate,
  nextStatus: string | undefined,
  archive: (dealershipId: number, folderSource: string) => boolean,
): void {
  if (!nextStatus || !ARCHIVE_REQUIRED_STATUSES.has(nextStatus)) return;
  if (existing.status === nextStatus) return;

  const folderSource = existing.folderSource?.trim();
  if (!folderSource) return;

  try {
    const archived = archive(existing.dealershipId, folderSource);
    if (!archived) {
      // Do not block Approve/Reject if Drive already moved the file or is flaky.
      console.warn(
        `[Archive] Drive archive returned false for post ${existing.id} (${folderSource}) — continuing status change`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Archive] Drive archive failed for post ${existing.id} (${folderSource}): ${message} — continuing status change`,
    );
  }
}

type BulkApproveDeps<TPost extends PostArchiveCandidate> = {
  getPost(id: number): TPost | undefined;
  updatePost(id: number, data: { status: "scheduled" }): TPost | undefined;
  logScheduled(post: TPost): void;
  archive(dealershipId: number, folderSource: string): boolean;
  findDuplicate?(post: TPost): { id: number; vehicleInfo: string | null } | null;
};

function buildRecentDuplicateVehicleError(duplicate: { id: number; vehicleInfo: string | null }) {
  return `Recent duplicate vehicle already active on post ${duplicate.id}: ${duplicate.vehicleInfo || "Unknown vehicle"}`;
}

function findRecentDuplicateForPost(post: { id: number; dealershipId: number; vehicleInfo: string | null; status: string; scheduledFor?: string | null; publishedAt?: string | null; createdAt?: string | null }) {
  const posts = storage.getPosts({ dealershipId: post.dealershipId });
  const duplicate = findRecentVehicleDuplicate(post, posts);
  if (!duplicate || duplicate.id == null) return null;
  return { id: duplicate.id, vehicleInfo: duplicate.vehicleInfo ?? null };
}

function assertNoRecentVehicleDuplicateOrThrow(post: { id: number; dealershipId: number; vehicleInfo: string | null; status: string; scheduledFor?: string | null; publishedAt?: string | null; createdAt?: string | null }) {
  const duplicate = findRecentDuplicateForPost(post);
  if (duplicate) {
    throw new Error(buildRecentDuplicateVehicleError(duplicate));
  }
}

export function bulkApprovePosts<TPost extends PostArchiveCandidate>(ids: number[], deps: BulkApproveDeps<TPost>) {
  const successful: TPost[] = [];
  const failed: Array<{ id: number; error: string; folderSource?: string }> = [];

  for (const rawId of ids) {
    const id = Number(rawId);
    const existing = deps.getPost(id);
    if (!existing) {
      failed.push({ id, error: "Post not found" });
      continue;
    }

    try {
      archivePostSourceOrThrow(existing, "scheduled", deps.archive);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ id, error: message, folderSource: existing.folderSource || undefined });
      continue;
    }

    const duplicate = deps.findDuplicate?.(existing);
    if (duplicate) {
      failed.push({ id, error: buildRecentDuplicateVehicleError(duplicate), folderSource: existing.folderSource || undefined });
      continue;
    }

    const updated = deps.updatePost(id, { status: "scheduled" });
    if (!updated) {
      failed.push({ id, error: "Failed to update post" });
      continue;
    }

    deps.logScheduled(updated);
    successful.push(updated);
  }

  return { successful, failed };
}

export function filterPostsForApi<T extends { status: string }>(
  postsList: T[],
  filters: { status?: string; includeRejected?: boolean },
): T[] {
  if (filters.status || filters.includeRejected) {
    return postsList;
  }

  return postsList.filter((post) => !DEFAULT_HIDDEN_POST_STATUSES.has(post.status));
}

export async function registerRoutes(server: Server, app: Express) {
  // ---- Dashboard auth ----
  app.get("/api/auth/config", (_req, res) => {
    res.json({
      enabled: isDashboardProtectionEnabled(),
      headerName: "X-Dashboard-Password",
      appName: "ENGINE",
    });
  });

  app.post("/api/auth/check", (req, res) => {
    if (!isDashboardProtectionEnabled()) {
      return res.json({ ok: true, enabled: false });
    }

    if (!isAuthorizedDashboardPassword(readDashboardPassword(req))) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
        message: `Valid ${ENGINE_DASHBOARD_PASSWORD_ENV} required`,
      });
    }

    return res.json({ ok: true, enabled: true });
  });

  // ---- Dealerships ----
  app.get("/api/dealerships", (_req, res) => {
    const dealerships = storage.getDealerships();
    res.json(dealerships);
  });

  app.get("/api/dealerships/:id", (req, res) => {
    const dealership = storage.getDealership(Number(req.params.id));
    if (!dealership) return res.status(404).json({ error: "Not found" });
    res.json(dealership);
  });

  app.post("/api/dealerships", (req, res) => {
    try {
      const data = insertDealershipSchema.parse(req.body);
      const dealership = storage.createDealership(data);
      res.status(201).json(dealership);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/dealerships/:id", (req, res) => {
    const updated = storage.updateDealership(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  });

  app.delete("/api/dealerships/:id", (req, res) => {
    const deleted = storage.deleteDealership(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  // ---- Posts ----
  app.get("/api/posts", (req, res) => {
    const filters: any = {};
    if (req.query.dealershipId) filters.dealershipId = Number(req.query.dealershipId);
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.postType) filters.postType = req.query.postType as string;
    const includeRejected = req.query.includeRejected === "true";
    const postsList = storage.getPosts(filters);
    res.json(filterPostsForApi(postsList, { status: filters.status, includeRejected }));
  });

  app.get("/api/posts/stats", (_req, res) => {
    const stats = storage.getPostStats();
    res.json(stats);
  });

  app.get("/api/posts/:id", (req, res) => {
    const post = storage.getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: "Not found" });
    res.json({ ...post, composedContent: composePostContent(post) });
  });

  app.post("/api/posts", (req, res) => {
    try {
      const data = insertPostSchema.parse(req.body);
      const post = storage.createPost(data);
      storage.logActivity({
        postId: post.id,
        dealershipId: post.dealershipId,
        action: "created",
        details: `Post created: ${post.vehicleInfo || post.postType}`,
      });
      res.status(201).json(post);
    } catch (err: any) {
      const status = err?.name === "DuplicateFolderSourceError" ? 409 : 400;
      res.status(status).json({ error: err.message });
    }
  });

  app.patch("/api/posts/:id", (req, res) => {
    const existing = storage.getPost(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

    try {
      archivePostSourceOrThrow(existing, req.body.status, archiveFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(409).json({ error: message });
    }

    const updated = storage.updatePost(Number(req.params.id), req.body);
    if (!updated) return res.status(500).json({ error: "Failed to update" });

    // Log status changes
    if (req.body.status && req.body.status !== existing.status) {
      storage.logActivity({
        postId: updated.id,
        dealershipId: updated.dealershipId,
        action: req.body.status,
        details: `Post ${req.body.status}: ${updated.vehicleInfo || updated.postType}`,
      });
    }

    res.json(updated);
  });

  app.post("/api/posts/:id/rewrite-caption", async (req, res) => {
    try {
      const postId = Number(req.params.id);
      const post = storage.getPost(postId);
      if (!post) return res.status(404).json({ error: "Not found" });

      const direction = typeof req.body?.direction === "string" ? req.body.direction.trim() : "";
      if (!direction) {
        return res.status(400).json({ error: "Direction / topic is required to rewrite the caption." });
      }
      if (direction.length > 1200) {
        return res.status(400).json({ error: "Direction is too long (max 1200 characters)." });
      }

      const dealership = storage.getDealership(post.dealershipId);
      if (!dealership) return res.status(404).json({ error: "Dealership not found" });

      const vehicleInfo = post.vehicleInfo || post.postType || "Featured vehicle";
      const base = {
        dealershipName: dealership.name,
        brand: dealership.brand,
        postType: post.postType,
        vehicleInfo,
        tone: "punchy" as const,
        captionSpec: (dealership as any).captionSpec,
        gmbSpec: (dealership as any).gmbSpec,
        rewriteDirection: direction,
      };

      const [captionIG, captionFB, captionGMB] = await Promise.all([
        generateCaption({
          ...base,
          platform: "instagram",
          currentCaption: post.caption,
        }),
        generateCaption({
          ...base,
          platform: "facebook",
          currentCaption: (post as any).captionFacebook || post.caption,
        }),
        generateCaption({
          ...base,
          platform: "googlebusiness",
          tone: "professional",
          currentCaption: (post as any).captionGmb || post.caption,
        }),
      ]);

      const updated = storage.updatePost(postId, {
        caption: captionIG,
        captionFacebook: captionFB,
        captionGmb: captionGMB,
        notes: [
          post.notes || "",
          `Caption rewrite: ${direction.slice(0, 240)}`,
        ].filter(Boolean).join(" | "),
      });

      if (!updated) return res.status(500).json({ error: "Failed to save rewritten captions" });

      storage.logActivity({
        postId: updated.id,
        dealershipId: updated.dealershipId,
        action: "edited",
        details: `Caption rewritten from review queue: ${direction.slice(0, 160)}`,
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Caption rewrite failed" });
    }
  });

  app.delete("/api/posts/:id", (req, res) => {
    const post = storage.getPost(Number(req.params.id));
    if (!post) return res.status(404).json({ error: "Not found" });
    storage.deletePost(Number(req.params.id));
    storage.logActivity({
      postId: post.id,
      dealershipId: post.dealershipId,
      action: "deleted",
      details: `Post deleted: ${post.vehicleInfo || post.postType}`,
    });
    res.status(204).send();
  });

  // Bulk approve
  app.post("/api/posts/bulk-approve", (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });

    const result = bulkApprovePosts(ids, {
      getPost: (id) => storage.getPost(id),
      updatePost: (id, data) => storage.updatePost(id, data),
      archive: archiveFile,
      findDuplicate: (post) => findRecentDuplicateForPost(post),
      logScheduled: (updated) => {
        storage.logActivity({
          postId: updated.id,
          dealershipId: updated.dealershipId,
          action: "scheduled",
          details: `Post approved & scheduled: ${updated.vehicleInfo || updated.postType}`,
        });
      },
    });

    res.status(result.failed.length > 0 ? 207 : 200).json({
      successful: result.successful,
      failed: result.failed,
    });
  });

  // ---- Activity ----
  // ── TELEGRAM ────────────────────────────────────────────
  // Telegram webhook — handles Approve/Reject button taps
  app.post("/api/telegram/webhook", async (req, res) => {
    const { callback_query } = req.body;
    if (!callback_query) return res.json({ ok: true });

    const data = callback_query.data || "";
    const chatId = callback_query.message?.chat?.id;
    const messageId = callback_query.message?.message_id;
    const token = process.env.TELEGRAM_BOT_TOKEN || "";

    if (data.startsWith("approve_")) {
      const postId = parseInt(data.replace("approve_", ""));
      const post = storage.getPost(postId);
      if (post) {
        try {
          archivePostSourceOrThrow(post, "scheduled", archiveFile);
          assertNoRecentVehicleDuplicateOrThrow(post);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `⚠️ Could not schedule *${post.vehicleInfo}*: ${message}`, parse_mode: "Markdown" }),
          });
          await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callback_query.id }),
          });
          return res.json({ ok: false, error: message });
        }

        storage.updatePost(postId, { status: "scheduled" });
        const result = await publishPost(postId);
        // Update Telegram message
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
        });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `✅ Approved & scheduled: *${post.vehicleInfo}*`, parse_mode: "Markdown" }),
        });
      }
    } else if (data.startsWith("reject_")) {
      const postId = parseInt(data.replace("reject_", ""));
      const post = storage.getPost(postId);
      if (post) {
        storage.updatePost(postId, { status: "rejected" });
        await fetch(`https://api.telegram.org/bot${token}/editMessageReplyMarkup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
        });
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: `❌ Rejected: *${post.vehicleInfo}*`, parse_mode: "Markdown" }),
        });
      }
    }

    // Answer callback to remove loading state
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callback_query.id }),
    });

    res.json({ ok: true });
  });

  // Send approval request for a specific post
  app.post("/api/posts/:id/notify", async (req, res) => {
    const post = storage.getPost(parseInt(req.params.id));
    if (!post) return res.status(404).json({ error: "Not found" });
    const dealerships = storage.getDealerships();
    const dealer = dealerships.find(d => d.id === post.dealershipId);
    const success = await sendApprovalRequest(post, dealer?.name || "Unknown");
    res.json({ success });
  });

  // Send weekly summary to Telegram
  app.post("/api/notify/weekly", async (req, res) => {
    const posts = storage.getPosts({ status: "queued" });
    const dealerships = storage.getDealerships();
    await sendWeeklySummary(posts, dealerships);
    res.json({ success: true, count: posts.length });
  });

  // ── ZERNIO PUBLISH ─────────────────────────────────────────
  // Manually publish a post immediately (for testing)
  app.post("/api/posts/:id/publish", async (req, res) => {
    const postId = parseInt(req.params.id);
    const post = storage.getPost(postId);
    if (!post) return res.status(404).json({ error: "Not found" });

    try {
      archivePostSourceOrThrow(post, "scheduled", archiveFile);
      assertNoRecentVehicleDuplicateOrThrow(post);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(409).json({ error: message });
    }

    // Set status to scheduled first
    storage.updatePost(postId, { status: "scheduled" });

    const result = await publishPost(postId);
    res.json(result);
  });

  // ── DRIVE SCANNER ───────────────────────────────────────────
  app.get("/api/drive/config", (_req, res) => {
    try {
      const config = loadFolders();
      const dealerships = storage.getDealerships();
      const items = Object.entries(config.dealerships)
        .map(([name, folderConfig]) => {
          const dealer = dealerships.find(d => d.id === folderConfig.id);
          return {
            id: folderConfig.id,
            name,
            brand: dealer?.brand ?? null,
            rootFolderId: folderConfig.root,
            folders: folderConfig.folders,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      res.json({
        account: config.account,
        parentFolderId: config.parentFolderId ?? null,
        parentFolderName: config.parentFolderName ?? null,
        dealerships: items,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/engine/status", (_req, res) => {
    const paused = storage.getAppSetting("imports_paused") === "true";
    const lastRunAt = storage.getAppSetting("last_scan_at") || null;
    const lastRunCount = storage.getAppSetting("last_scan_count") || null;
    const driveScan = getDriveScanStatus();
    res.json({ paused, lastRunAt, lastRunCount, driveScan });
  });

  app.get("/api/engine/reel-health", (_req, res) => {
    try {
      const config = loadFolders();
      const dealerships = storage.getDealerships();
      const cadence = storage.getCadenceSettings().filter((s) => s.isActive);
      const posts = storage.getPosts();
      const floorWeeks = REEL_INVENTORY_FLOOR_WEEKS;

      const rows = dealerships.map((dealer) => {
        const dealerCadence = cadence.filter((c) => c.dealershipId === dealer.id);
        const weeklyReelTarget = dealerCadence.reduce((sum, rule) => {
          if (!rule.reelsEnabled) return sum;
          return sum + Math.max(0, Number(rule.reelsPerWeek || 0));
        }, 0);
        const inventoryFloor = weeklyReelTarget * floorWeeks;
        const unconfiguredRules = dealerCadence.filter((rule) => !rule.reelsConfigured).length;

        const folderConfig = Object.values(config.dealerships).find((d) => d.id === dealer.id);
        let driveVideosAvailable = 0;
        if (folderConfig) {
          const usedSources = new Set(
            posts.filter((p) => p.dealershipId === dealer.id).map((p) => p.folderSource).filter(Boolean),
          );
          for (const [postType, folderId] of Object.entries(folderConfig.folders)) {
            if (postType.startsWith("_") || postType === "Customer Media") continue;
            try {
              const media = listFolder(folderId);
              driveVideosAvailable += media.filter(
                (file) => isVideoMedia(file) && !usedSources.has(`${folderId}/${file.id}`),
              ).length;
            } catch {
              // ignore folder list failures for health snapshot
            }
          }
        }

        const activeVideoPosts = posts.filter(
          (p) =>
            p.dealershipId === dealer.id &&
            p.mediaType === "video" &&
            ["draft", "queued", "scheduled"].includes(p.status),
        ).length;

        const available = driveVideosAvailable + activeVideoPosts;
        const shortfall = Math.max(0, inventoryFloor - available);

        return {
          dealershipId: dealer.id,
          dealershipName: dealer.name,
          weeklyReelTarget,
          inventoryFloorWeeks: floorWeeks,
          inventoryFloor,
          driveVideosAvailable,
          activeVideoPosts,
          available,
          shortfall,
          unconfiguredRules,
          healthy: unconfiguredRules === 0 && shortfall === 0,
        };
      });

      res.json({
        floorWeeks,
        totals: {
          weeklyReelTarget: rows.reduce((s, r) => s + r.weeklyReelTarget, 0),
          inventoryFloor: rows.reduce((s, r) => s + r.inventoryFloor, 0),
          available: rows.reduce((s, r) => s + r.available, 0),
          shortfall: rows.reduce((s, r) => s + r.shortfall, 0),
          unconfiguredRules: rows.reduce((s, r) => s + r.unconfiguredRules, 0),
        },
        dealerships: rows,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/engine/hub", (_req, res) => {
    const modules = storage.getEngineModules();
    const dealerships = storage.getDealerships();
    const accountModules = storage.getAccountModules();
    const jobs = storage.getEngineJobs(12);
    const sources = storage.getEngineSources();
    const offerReviewStats = storage.getOfferReviewStats();
    const offerReviews = storage.getOfferReviews({ limit: 8 });
    const paused = storage.getAppSetting("imports_paused") === "true";
    const lastRunAt = storage.getAppSetting("last_scan_at") || null;
    const lastRunCount = storage.getAppSetting("last_scan_count") || null;

    const accounts = dealerships.map((dealership) => ({
      id: dealership.id,
      name: dealership.name,
      brand: dealership.brand,
      modules: modules.map((module) => {
        const accountModule = accountModules.find(
          (item) => item.dealershipId === dealership.id && item.moduleKey === module.key,
        );

        return {
          moduleKey: module.key,
          isEnabled: accountModule?.isEnabled ?? false,
          settings: accountModule?.settings ?? "{}",
        };
      }),
    }));

    res.json({
      status: { paused, lastRunAt, lastRunCount },
      modules,
      accounts,
      jobs,
      sources,
      offerReviewStats,
      offerReviews,
    });
  });

  app.get("/api/engine/modules", (_req, res) => {
    res.json(storage.getEngineModules());
  });

  app.post("/api/engine/modules", (req, res) => {
    try {
      const data = insertEngineModuleSchema.parse(req.body);
      const module = storage.createEngineModule(data);
      res.status(201).json(module);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/engine/account-modules", (req, res) => {
    const dealershipId = req.query.dealershipId ? Number(req.query.dealershipId) : undefined;
    res.json(storage.getAccountModules(dealershipId));
  });

  app.post("/api/engine/account-modules", (req, res) => {
    try {
      const data = insertAccountModuleSchema.parse(req.body);
      const accountModule = storage.upsertAccountModule(data);
      res.json(accountModule);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/engine/jobs", (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 25;
    res.json(storage.getEngineJobs(limit));
  });

  app.get("/api/engine/sources", (_req, res) => {
    res.json(storage.getEngineSources());
  });

  app.post("/api/engine/sources", (req, res) => {
    try {
      const data = insertEngineSourceSchema.parse(req.body);
      const source = storage.createEngineSource(data);
      res.status(201).json(source);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get("/api/engine/offer-reviews", (req, res) => {
    const filters = {
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      moduleKey: typeof req.query.moduleKey === "string" ? req.query.moduleKey : undefined,
      sourceKey: typeof req.query.sourceKey === "string" ? req.query.sourceKey : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    res.json(storage.getOfferReviews(filters));
  });

  app.get("/api/engine/offer-reviews/stats", (_req, res) => {
    res.json(storage.getOfferReviewStats());
  });

  app.post("/api/engine/detect/bmw-offers", async (_req, res) => {
    const paused = storage.getAppSetting("imports_paused") === "true";
    if (paused) {
      return res.status(409).json({ error: "Imports are paused" });
    }

    const source = storage.getEngineSourceByKey("bmw-offers-api");
    if (!source) {
      return res.status(404).json({ error: "BMW offers source is not configured" });
    }

    const startedAt = new Date().toISOString();
    const detectionJob = storage.createEngineJob({
      moduleKey: source.moduleKey,
      jobType: "bmw-offers-detect",
      status: "running",
      dealershipId: null,
      startedAt,
      completedAt: null,
      summary: "BMW offer detection started",
      payload: JSON.stringify({ sourceKey: source.key, sourceUrl: source.sourceUrl }),
      errorMessage: null,
    });

    try {
      const result = await runBmwOfferDetection(storage, source, detectionJob.id);
      const completedAt = new Date().toISOString();
      const summary = `BMW detection found ${result.detectedCount} offers (${result.insertedCount} new, ${result.updatedCount} refreshed)`;

      storage.updateEngineSourceByKey(source.key, {
        lastCheckedAt: completedAt,
        lastResultSummary: summary,
        metadata: JSON.stringify({
          ...(source.metadata ? JSON.parse(source.metadata) : {}),
          lastDetectionAt: completedAt,
          detectedCount: result.detectedCount,
          insertedCount: result.insertedCount,
          updatedCount: result.updatedCount,
        }),
      });

      storage.updateEngineJob(detectionJob.id, {
        status: "completed",
        completedAt,
        summary,
        payload: JSON.stringify({
          sourceKey: source.key,
          detectedCount: result.detectedCount,
          insertedCount: result.insertedCount,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
        }),
      });

      res.json({ success: true, sourceKey: source.key, ...result, summary });
    } catch (error: any) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      storage.updateEngineSourceByKey(source.key, {
        lastCheckedAt: completedAt,
        lastResultSummary: `BMW detection failed: ${message}`,
      });
      storage.updateEngineJob(detectionJob.id, {
        status: "failed",
        completedAt,
        summary: "BMW offer detection failed",
        errorMessage: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/engine/detect/audi-offers", async (_req, res) => {
    const paused = storage.getAppSetting("imports_paused") === "true";
    if (paused) {
      return res.status(409).json({ error: "Imports are paused" });
    }

    const source = storage.getEngineSourceByKey("audi-offers-page");
    if (!source) {
      return res.status(404).json({ error: "Audi offers source is not configured" });
    }

    const startedAt = new Date().toISOString();
    const detectionJob = storage.createEngineJob({
      moduleKey: source.moduleKey,
      jobType: "audi-offers-detect",
      status: "running",
      dealershipId: null,
      startedAt,
      completedAt: null,
      summary: "Audi offer detection started",
      payload: JSON.stringify({ sourceKey: source.key, sourceUrl: source.sourceUrl }),
      errorMessage: null,
    });

    try {
      const result = await runAudiOfferDetection(storage, source, detectionJob.id);
      const completedAt = new Date().toISOString();
      const summary = `Audi detection found ${result.detectedCount} offers (${result.insertedCount} new, ${result.updatedCount} refreshed)`;

      storage.updateEngineSourceByKey(source.key, {
        status: "active",
        watcherType: "mirrored-page",
        accessStatus: "mirrored-text",
        evidenceNotes: "Direct Audi USA requests remain blocked in this environment, but the r.jina.ai mirrored text path is currently parseable and usable for first-pass ingestion.",
        lastCheckedAt: completedAt,
        lastResultSummary: summary,
        metadata: JSON.stringify({
          ...(source.metadata ? JSON.parse(source.metadata) : {}),
          lastDetectionAt: completedAt,
          mirroredSourceUrl: "https://r.jina.ai/http://https://www.audiusa.com/en/offers/",
          detectedCount: result.detectedCount,
          insertedCount: result.insertedCount,
          updatedCount: result.updatedCount,
        }),
      });

      storage.updateEngineJob(detectionJob.id, {
        status: "completed",
        completedAt,
        summary,
        payload: JSON.stringify({
          sourceKey: source.key,
          detectedCount: result.detectedCount,
          insertedCount: result.insertedCount,
          updatedCount: result.updatedCount,
          skippedCount: result.skippedCount,
        }),
      });

      res.json({ success: true, sourceKey: source.key, ...result, summary });
    } catch (error: any) {
      const completedAt = new Date().toISOString();
      const message = error instanceof Error ? error.message : String(error);
      storage.updateEngineSourceByKey(source.key, {
        lastCheckedAt: completedAt,
        lastResultSummary: `Audi detection failed: ${message}`,
      });
      storage.updateEngineJob(detectionJob.id, {
        status: "failed",
        completedAt,
        summary: "Audi offer detection failed",
        errorMessage: message,
      });
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/engine/offer-reviews", (req, res) => {
    try {
      const data = insertOfferReviewSchema.parse(req.body);
      const review = storage.createOfferReview(data);
      res.status(201).json(review);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  const allowedOfferReviewStatuses = new Set(["detected", "reviewing", "approved", "rejected", "published"]);

  app.post("/api/engine/offer-reviews/bulk-status", (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0) : [];
    const nextStatus = typeof req.body?.status === "string" ? req.body.status : "";
    const notes = typeof req.body?.notes === "string" ? req.body.notes : undefined;

    if (ids.length === 0) {
      return res.status(400).json({ error: "At least one offer review id is required" });
    }

    if (!allowedOfferReviewStatuses.has(nextStatus)) {
      return res.status(400).json({ error: "Invalid offer review status" });
    }

    const reviews = ids
      .map((id: number) => storage.getOfferReview(id))
      .filter((review: OfferReview | undefined): review is OfferReview => Boolean(review));

    if (reviews.length === 0) {
      return res.status(404).json({ error: "No matching offer reviews found" });
    }

    const blockedReview = nextStatus === "published"
      ? reviews.find((review: OfferReview) => getOfferReviewTransitionError(
          review,
          nextStatus,
          storage.getContentEngineBuildManifestEntries(review.id),
        ))
      : undefined;

    if (blockedReview) {
      return res.status(400).json({
        error: getOfferReviewTransitionError(blockedReview, nextStatus, storage.getContentEngineBuildManifestEntries(blockedReview.id)),
      });
    }

    const now = new Date().toISOString();
    const job = storage.createEngineJob({
      moduleKey: "content-engine",
      jobType: "offer-review-bulk-status-change",
      status: "running",
      dealershipId: null,
      startedAt: now,
      completedAt: null,
      summary: `Updating ${reviews.length} offer reviews to ${nextStatus}`,
      payload: JSON.stringify({ ids: reviews.map((review: OfferReview) => review.id), toStatus: nextStatus, notes }),
      errorMessage: null,
    });

    const updatedReviews = reviews
      .map((review: OfferReview) => storage.updateOfferReview(review.id, {
        status: nextStatus,
        notes: notes ?? review.notes,
        jobId: job.id,
      }))
      .filter((review: OfferReview | undefined): review is OfferReview => Boolean(review));

    updatedReviews.forEach((review: OfferReview) => syncContentEngineBuildManifest(storage, review.id));

    storage.updateEngineJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      summary: `Set ${updatedReviews.length} offer reviews to ${nextStatus}`,
      payload: JSON.stringify({ ids: updatedReviews.map((review: OfferReview) => review.id), toStatus: nextStatus, notes }),
    });

    res.json({
      success: true,
      updatedCount: updatedReviews.length,
      status: nextStatus,
      reviews: updatedReviews,
    });
  });

  app.patch("/api/engine/offer-reviews/:id", (req, res) => {
    const review = storage.getOfferReview(Number(req.params.id));
    if (!review) return res.status(404).json({ error: "Not found" });

    if (req.body.status && !allowedOfferReviewStatuses.has(req.body.status)) {
      return res.status(400).json({ error: "Invalid offer review status" });
    }

    const nextStatus = req.body.status ?? review.status;
    const transitionError = getOfferReviewTransitionError(
      review,
      nextStatus,
      storage.getContentEngineBuildManifestEntries(review.id),
    );
    if (transitionError) {
      return res.status(400).json({ error: transitionError });
    }

    const updateJob = storage.createEngineJob({
      moduleKey: review.moduleKey,
      jobType: "offer-review-status-change",
      status: "running",
      dealershipId: review.dealershipId,
      startedAt: new Date().toISOString(),
      completedAt: null,
      summary: `Offer review ${review.id} moving to ${nextStatus}`,
      payload: JSON.stringify({ reviewId: review.id, sourceKey: review.sourceKey, fromStatus: review.status, toStatus: nextStatus }),
      errorMessage: null,
    });

    const updated = storage.updateOfferReview(review.id, {
      status: nextStatus,
      notes: req.body.notes ?? review.notes,
      effectiveDate: req.body.effectiveDate ?? review.effectiveDate,
      expirationDate: req.body.expirationDate ?? review.expirationDate,
      normalizedPayload: req.body.normalizedPayload ?? review.normalizedPayload,
      sourcePayload: req.body.sourcePayload ?? review.sourcePayload,
      sourceUrl: req.body.sourceUrl ?? review.sourceUrl,
      brand: req.body.brand ?? review.brand,
      accountName: req.body.accountName ?? review.accountName,
      offerTitle: req.body.offerTitle ?? review.offerTitle,
      offerModel: req.body.offerModel ?? review.offerModel,
      offerType: req.body.offerType ?? review.offerType,
      sourceId: req.body.sourceId ?? review.sourceId,
      sourceKey: req.body.sourceKey ?? review.sourceKey,
      moduleKey: req.body.moduleKey ?? review.moduleKey,
      jobId: req.body.jobId ?? updateJob.id,
      dealershipId: req.body.dealershipId ?? review.dealershipId,
    });

    if (updated) {
      syncContentEngineBuildManifest(storage, updated.id);
    }

    storage.updateEngineJob(updateJob.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      summary: `Offer review ${review.id} set to ${nextStatus}`,
    });

    res.json(updated);
  });

  app.post("/api/engine/pause", (req, res) => {
    storage.setAppSetting("imports_paused", "true");
    res.json({ success: true, paused: true });
  });

  app.post("/api/engine/resume", (req, res) => {
    storage.setAppSetting("imports_paused", "false");
    res.json({ success: true, paused: false });
  });

  // Weekly talking points / offers — per dealership (Generate New Posts)
  function captionTalkingKey(dealershipId: number): string {
    return `caption_talking_points.${dealershipId}`;
  }
  function captionTalkingUpdatedKey(dealershipId: number): string {
    return `caption_talking_points_updated_at.${dealershipId}`;
  }

  app.get("/api/caption-brief", (_req, res) => {
    const dealerships = storage.getDealerships();
    const stores = dealerships.map((d) => ({
      dealershipId: d.id,
      name: d.name,
      brand: d.brand,
      color: d.color,
      talkingPoints: storage.getAppSetting(captionTalkingKey(d.id)) || "",
      updatedAt: storage.getAppSetting(captionTalkingUpdatedKey(d.id)) || null,
    }));
    // Legacy global key (pre store-level) — surface once so UI can migrate if needed
    const legacyGlobal = storage.getAppSetting("caption_talking_points") || "";
    res.json({ stores, legacyGlobal: legacyGlobal || null });
  });

  app.put("/api/caption-brief", (req, res) => {
    const updatedAt = new Date().toISOString();
    const bodyStores = Array.isArray(req.body?.stores) ? req.body.stores : null;

    // Bulk: { stores: [{ dealershipId, talkingPoints }] }
    if (bodyStores) {
      const dealershipIds = new Set(storage.getDealerships().map((d) => d.id));
      const saved: Array<{ dealershipId: number; talkingPoints: string; updatedAt: string }> = [];
      for (const row of bodyStores) {
        const id = Number(row?.dealershipId);
        if (!Number.isInteger(id) || !dealershipIds.has(id)) continue;
        const talkingPoints = (typeof row?.talkingPoints === "string" ? row.talkingPoints : "")
          .trim()
          .slice(0, 4000);
        storage.setAppSetting(captionTalkingKey(id), talkingPoints);
        storage.setAppSetting(captionTalkingUpdatedKey(id), updatedAt);
        saved.push({ dealershipId: id, talkingPoints, updatedAt });
      }
      // Clear legacy global so it doesn't confuse future reads
      if (storage.getAppSetting("caption_talking_points")) {
        storage.setAppSetting("caption_talking_points", "");
      }
      return res.json({ success: true, savedCount: saved.length, stores: saved, updatedAt });
    }

    // Single store: { dealershipId, talkingPoints }
    const id = Number(req.body?.dealershipId);
    if (!Number.isInteger(id) || !storage.getDealership(id)) {
      return res.status(400).json({ error: "dealershipId required (or pass stores[])" });
    }
    const talkingPoints = (typeof req.body?.talkingPoints === "string" ? req.body.talkingPoints : "")
      .trim()
      .slice(0, 4000);
    storage.setAppSetting(captionTalkingKey(id), talkingPoints);
    storage.setAppSetting(captionTalkingUpdatedKey(id), updatedAt);
    res.json({ success: true, dealershipId: id, talkingPoints, updatedAt });
  });

  app.post("/api/drive/scan", async (req, res) => {
    try {
      const requestedWeeks = Number(req.body?.weeks ?? 1);
      const weeks = Number.isFinite(requestedWeeks) ? Math.min(4, Math.max(1, Math.trunc(requestedWeeks))) : 1;
      const paused = storage.getAppSetting("imports_paused") === "true";
      if (paused) {
        return res.status(409).json({ error: "Imports are paused" });
      }

      // Persist per-store talking points before background runner starts
      const dealershipIds = new Set(storage.getDealerships().map((d) => d.id));
      const now = new Date().toISOString();
      let storesWithPoints = 0;

      if (req.body?.talkingPointsByDealership && typeof req.body.talkingPointsByDealership === "object") {
        for (const [rawId, rawPoints] of Object.entries(req.body.talkingPointsByDealership as Record<string, unknown>)) {
          const id = Number(rawId);
          if (!Number.isInteger(id) || !dealershipIds.has(id)) continue;
          const talkingPoints = (typeof rawPoints === "string" ? rawPoints : "").trim().slice(0, 4000);
          storage.setAppSetting(captionTalkingKey(id), talkingPoints);
          storage.setAppSetting(captionTalkingUpdatedKey(id), now);
          if (talkingPoints) storesWithPoints += 1;
        }
      } else if (Array.isArray(req.body?.stores)) {
        for (const row of req.body.stores) {
          const id = Number(row?.dealershipId);
          if (!Number.isInteger(id) || !dealershipIds.has(id)) continue;
          const talkingPoints = (typeof row?.talkingPoints === "string" ? row.talkingPoints : "")
            .trim()
            .slice(0, 4000);
          storage.setAppSetting(captionTalkingKey(id), talkingPoints);
          storage.setAppSetting(captionTalkingUpdatedKey(id), now);
          if (talkingPoints) storesWithPoints += 1;
        }
      } else {
        // Count already-saved store briefs
        for (const id of Array.from(dealershipIds)) {
          if ((storage.getAppSetting(captionTalkingKey(id)) || "").trim()) storesWithPoints += 1;
        }
      }

      const driveScan = getDriveScanStatus();
      if (driveScan.running) {
        return res.status(409).json({
          error: "Drive scan already running",
          jobId: driveScan.jobId,
          startedAt: driveScan.startedAt,
        });
      }

      const startedAt = new Date().toISOString();
      const scanJob = storage.createEngineJob({
        moduleKey: "post-engine",
        jobType: "drive-scan",
        status: "running",
        startedAt,
        payload: JSON.stringify({
          source: "manual-route",
          weeks,
          storesWithTalkingPoints: storesWithPoints,
        }),
        summary: storesWithPoints
          ? `Drive scan started (${weeks}w) · talking points on ${storesWithPoints} store(s)`
          : "Drive scan started from PostEngine route",
        dealershipId: null,
        completedAt: null,
        errorMessage: null,
      });

      const runnerPid = runDriveScanJob(scanJob.id, weeks);
      res.status(202).json({
        success: true,
        jobId: scanJob.id,
        runnerPid,
        message: storesWithPoints
          ? `Drive scan started — captions will use store-level talking points (${storesWithPoints} store${storesWithPoints === 1 ? "" : "s"})`
          : "Drive scan started in background",
        storesWithTalkingPoints: storesWithPoints,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── CONTENT ENGINE ──────────────────────────────────────────
  app.get("/api/content-engine/cadence", (_req, res) => {
    const settings = storage.getCadenceSettings();
    const dealerships = storage.getDealerships();
    const enriched = settings
      .filter((s: any) => s.isActive)
      .map((s: any) => {
        const dealer = dealerships.find((d: any) => d.id === s.dealershipId);
        return {
          dealershipName: dealer?.name ?? "Unknown",
          postType: s.postType,
          postsPerDay: s.postsPerDay,
          daysOfWeek: s.daysOfWeek,
          platforms: s.platforms,
          isActive: s.isActive,
          reelsConfigured: Boolean(s.reelsConfigured),
          reelsEnabled: Boolean(s.reelsEnabled),
          reelsPerWeek: Number(s.reelsPerWeek || 0),
        };
      })
      .sort((a: any, b: any) => a.dealershipName.localeCompare(b.dealershipName));
    res.json(enriched);
  });

  app.get("/api/content-engine/offers", (_req, res) => {
    const reviews = storage.getOfferReviews({ moduleKey: "content-engine", limit: 150 });
    const targets = storage.getOfferReviewTargets();
    const downstreamUses = storage.getOfferReviewDownstreamUses();
    const selectionDealerships = storage.getDealerships().filter((dealership) => ["BMW", "Audi"].includes(dealership.brand));
    const targetMap = new Map<number, typeof targets>();
    const downstreamUseMap = new Map<string, typeof downstreamUses>();

    for (const target of targets) {
      const existing = targetMap.get(target.offerReviewId) ?? [];
      existing.push(target);
      targetMap.set(target.offerReviewId, existing);
    }

    for (const downstreamUse of downstreamUses) {
      const key = `${downstreamUse.offerReviewId}:${downstreamUse.dealershipId}`;
      const existing = downstreamUseMap.get(key) ?? [];
      existing.push(downstreamUse);
      downstreamUseMap.set(key, existing);
    }

    const attachTargets = (review: OfferReview) => ({
      ...review,
      targets: (targetMap.get(review.id) ?? []).map((target) => ({
        ...target,
        dealershipName: selectionDealerships.find((dealership) => dealership.id === target.dealershipId)?.name ?? "Unknown dealership",
        downstreamUses: (downstreamUseMap.get(`${review.id}:${target.dealershipId}`) ?? []).map((use) => ({
          id: use.id,
          channel: use.channel,
          placement: use.placement,
          isActive: use.isActive,
        })),
      })),
    });

    const candidates = reviews
      .filter((review) => ["detected", "reviewing"].includes(review.status))
      .map(attachTargets);
    const approved = reviews
      .filter((review) => ["approved", "published"].includes(review.status))
      .map(attachTargets);

    res.json({
      stats: storage.getOfferReviewStats(),
      selectionDealerships: selectionDealerships.map((dealership) => ({
        id: dealership.id,
        name: dealership.name,
        brand: dealership.brand,
        location: dealership.location,
      })),
      candidates,
      approved,
    });
  });

  app.post("/api/content-engine/offers/:id/targets", (req, res) => {
    const reviewId = Number(req.params.id);
    const review = storage.getOfferReview(reviewId);
    if (!review) return res.status(404).json({ error: "Offer review not found" });

    if (!["approved", "published"].includes(review.status)) {
      return res.status(400).json({ error: "Dealer selection is only available for approved offers" });
    }

    const dealershipIds: number[] = Array.isArray(req.body?.dealershipIds)
      ? req.body.dealershipIds.map((id: unknown) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)
      : [];

    const allowedDealerships = storage.getDealerships().filter((dealership) => {
      if (!review.brand) return ["BMW", "Audi"].includes(dealership.brand);
      return dealership.brand === review.brand;
    });
    const allowedDealershipIds = new Set(allowedDealerships.map((dealership) => dealership.id));
    const invalidDealershipId = dealershipIds.find((id) => !allowedDealershipIds.has(id));
    if (invalidDealershipId) {
      return res.status(400).json({ error: `Invalid ${review.brand || "content-engine"} dealership id: ${invalidDealershipId}` });
    }

    const now = new Date().toISOString();
    const job = storage.createEngineJob({
      moduleKey: "content-engine",
      jobType: "offer-review-target-update",
      status: "running",
      dealershipId: null,
      startedAt: now,
      completedAt: null,
      summary: `Updating dealer targets for offer review ${review.id}`,
      payload: JSON.stringify({ reviewId: review.id, dealershipIds }),
      errorMessage: null,
    });

    const updatedTargets = storage.replaceOfferReviewTargets(review.id, dealershipIds);
    syncContentEngineBuildManifest(storage, review.id);
    storage.updateEngineJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      summary: `Set ${updatedTargets.length} dealer targets for offer review ${review.id}`,
      payload: JSON.stringify({ reviewId: review.id, dealershipIds: updatedTargets.map((target) => target.dealershipId) }),
    });

    res.json({
      success: true,
      reviewId: review.id,
      targetCount: updatedTargets.length,
      dealershipIds: updatedTargets.map((target) => target.dealershipId),
      targets: updatedTargets,
    });
  });

  app.post("/api/content-engine/offers/:id/downstream-uses/:dealershipId", (req, res) => {
    const reviewId = Number(req.params.id);
    const dealershipId = Number(req.params.dealershipId);
    const review = storage.getOfferReview(reviewId);
    if (!review) return res.status(404).json({ error: "Offer review not found" });

    if (!["approved", "published"].includes(review.status)) {
      return res.status(400).json({ error: "Downstream use is only available for approved offers" });
    }

    const targetIds = new Set(storage.getOfferReviewTargets(reviewId).map((target) => target.dealershipId));
    if (!targetIds.has(dealershipId)) {
      return res.status(400).json({ error: "Offer must be targeted to this dealership before downstream use is assigned" });
    }

    const uses = Array.isArray(req.body?.uses)
      ? req.body.uses
          .map((use: any) => ({
            channel: typeof use?.channel === "string" ? use.channel : "",
            placement: typeof use?.placement === "string" ? use.placement : "supporting",
          }))
          .filter((use: { channel: string; placement: string }) => ["specials-page", "sales-email"].includes(use.channel) && ["hero", "primary", "supporting"].includes(use.placement))
      : [];

    const now = new Date().toISOString();
    const job = storage.createEngineJob({
      moduleKey: "content-engine",
      jobType: "offer-review-downstream-use-update",
      status: "running",
      dealershipId,
      startedAt: now,
      completedAt: null,
      summary: `Updating downstream uses for offer review ${review.id}`,
      payload: JSON.stringify({ reviewId: review.id, dealershipId, uses }),
      errorMessage: null,
    });

    const updatedUses = storage.replaceOfferReviewDownstreamUses(review.id, dealershipId, uses);
    syncContentEngineBuildManifest(storage, review.id);
    storage.updateEngineJob(job.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      summary: `Set ${updatedUses.length} downstream uses for offer review ${review.id}`,
      payload: JSON.stringify({ reviewId: review.id, dealershipId, uses: updatedUses.map((use) => ({ channel: use.channel, placement: use.placement })) }),
    });

    res.json({
      success: true,
      reviewId: review.id,
      dealershipId,
      useCount: updatedUses.length,
      uses: updatedUses,
    });
  });

  app.get("/api/content-engine/email-iterations", (_req, res) => {
    const dealerships = new Map(storage.getDealerships().map((dealership) => [dealership.id, dealership]));
    const approvedReviews = storage.getOfferReviews({ moduleKey: "content-engine", limit: 300 });
    const targets = storage.getOfferReviewTargets();
    const downstreamUses = storage.getOfferReviewDownstreamUses();
    const availableOfferOptionsByDealership = buildEmailIterationOfferOptionsByDealership(approvedReviews, targets, downstreamUses);

    const cards = storage.getEmailIterationSetups().map((setup) => {
      const dealership = dealerships.get(setup.dealershipId);
      return {
        ...setup,
        store: dealership?.name ?? "Unknown dealership",
        brand: dealership?.brand ?? null,
        location: dealership?.location ?? null,
        priorReferenceFiles: parseStringArray(setup.priorReferenceFiles),
        selectedOfferReviewIds: parseNumberArray(setup.selectedOfferReviewIds),
        availableOfferOptions: availableOfferOptionsByDealership.get(setup.dealershipId) ?? [],
      };
    }).sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "active-now" ? -1 : 1;
      }
      if (left.store !== right.store) {
        return left.store.localeCompare(right.store);
      }
      return left.campaignType.localeCompare(right.campaignType);
    });

    res.json({ cards });
  });

  app.patch("/api/content-engine/email-iterations/:id", (req, res) => {
    const setupId = Number(req.params.id);
    const existing = storage.getEmailIterationSetups().find((setup) => setup.id === setupId);
    if (!existing) return res.status(404).json({ error: "Email iteration setup not found" });
    const availableOfferOptionsByDealership = buildEmailIterationOfferOptionsByDealership(
      storage.getOfferReviews({ moduleKey: "content-engine", limit: 300 }),
      storage.getOfferReviewTargets(),
      storage.getOfferReviewDownstreamUses(),
    );

    try {
      const parsed = emailIterationSetupUpdateSchema.parse({
        ...req.body,
        priorReferenceFiles: Array.isArray(req.body?.priorReferenceFiles)
          ? JSON.stringify(req.body.priorReferenceFiles.filter((value: unknown) => typeof value === "string"))
          : req.body?.priorReferenceFiles,
        selectedOfferReviewIds: Array.isArray(req.body?.selectedOfferReviewIds)
          ? JSON.stringify(req.body.selectedOfferReviewIds.filter((value: unknown) => typeof value === "number" && Number.isFinite(value)))
          : req.body?.selectedOfferReviewIds,
      });

      const updated = storage.updateEmailIterationSetup(setupId, parsed);
      if (!updated) return res.status(500).json({ error: "Failed to update email iteration setup" });

      const dealership = storage.getDealership(updated.dealershipId);
      res.json({
        ...updated,
        store: dealership?.name ?? "Unknown dealership",
        brand: dealership?.brand ?? null,
        location: dealership?.location ?? null,
        priorReferenceFiles: parseStringArray(updated.priorReferenceFiles),
        selectedOfferReviewIds: parseNumberArray(updated.selectedOfferReviewIds),
        availableOfferOptions: availableOfferOptionsByDealership.get(updated.dealershipId) ?? [],
      });
    } catch (error) {
      const message = error instanceof z.ZodError ? error.issues.map((issue) => issue.message).join("; ") : error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/content-engine/build-plan", (_req, res) => {
    const reviews = storage.getOfferReviews({ moduleKey: "content-engine", limit: 300 })
      .filter((review) => ["approved", "published"].includes(review.status));
    const dealerships = storage.getDealerships().filter((dealership) => ["BMW", "Audi"].includes(dealership.brand));
    const manifests = storage.getContentEngineBuildManifestEntries();

    res.json(buildContentEngineBuildPlan({
      dealerships,
      manifests,
      reviews,
    }));
  });

  // ── CADENCE SETTINGS ─────────────────────────────────────────
  app.get("/api/cadence", (req, res) => {
    const { dealershipId } = req.query;
    const settings = storage.getCadenceSettings(dealershipId ? parseInt(dealershipId as string) : undefined);
    res.json(settings);
  });

  app.post("/api/cadence", (req, res) => {
    try {
      const parsed = insertCadenceSchema.parse({
        ...req.body,
        reelsConfigured: Boolean(req.body?.reelsConfigured),
        reelsEnabled: Boolean(req.body?.reelsEnabled),
        reelsPerWeek: Number(req.body?.reelsPerWeek || 0),
      });
      const setting = storage.createCadenceSetting(parsed);
      res.json(setting);
    } catch (e: any) {
      if (e?.name === "ZodError") {
        return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid cadence rule" });
      }
      res.status(400).json({ error: e.message || "Invalid cadence rule" });
    }
  });

  app.patch("/api/cadence/:id", (req, res) => {
    try {
      const existing = storage.getCadenceSettings().find((s) => s.id === parseInt(req.params.id));
      if (!existing) return res.status(404).json({ error: "Not found" });
      const merged = {
        dealershipId: existing.dealershipId,
        postType: existing.postType,
        daysOfWeek: existing.daysOfWeek,
        postsPerDay: existing.postsPerDay,
        autoTime: existing.autoTime,
        manualTime: existing.manualTime,
        platforms: existing.platforms,
        isActive: existing.isActive,
        reelsConfigured: existing.reelsConfigured,
        reelsEnabled: existing.reelsEnabled,
        reelsPerWeek: existing.reelsPerWeek,
        ...req.body,
      };
      const parsed = insertCadenceSchema.parse({
        ...merged,
        reelsConfigured: Boolean(merged.reelsConfigured),
        reelsEnabled: Boolean(merged.reelsEnabled),
        reelsPerWeek: Number(merged.reelsPerWeek || 0),
      });
      const setting = storage.updateCadenceSetting(parseInt(req.params.id), parsed);
      if (!setting) return res.status(404).json({ error: "Not found" });
      res.json(setting);
    } catch (e: any) {
      if (e?.name === "ZodError") {
        return res.status(400).json({ error: e.errors?.[0]?.message || "Invalid cadence rule" });
      }
      res.status(400).json({ error: e.message || "Invalid cadence rule" });
    }
  });

  app.delete("/api/cadence/:id", (req, res) => {
    const success = storage.deleteCadenceSetting(parseInt(req.params.id));
    if (!success) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  });

  app.get("/api/activity", (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const activity = storage.getActivityLog(limit);
    res.json(activity);
  });

  // ---- Dashboard Stats ----
  app.get("/api/dashboard", (_req, res) => {
    const stats = storage.getPostStats();
    const dealerships = storage.getDealerships();
    const recentActivity = storage.getActivityLog(10);
    const allPosts = storage.getPosts();

    // Posts per dealership
    const perDealership = dealerships.map(d => ({
      ...d,
      postCount: allPosts.filter(p => p.dealershipId === d.id).length,
      scheduledCount: allPosts.filter(p => p.dealershipId === d.id && p.status === "scheduled").length,
      draftCount: allPosts.filter(p => p.dealershipId === d.id && p.status === "draft").length,
    }));

    res.json({
      stats,
      dealerships: perDealership,
      recentActivity,
    });
  });
}
