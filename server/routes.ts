import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  insertPostSchema,
  insertDealershipSchema,
  insertEngineModuleSchema,
  insertAccountModuleSchema,
  insertEngineSourceSchema,
  insertOfferReviewSchema,
} from "@shared/schema";
import { scanDriveFolders, archiveFile, loadFolders } from "./drive-scanner";
import { publishPost } from "./zernio-publisher";
import { sendApprovalRequest, sendWeeklySummary } from "./telegram-notify";
import { composePostContent } from "./post-composer";

export async function registerRoutes(server: Server, app: Express) {
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

  // ---- Posts ----
  app.get("/api/posts", (req, res) => {
    const filters: any = {};
    if (req.query.dealershipId) filters.dealershipId = Number(req.query.dealershipId);
    if (req.query.status) filters.status = req.query.status as string;
    if (req.query.postType) filters.postType = req.query.postType as string;
    const postsList = storage.getPosts(filters);
    res.json(postsList);
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
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/posts/:id", (req, res) => {
    const existing = storage.getPost(Number(req.params.id));
    if (!existing) return res.status(404).json({ error: "Not found" });

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

      // Archive Drive file when post is scheduled or published
      if ((req.body.status === "scheduled" || req.body.status === "published") && updated.folderSource) {
        try {
          archiveFile(updated.dealershipId, updated.folderSource);
          console.log(`[Archive] Moved file to _Archive for post ${updated.id}`);
        } catch (e) {
          console.error(`[Archive] Failed to move file:`, e);
        }
      }
    }

    res.json(updated);
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
    const results = [];
    for (const id of ids) {
      const existing = storage.getPost(Number(id));
      if (!existing) continue;

      const updated = storage.updatePost(id, { status: "scheduled" });
      if (updated) {
        storage.logActivity({
          postId: updated.id,
          dealershipId: updated.dealershipId,
          action: "scheduled",
          details: `Post approved & scheduled: ${updated.vehicleInfo || updated.postType}`,
        });

        if (existing.status !== "scheduled" && updated.folderSource) {
          try {
            archiveFile(updated.dealershipId, updated.folderSource);
            console.log(`[Archive] Moved file to _Archive for post ${updated.id} via bulk approve`);
          } catch (e) {
            console.error(`[Archive] Failed to move file during bulk approve:`, e);
          }
        }

        results.push(updated);
      }
    }
    res.json(results);
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
    res.json({ paused, lastRunAt, lastRunCount });
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

  app.post("/api/engine/offer-reviews", (req, res) => {
    try {
      const data = insertOfferReviewSchema.parse(req.body);
      const review = storage.createOfferReview(data);
      res.status(201).json(review);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/engine/offer-reviews/:id", (req, res) => {
    const review = storage.getOfferReview(Number(req.params.id));
    if (!review) return res.status(404).json({ error: "Not found" });

    const allowedStatuses = new Set(["detected", "reviewing", "approved", "rejected", "published"]);
    if (req.body.status && !allowedStatuses.has(req.body.status)) {
      return res.status(400).json({ error: "Invalid offer review status" });
    }

    const nextStatus = req.body.status ?? review.status;
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

  app.post("/api/drive/scan", async (req, res) => {
    const startedAt = new Date().toISOString();
    const scanJob = storage.createEngineJob({
      moduleKey: "post-engine",
      jobType: "drive-scan",
      status: "running",
      startedAt,
      payload: JSON.stringify({ source: "manual-route" }),
      summary: "Drive scan started from PostEngine route",
      dealershipId: null,
      completedAt: null,
      errorMessage: null,
    });

    try {
      const paused = storage.getAppSetting("imports_paused") === "true";
      if (paused) {
        storage.updateEngineJob(scanJob.id, {
          status: "blocked",
          completedAt: new Date().toISOString(),
          summary: "Drive scan skipped because imports are paused",
          errorMessage: "Imports are paused",
        });
        return res.status(409).json({ error: "Imports are paused" });
      }

      const count = await scanDriveFolders();
      const completedAt = new Date().toISOString();
      storage.setAppSetting("last_scan_at", completedAt);
      storage.setAppSetting("last_scan_count", String(count));
      storage.updateEngineSourceByKey("post-engine-drive-ingestion", {
        lastCheckedAt: completedAt,
        lastResultSummary: `Last manual scan created ${count} queued post(s)`,
        metadata: JSON.stringify({ route: "/api/drive/scan", source: "manual-route", newPosts: count }),
      });
      storage.updateEngineJob(scanJob.id, {
        status: "completed",
        completedAt,
        summary: `Drive scan created ${count} queued post(s)`,
        payload: JSON.stringify({ source: "manual-route", newPosts: count }),
      });
      res.json({ success: true, newPosts: count, message: `Created ${count} queued post(s) from Drive` });
    } catch (e: any) {
      storage.updateEngineJob(scanJob.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        summary: "Drive scan failed",
        errorMessage: e.message,
      });
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
        };
      })
      .sort((a: any, b: any) => a.dealershipName.localeCompare(b.dealershipName));
    res.json(enriched);
  });

  app.get("/api/content-engine/offers", (_req, res) => {
    res.json({
      stats: storage.getOfferReviewStats(),
      queue: storage.getOfferReviews({ moduleKey: "content-engine", limit: 12 }),
    });
  });

  // ── CADENCE SETTINGS ─────────────────────────────────────────
  app.get("/api/cadence", (req, res) => {
    const { dealershipId } = req.query;
    const settings = storage.getCadenceSettings(dealershipId ? parseInt(dealershipId as string) : undefined);
    res.json(settings);
  });

  app.post("/api/cadence", (req, res) => {
    const setting = storage.createCadenceSetting(req.body);
    res.json(setting);
  });

  app.patch("/api/cadence/:id", (req, res) => {
    const setting = storage.updateCadenceSetting(parseInt(req.params.id), req.body);
    if (!setting) return res.status(404).json({ error: "Not found" });
    res.json(setting);
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
