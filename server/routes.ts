import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertPostSchema, insertDealershipSchema } from "@shared/schema";
import { scanDriveFolders, archiveFile } from "./drive-scanner";
import { publishPost } from "./zernio-publisher";

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
    res.json(post);
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
      const updated = storage.updatePost(id, { status: "scheduled" });
      if (updated) {
        storage.logActivity({
          postId: updated.id,
          dealershipId: updated.dealershipId,
          action: "scheduled",
          details: `Post approved & scheduled: ${updated.vehicleInfo || updated.postType}`,
        });
        results.push(updated);
      }
    }
    res.json(results);
  });

  // ---- Activity ----
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
  app.post("/api/drive/scan", async (req, res) => {
    try {
      const count = await scanDriveFolders();
      res.json({ success: true, newPosts: count, message: `Created ${count} new draft post(s) from Drive` });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
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
