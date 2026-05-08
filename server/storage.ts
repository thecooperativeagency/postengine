import {
  dealerships,
  posts,
  activityLog,
  cadenceSettings,
  engineModules,
  accountModules,
  engineJobs,
  engineSources,
  offerReviews,
  type Dealership,
  type InsertDealership,
  type Post,
  type InsertPost,
  type ActivityLog,
  type InsertActivityLog,
  type CadenceSetting,
  type InsertCadence,
  type EngineModule,
  type InsertEngineModule,
  type AccountModule,
  type InsertAccountModule,
  type EngineJob,
  type InsertEngineJob,
  type EngineSource,
  type InsertEngineSource,
  type OfferReview,
  type InsertOfferReview,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql } from "drizzle-orm";
import { sanitizeLegacyCaption } from "./post-sanitizer";

const sqlite = new Database("sqlite.db");
const db = drizzle(sqlite);

export interface IStorage {
  // Dealerships
  getDealerships(): Dealership[];
  getDealership(id: number): Dealership | undefined;
  createDealership(data: InsertDealership): Dealership;
  updateDealership(id: number, data: Partial<InsertDealership>): Dealership | undefined;

  // Posts
  getPosts(filters?: { dealershipId?: number; status?: string; postType?: string }): Post[];
  getPost(id: number): Post | undefined;
  createPost(data: InsertPost): Post;
  updatePost(id: number, data: Partial<InsertPost>): Post | undefined;
  deletePost(id: number): void;
  getPostStats(): { total: number; draft: number; queued: number; scheduled: number; published: number };

  // App settings
  getAppSetting(key: string): string | undefined;
  setAppSetting(key: string, value: string): void;

  // Shared engine core
  getEngineModules(): EngineModule[];
  createEngineModule(data: InsertEngineModule): EngineModule;
  getAccountModules(dealershipId?: number): AccountModule[];
  upsertAccountModule(data: InsertAccountModule): AccountModule;
  getEngineJobs(limit?: number): EngineJob[];
  createEngineJob(data: InsertEngineJob): EngineJob;
  updateEngineJob(id: number, data: Partial<InsertEngineJob>): EngineJob | undefined;
  getEngineSources(): EngineSource[];
  createEngineSource(data: InsertEngineSource): EngineSource;
  updateEngineSourceByKey(key: string, data: Partial<InsertEngineSource>): EngineSource | undefined;
  getOfferReviews(filters?: { status?: string; moduleKey?: string; sourceKey?: string; limit?: number }): OfferReview[];
  getOfferReview(id: number): OfferReview | undefined;
  createOfferReview(data: InsertOfferReview): OfferReview;
  updateOfferReview(id: number, data: Partial<InsertOfferReview>): OfferReview | undefined;
  getOfferReviewStats(): {
    total: number;
    detected: number;
    reviewing: number;
    approved: number;
    rejected: number;
    published: number;
  };

  // Activity
  getActivityLog(limit?: number): ActivityLog[];
  logActivity(data: InsertActivityLog): ActivityLog;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Create tables
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS dealerships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        brand TEXT NOT NULL,
        domain TEXT NOT NULL,
        location TEXT NOT NULL,
        instagram_handle TEXT,
        facebook_page TEXT,
        tiktok_handle TEXT,
        instagram_cta TEXT,
        facebook_cta TEXT,
        gmb_cta TEXT,
        caption_spec TEXT,
        hashtag_template TEXT,
        gmb_spec TEXT,
        facebook_link TEXT,
        gmb_link TEXT,
        color TEXT NOT NULL DEFAULT '#01696F'
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dealership_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        post_type TEXT NOT NULL DEFAULT 'inventory',
        vehicle_info TEXT,
        caption TEXT,
        hashtags TEXT,
        cta_block TEXT,
        media_urls TEXT,
        media_type TEXT DEFAULT 'image',
        platforms TEXT DEFAULT '["instagram","facebook"]',
        scheduled_for TEXT,
        published_at TEXT,
        folder_source TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        dealership_id INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cadence_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dealership_id INTEGER NOT NULL,
        post_type TEXT NOT NULL,
        days_of_week TEXT NOT NULL DEFAULT '[]',
        posts_per_day INTEGER NOT NULL DEFAULT 1,
        auto_time INTEGER NOT NULL DEFAULT 1,
        manual_time TEXT,
        platforms TEXT NOT NULL DEFAULT '["instagram","facebook","googlebusiness"]',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS engine_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        route TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS account_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dealership_id INTEGER NOT NULL,
        module_key TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        settings TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(dealership_id, module_key)
      );

      CREATE TABLE IF NOT EXISTS engine_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_key TEXT NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        dealership_id INTEGER,
        started_at TEXT,
        completed_at TEXT,
        summary TEXT,
        payload TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS engine_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        module_key TEXT NOT NULL,
        name TEXT NOT NULL,
        watcher_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        target TEXT NOT NULL,
        cadence_minutes INTEGER,
        last_checked_at TEXT,
        last_result_summary TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS offer_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        source_key TEXT NOT NULL,
        module_key TEXT NOT NULL,
        job_id INTEGER,
        dealership_id INTEGER,
        brand TEXT,
        account_name TEXT,
        offer_title TEXT NOT NULL,
        offer_model TEXT,
        offer_type TEXT,
        status TEXT NOT NULL DEFAULT 'detected',
        source_url TEXT,
        source_payload TEXT NOT NULL DEFAULT '{}',
        normalized_payload TEXT NOT NULL DEFAULT '{}',
        effective_date TEXT,
        expiration_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const dealershipColumns = sqlite.prepare(`PRAGMA table_info(dealerships)`).all() as Array<{ name: string }>;
    const dealershipColumnNames = new Set(dealershipColumns.map((col) => col.name));
    if (!dealershipColumnNames.has("instagram_cta")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN instagram_cta TEXT;`);
    }
    if (!dealershipColumnNames.has("facebook_cta")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN facebook_cta TEXT;`);
    }
    if (!dealershipColumnNames.has("gmb_cta")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN gmb_cta TEXT;`);
    }
    if (!dealershipColumnNames.has("caption_spec")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN caption_spec TEXT;`);
    }
    if (!dealershipColumnNames.has("hashtag_template")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN hashtag_template TEXT;`);
    }
    if (!dealershipColumnNames.has("gmb_spec")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN gmb_spec TEXT;`);
    }
    if (!dealershipColumnNames.has("facebook_link")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN facebook_link TEXT;`);
    }
    if (!dealershipColumnNames.has("gmb_link")) {
      sqlite.exec(`ALTER TABLE dealerships ADD COLUMN gmb_link TEXT;`);
    }

    this.sanitizeLegacyPosts();
    this.seedEngineModules();

    // Seed dealerships if empty
    const count = db.select({ count: sql<number>`count(*)` }).from(dealerships).get();
    if (count && count.count === 0) {
      this.seedDealerships();
    }

    this.seedAccountModules();
    this.seedEngineSources();
  }

  private seedDealerships() {
    const stores = [
      {
        name: "BMW of Jackson",
        brand: "BMW",
        domain: "bmwofjackson.net",
        location: "Jackson, MS",
        instagramHandle: "@bmwofjackson",
        facebookPage: "BMWofJackson",
        color: "#1C69D4",
        instagramCta: "Click here --> @bmwofjackson then click the linkin.bio to browse and click on the link of this post.",
        facebookCta: "Click our link in bio to shop our special offers.",
        gmbCta: "Visit our website for current offers and availability.",
        captionSpec: "Confident, premium BMW tone. Lead with performance, technology, or design. Keep captions tight and modern.",
        hashtagTemplate: "#BMWofJackson #BMW #UltimateDrivingMachine",
        gmbSpec: "Keep it polished, local, and professional. Focus on current inventory or service value without hashtags.",
        facebookLink: "",
        gmbLink: "",
      },
      {
        name: "Brian Harris BMW",
        brand: "BMW",
        domain: "brianharrisbmw.com",
        location: "Baton Rouge, LA",
        instagramHandle: "@brianharrisbmw",
        facebookPage: "BrianHarrisBMW",
        color: "#1C69D4",
        instagramCta: "Click here --> @brianharrisbmw then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Brian Harris BMW a 2024 Center of Excellence Dealer.",
        facebookCta: "Click our link in bio to shop our special offers.\n\nExperience the Harris Family Difference.",
        gmbCta: "Visit our website to view offers and inventory details.",
        captionSpec: "Sharp BMW luxury-performance tone. Highlight engineering, driving dynamics, and upscale Baton Rouge positioning.",
        hashtagTemplate: "#BrianHarrisBMW #BMW #BatonRougeBMW #UltimateDrivingMachine",
        gmbSpec: "Professional local dealer tone. Keep it short, factual, and inventory/service focused with no hashtags.",
        facebookLink: "",
        gmbLink: "",
      },
      {
        name: "Audi Baton Rouge",
        brand: "Audi",
        domain: "audibatonrouge.com",
        location: "Baton Rouge, LA",
        instagramHandle: "@audibatonrouge",
        facebookPage: "AudiBatonRouge",
        color: "#BB0A30",
        instagramCta: "Click here --> @audibatonrouge then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Audi Baton Rouge your Magna Society Dealer.",
        facebookCta: "Click our link in bio to shop our special offers.\n\nExperience the Harris Family Difference.",
        gmbCta: "Visit our website to explore current Audi offers and inventory.",
        captionSpec: "Modern Audi tone: precise, progressive, design-forward. Emphasize quattro, technology, refinement, and understated luxury.",
        hashtagTemplate: "#AudiBatonRouge #Audi #quattro #ProgressiveLuxury",
        gmbSpec: "Clear, premium, local dealership tone. Focus on model, service, or offer details in plain language with no hashtags.",
        facebookLink: "",
        gmbLink: "",
      },
      {
        name: "Harris Porsche",
        brand: "Porsche",
        domain: "harrisporsche.com",
        location: "Baton Rouge, LA",
        instagramHandle: "@harrisporsche",
        facebookPage: "HarrisPorsche",
        color: "#C8102E",
        instagramCta: "Click here --> @harrisporsche then click the linkin.bio to browse and click on the link of this post.",
        facebookCta: "Click our link in bio to shop our special offers.",
        gmbCta: "Visit our website for current Porsche offers and availability.",
        captionSpec: "Porsche voice should feel precise, aspirational, and performance-first. Avoid cheesy hype. Keep it tight, elevated, and enthusiast credible.",
        hashtagTemplate: "#HarrisPorsche #Porsche #PorscheLifestyle #PorschePerformance",
        gmbSpec: "Professional luxury tone for local search. Keep it concise and factual. No hashtags or social-style CTA lines.",
        facebookLink: "",
        gmbLink: "",
      },
      {
        name: "Luc OpenCRAW",
        brand: "OpenCRAW",
        domain: "opencraw.ai",
        location: "Baton Rouge, LA",
        instagramHandle: "@opencraw",
        facebookPage: "",
        color: "#eb2300",
        instagramCta: "",
        facebookCta: "",
        gmbCta: "",
        captionSpec: "Bold, intelligent, slightly playful AI brand voice. Clear utility first, personality second.",
        hashtagTemplate: "#OpenCRAW #AI #Automation",
        gmbSpec: "Clear and professional. Focus on service clarity and local relevance.",
        facebookLink: "",
        gmbLink: "",
      },
    ];

    for (const store of stores) {
      db.insert(dealerships).values(store).run();
    }

    // Seed some sample posts
    const samplePosts: InsertPost[] = [
      {
        dealershipId: 2,
        status: "queued",
        postType: "inventory",
        vehicleInfo: "2026 BMW X5 M60",
        caption: "Pure power meets refined luxury. The 2026 BMW X5 M60 delivers 523 horsepower through a twin-turbo V8 that transforms every drive into an event. Adaptive M suspension, panoramic sky lounge, and a cockpit that anticipates your every move.",
        hashtags: "#BMWX5 #BMWM60 #LuxurySUV #BatonRougeBMW #TwinTurboV8 #UltimateDrivingMachine",
        ctaBlock: "Click here --> @brianharrisbmw then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Brian Harris BMW a 2024 Center of Excellence Dealer.",
        platforms: '["instagram","facebook"]',
        scheduledFor: new Date(Date.now() + 86400000).toISOString(),
        mediaType: "image",
      },
      {
        dealershipId: 3,
        status: "draft",
        postType: "inventory",
        vehicleInfo: "2026 Audi Q8 55 TFSI",
        caption: "Command attention in the 2026 Audi Q8. Progressive design meets quattro confidence with 335 horsepower and a cabin wrapped in premium materials. The 14.5-inch MMI touch display keeps you connected to everything that matters.",
        hashtags: "#AudiQ8 #quattro #LuxurySUV #AudiBatonRouge #ProgressiveDesign #AudiLife",
        ctaBlock: "Click here --> @audibatonrouge then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Audi Baton Rouge your Magna Society Dealer.",
        platforms: '["instagram","facebook","tiktok"]',
        mediaType: "image",
      },
      {
        dealershipId: 4,
        status: "scheduled",
        postType: "lifestyle",
        vehicleInfo: "2026 Porsche 911 Carrera",
        caption: "The open road is calling. There is nothing quite like a Saturday morning drive in a Porsche 911 Carrera — where every curve feels choreographed and every straightaway begs for more.",
        hashtags: "#Porsche911 #Carrera #WeekendDrive #HarrisPorsche #PorscheLife #DreamCar",
        ctaBlock: "Click here --> @harrisporsche then click the linkin.bio to browse and click on the link of this post.",
        platforms: '["instagram","facebook"]',
        scheduledFor: new Date(Date.now() + 172800000).toISOString(),
        mediaType: "image",
      },
      {
        dealershipId: 1,
        status: "published",
        postType: "promo",
        vehicleInfo: "Spring Service Special",
        caption: "Spring is here and your BMW deserves a fresh start. Schedule your spring maintenance at BMW of Jackson and enjoy complimentary multi-point inspection with any service appointment this month.",
        hashtags: "#BMWService #SpringMaintenance #BMWofJackson #JacksonMS #BMWCare #ServiceSpecial",
        ctaBlock: "Click here --> @bmwofjackson then click the linkin.bio to browse and click on the link of this post.",
        platforms: '["instagram","facebook"]',
        publishedAt: new Date(Date.now() - 86400000).toISOString(),
        mediaType: "image",
      },
      {
        dealershipId: 2,
        status: "draft",
        postType: "announcement",
        vehicleInfo: "Center of Excellence Award",
        caption: "We are proud to announce that Brian Harris BMW has been recognized as a 2024 BMW Center of Excellence Dealer. This award reflects our commitment to delivering an exceptional ownership experience every single day.",
        hashtags: "#BrianHarrisBMW #CenterOfExcellence #BMWExcellence #BatonRouge #BMWDealer #Luxury",
        ctaBlock: "Click here --> @brianharrisbmw then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Brian Harris BMW a 2024 Center of Excellence Dealer.",
        platforms: '["instagram","facebook","tiktok"]',
        mediaType: "image",
      },
    ];

    for (const post of samplePosts) {
      db.insert(posts).values({
        ...post,
        createdAt: new Date().toISOString(),
      }).run();
    }
  }

  private seedEngineModules() {
    const count = db.select({ count: sql<number>`count(*)` }).from(engineModules).get();
    if (count && count.count > 0) return;

    const now = new Date().toISOString();
    db.insert(engineModules).values([
      {
        key: "post-engine",
        name: "PostEngine",
        route: "/",
        description: "Current social post workflow hub for queue, review, and publishing.",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      {
        key: "content-engine",
        name: "Content Engine",
        route: "/content-engine",
        description: "Content planning and production coordination surface kept live during transition.",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
    ]).run();
  }

  private seedAccountModules() {
    const modules = this.getEngineModules();
    const dealers = this.getDealerships();
    if (modules.length === 0 || dealers.length === 0) return;

    const existing = this.getAccountModules();
    const existingKeys = new Set(existing.map((item) => `${item.dealershipId}:${item.moduleKey}`));
    const now = new Date().toISOString();

    for (const dealer of dealers) {
      for (const module of modules) {
        const compositeKey = `${dealer.id}:${module.key}`;
        if (existingKeys.has(compositeKey)) continue;

        db.insert(accountModules).values({
          dealershipId: dealer.id,
          moduleKey: module.key,
          isEnabled: true,
          settings: "{}",
          createdAt: now,
          updatedAt: now,
        }).run();
      }
    }
  }

  private seedEngineSources() {
    const count = db.select({ count: sql<number>`count(*)` }).from(engineSources).get();
    if (count && count.count > 0) return;

    const now = new Date().toISOString();
    db.insert(engineSources).values([
      {
        key: "post-engine-drive-ingestion",
        moduleKey: "post-engine",
        name: "Post Engine Drive Ingestion",
        watcherType: "manual-scan",
        sourceType: "google-drive",
        status: "active",
        target: "Shared dealership Drive roots",
        cadenceMinutes: 30,
        lastCheckedAt: null,
        lastResultSummary: "Ready for manual scans via /api/drive/scan",
        metadata: JSON.stringify({ route: "/api/drive/scan", notes: "Preserves existing Post Engine ingestion flow." }),
        createdAt: now,
        updatedAt: now,
      },
      {
        key: "bmw-offers-watcher",
        moduleKey: "content-engine",
        name: "BMW Offers Watcher",
        watcherType: "scaffold",
        sourceType: "offers-feed",
        status: "planned",
        target: "BMW regional / dealer offers inputs",
        cadenceMinutes: 1440,
        lastCheckedAt: null,
        lastResultSummary: "Scaffold only — no live runner yet",
        metadata: JSON.stringify({ brand: "BMW", intent: "Future offer-change detection for content planning." }),
        createdAt: now,
        updatedAt: now,
      },
      {
        key: "audi-offers-watcher",
        moduleKey: "content-engine",
        name: "Audi Offers Watcher",
        watcherType: "scaffold",
        sourceType: "offers-feed",
        status: "planned",
        target: "Audi regional / dealer offers inputs",
        cadenceMinutes: 1440,
        lastCheckedAt: null,
        lastResultSummary: "Scaffold only — no live runner yet",
        metadata: JSON.stringify({ brand: "Audi", intent: "Future offer-change detection for content planning." }),
        createdAt: now,
        updatedAt: now,
      },
    ]).run();
  }

  // Dealerships
  getDealerships(): Dealership[] {
    return db.select().from(dealerships).all();
  }

  getDealership(id: number): Dealership | undefined {
    return db.select().from(dealerships).where(eq(dealerships.id, id)).get();
  }

  createDealership(data: InsertDealership): Dealership {
    const dealership = db.insert(dealerships).values(data).returning().get();
    const now = new Date().toISOString();

    for (const module of this.getEngineModules()) {
      db.insert(accountModules).values({
        dealershipId: dealership.id,
        moduleKey: module.key,
        isEnabled: true,
        settings: "{}",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing().run();
    }

    return dealership;
  }

  updateDealership(id: number, data: Partial<InsertDealership>): Dealership | undefined {
    return db.update(dealerships).set(data).where(eq(dealerships.id, id)).returning().get();
  }

  // Posts
  getPosts(filters?: { dealershipId?: number; status?: string; postType?: string }): Post[] {
    let query = db.select().from(posts);
    const conditions = [];
    if (filters?.dealershipId) conditions.push(eq(posts.dealershipId, filters.dealershipId));
    if (filters?.status) conditions.push(eq(posts.status, filters.status));
    if (filters?.postType) conditions.push(eq(posts.postType, filters.postType));

    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(posts.createdAt)).all();
    }
    return query.orderBy(desc(posts.createdAt)).all();
  }

  private sanitizeLegacyPosts() {
    const dirtyPosts = db.select().from(posts).all();
    const dealerMap = new Map(this.getDealerships().map((dealer) => [dealer.id, dealer]));

    for (const post of dirtyPosts) {
      const dealer = dealerMap.get(post.dealershipId);
      const ctas = [dealer?.instagramCta, dealer?.facebookCta, dealer?.gmbCta, post.ctaBlock];
      const cleanedCaption = sanitizeLegacyCaption(post.caption, ctas);
      const cleanedFacebook = sanitizeLegacyCaption((post as any).captionFacebook, ctas);
      const cleanedGmb = sanitizeLegacyCaption((post as any).captionGmb, ctas);

      const shouldUpdate =
        post.hashtags !== null ||
        cleanedCaption !== (post.caption || "") ||
        cleanedFacebook !== (((post as any).captionFacebook as string | null) || "") ||
        cleanedGmb !== (((post as any).captionGmb as string | null) || "");

      if (!shouldUpdate) continue;

      db.update(posts)
        .set({
          caption: cleanedCaption,
          captionFacebook: cleanedFacebook,
          captionGmb: cleanedGmb,
          hashtags: null,
        })
        .where(eq(posts.id, post.id))
        .run();
    }
  }

  getPost(id: number): Post | undefined {
    return db.select().from(posts).where(eq(posts.id, id)).get();
  }

  createPost(data: InsertPost): Post {
    return db.insert(posts).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }

  updatePost(id: number, data: Partial<InsertPost>): Post | undefined {
    return db.update(posts).set(data).where(eq(posts.id, id)).returning().get();
  }

  deletePost(id: number): void {
    db.delete(posts).where(eq(posts.id, id)).run();
  }

  getPostStats(): { total: number; draft: number; queued: number; scheduled: number; published: number } {
    const all = db.select().from(posts).all();
    return {
      total: all.length,
      draft: all.filter(p => p.status === "draft").length,
      queued: all.filter(p => p.status === "queued").length,
      scheduled: all.filter(p => p.status === "scheduled").length,
      published: all.filter(p => p.status === "published").length,
    };
  }

  // Cadence Settings
  getCadenceSettings(dealershipId?: number): CadenceSetting[] {
    if (dealershipId) {
      return db.select().from(cadenceSettings).where(eq(cadenceSettings.dealershipId, dealershipId)).all();
    }
    return db.select().from(cadenceSettings).all();
  }

  createCadenceSetting(data: InsertCadence): CadenceSetting {
    return db.insert(cadenceSettings).values({
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning().get();
  }

  updateCadenceSetting(id: number, data: Partial<InsertCadence>): CadenceSetting | undefined {
    return db.update(cadenceSettings)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(cadenceSettings.id, id))
      .returning().get();
  }

  deleteCadenceSetting(id: number): boolean {
    const result = db.delete(cadenceSettings).where(eq(cadenceSettings.id, id)).run();
    return result.changes > 0;
  }

  // Shared engine core
  getEngineModules(): EngineModule[] {
    return db.select().from(engineModules).orderBy(engineModules.name).all();
  }

  createEngineModule(data: InsertEngineModule): EngineModule {
    const now = new Date().toISOString();
    const module = db.insert(engineModules).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();

    for (const dealership of this.getDealerships()) {
      db.insert(accountModules).values({
        dealershipId: dealership.id,
        moduleKey: module.key,
        isEnabled: true,
        settings: "{}",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing().run();
    }

    return module;
  }

  getAccountModules(dealershipId?: number): AccountModule[] {
    if (dealershipId) {
      return db.select().from(accountModules).where(eq(accountModules.dealershipId, dealershipId)).all();
    }
    return db.select().from(accountModules).all();
  }

  upsertAccountModule(data: InsertAccountModule): AccountModule {
    const now = new Date().toISOString();
    const existing = db.select().from(accountModules).where(and(
      eq(accountModules.dealershipId, data.dealershipId),
      eq(accountModules.moduleKey, data.moduleKey),
    )).get();

    if (existing) {
      return db.update(accountModules).set({
        isEnabled: data.isEnabled,
        settings: data.settings,
        updatedAt: now,
      }).where(eq(accountModules.id, existing.id)).returning().get();
    }

    return db.insert(accountModules).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  getEngineJobs(limit = 25): EngineJob[] {
    return db.select().from(engineJobs).orderBy(desc(engineJobs.createdAt)).limit(limit).all();
  }

  createEngineJob(data: InsertEngineJob): EngineJob {
    const now = new Date().toISOString();
    return db.insert(engineJobs).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  updateEngineJob(id: number, data: Partial<InsertEngineJob>): EngineJob | undefined {
    return db.update(engineJobs).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(engineJobs.id, id)).returning().get();
  }

  getEngineSources(): EngineSource[] {
    return db.select().from(engineSources).orderBy(engineSources.moduleKey, engineSources.name).all();
  }

  createEngineSource(data: InsertEngineSource): EngineSource {
    const now = new Date().toISOString();
    return db.insert(engineSources).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  updateEngineSourceByKey(key: string, data: Partial<InsertEngineSource>): EngineSource | undefined {
    return db.update(engineSources).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(engineSources.key, key)).returning().get();
  }

  getOfferReviews(filters?: { status?: string; moduleKey?: string; sourceKey?: string; limit?: number }): OfferReview[] {
    const conditions = [];
    if (filters?.status) conditions.push(eq(offerReviews.status, filters.status));
    if (filters?.moduleKey) conditions.push(eq(offerReviews.moduleKey, filters.moduleKey));
    if (filters?.sourceKey) conditions.push(eq(offerReviews.sourceKey, filters.sourceKey));

    if (conditions.length > 0) {
      return db.select()
        .from(offerReviews)
        .where(and(...conditions))
        .orderBy(desc(offerReviews.updatedAt), desc(offerReviews.createdAt))
        .limit(filters?.limit ?? 50)
        .all();
    }

    return db.select()
      .from(offerReviews)
      .orderBy(desc(offerReviews.updatedAt), desc(offerReviews.createdAt))
      .limit(filters?.limit ?? 50)
      .all();
  }

  getOfferReview(id: number): OfferReview | undefined {
    return db.select().from(offerReviews).where(eq(offerReviews.id, id)).get();
  }

  createOfferReview(data: InsertOfferReview): OfferReview {
    const now = new Date().toISOString();
    return db.insert(offerReviews).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  updateOfferReview(id: number, data: Partial<InsertOfferReview>): OfferReview | undefined {
    return db.update(offerReviews).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(offerReviews.id, id)).returning().get();
  }

  getOfferReviewStats() {
    const all = db.select().from(offerReviews).all();
    return {
      total: all.length,
      detected: all.filter((review) => review.status === "detected").length,
      reviewing: all.filter((review) => review.status === "reviewing").length,
      approved: all.filter((review) => review.status === "approved").length,
      rejected: all.filter((review) => review.status === "rejected").length,
      published: all.filter((review) => review.status === "published").length,
    };
  }

  // App settings
  getAppSetting(key: string): string | undefined {
    const row = sqlite.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as { value?: string } | undefined;
    return row?.value;
  }

  setAppSetting(key: string, value: string): void {
    sqlite.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, new Date().toISOString());
  }

  // Activity
  getActivityLog(limit = 20): ActivityLog[] {
    return db.select().from(activityLog).orderBy(desc(activityLog.createdAt)).limit(limit).all();
  }

  logActivity(data: InsertActivityLog): ActivityLog {
    return db.insert(activityLog).values({
      ...data,
      createdAt: new Date().toISOString(),
    }).returning().get();
  }
}

export const storage = new DatabaseStorage();
