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
  offerReviewTargets,
  offerReviewDownstreamUses,
  contentEngineBuildManifestEntries,
  emailIterationSetups,
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
  type OfferReviewTarget,
  type InsertOfferReviewTarget,
  type OfferReviewDownstreamUse,
  type InsertOfferReviewDownstreamUse,
  type ContentEngineBuildManifestEntry,
  type InsertContentEngineBuildManifestEntry,
  type EmailIterationSetup,
  type InsertEmailIterationSetup,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql } from "drizzle-orm";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { homedir } from "os";
import path from "path";
import { buildSeededEmailIterationDefinitions } from "./email-iteration-config";
import { sanitizeLegacyCaption } from "./post-sanitizer";

function resolveDatabasePath() {
  const configuredPath = process.env.POSTENGINE_DB_PATH?.trim();
  if (configuredPath) {
    const absoluteConfiguredPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
    mkdirSync(path.dirname(absoluteConfiguredPath), { recursive: true });
    return absoluteConfiguredPath;
  }

  const appDataDir = path.join(homedir(), ".postengine");
  const appDataDbPath = path.join(appDataDir, "sqlite.db");
  const legacyRepoDbPath = path.resolve(process.cwd(), "sqlite.db");

  mkdirSync(appDataDir, { recursive: true });

  if (!existsSync(appDataDbPath) && existsSync(legacyRepoDbPath)) {
    copyFileSync(legacyRepoDbPath, appDataDbPath);
    console.log(`[storage] Seeded database at ${appDataDbPath} from legacy repo sqlite.db`);
  }

  return appDataDbPath;
}

export const DATABASE_PATH = resolveDatabasePath();
const sqlite = new Database(DATABASE_PATH);
const db = drizzle(sqlite);

const DUPLICATE_FOLDER_SOURCE_INDEX = "idx_posts_dealership_folder_source_unique";

export class DuplicateFolderSourceError extends Error {
  constructor(folderSource?: string | null) {
    super(folderSource
      ? `A post already exists for Drive source "${folderSource}" in this dealership.`
      : "A post already exists for this Drive source in this dealership.");
    this.name = "DuplicateFolderSourceError";
  }
}

export function isDuplicateFolderSourceError(error: unknown): error is DuplicateFolderSourceError {
  return error instanceof DuplicateFolderSourceError;
}

function normalizeFolderSource(folderSource?: string | null) {
  const normalized = folderSource?.trim();
  return normalized ? normalized : null;
}

function isSqliteDuplicateFolderSourceError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.message.includes(`UNIQUE constraint failed: posts.dealership_id, posts.folder_source`) ||
    error.message.includes(DUPLICATE_FOLDER_SOURCE_INDEX);
}

function ensureFolderSourceUnique(dealershipId: number, folderSource: string, excludePostId?: number) {
  const existing = db.select({ id: posts.id })
    .from(posts)
    .where(and(
      eq(posts.dealershipId, dealershipId),
      eq(posts.folderSource, folderSource),
    ))
    .get();

  if (existing && existing.id !== excludePostId) {
    throw new DuplicateFolderSourceError(folderSource);
  }
}

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
  getEngineSourceByKey(key: string): EngineSource | undefined;
  createEngineSource(data: InsertEngineSource): EngineSource;
  updateEngineSourceByKey(key: string, data: Partial<InsertEngineSource>): EngineSource | undefined;
  getOfferReviews(filters?: { status?: string; moduleKey?: string; sourceKey?: string; limit?: number }): OfferReview[];
  getOfferReview(id: number): OfferReview | undefined;
  getOfferReviewBySourceItemKey(sourceItemKey: string): OfferReview | undefined;
  createOfferReview(data: InsertOfferReview): OfferReview;
  upsertOfferReviewBySourceItemKey(sourceItemKey: string, data: InsertOfferReview): OfferReview;
  updateOfferReview(id: number, data: Partial<InsertOfferReview>): OfferReview | undefined;
  getOfferReviewTargets(offerReviewId?: number): OfferReviewTarget[];
  replaceOfferReviewTargets(offerReviewId: number, dealershipIds: number[]): OfferReviewTarget[];
  upsertOfferReviewTarget(data: InsertOfferReviewTarget): OfferReviewTarget;
  getOfferReviewDownstreamUses(offerReviewId?: number, dealershipId?: number): OfferReviewDownstreamUse[];
  replaceOfferReviewDownstreamUses(offerReviewId: number, dealershipId: number, uses: Array<{ channel: string; placement: string }>): OfferReviewDownstreamUse[];
  getContentEngineBuildManifestEntries(offerReviewId?: number): ContentEngineBuildManifestEntry[];
  replaceContentEngineBuildManifestEntriesForOfferReview(
    offerReviewId: number,
    entries: InsertContentEngineBuildManifestEntry[],
  ): ContentEngineBuildManifestEntry[];
  getEmailIterationSetups(): EmailIterationSetup[];
  updateEmailIterationSetup(id: number, data: Partial<InsertEmailIterationSetup>): EmailIterationSetup | undefined;
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
        publish_attempts INTEGER NOT NULL DEFAULT 0,
        last_publish_attempt_at TEXT,
        publish_backoff_until TEXT,
        publish_results TEXT,
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
        source_url TEXT,
        access_status TEXT NOT NULL DEFAULT 'unknown',
        preferred_rank INTEGER,
        update_window_days TEXT NOT NULL DEFAULT '[]',
        evidence_notes TEXT,
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
        source_item_key TEXT,
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

      CREATE TABLE IF NOT EXISTS offer_review_targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_review_id INTEGER NOT NULL,
        dealership_id INTEGER NOT NULL,
        selection_status TEXT NOT NULL DEFAULT 'selected',
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(offer_review_id, dealership_id)
      );

      CREATE TABLE IF NOT EXISTS offer_review_downstream_uses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_review_id INTEGER NOT NULL,
        dealership_id INTEGER NOT NULL,
        channel TEXT NOT NULL,
        placement TEXT NOT NULL DEFAULT 'supporting',
        is_active INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(offer_review_id, dealership_id, channel)
      );

      CREATE TABLE IF NOT EXISTS content_engine_build_manifest_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        offer_review_id INTEGER NOT NULL,
        dealership_id INTEGER NOT NULL,
        channel TEXT NOT NULL,
        placement TEXT NOT NULL DEFAULT 'supporting',
        module_key TEXT NOT NULL DEFAULT 'content-engine',
        review_status TEXT NOT NULL DEFAULT 'approved',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(offer_review_id, dealership_id, channel)
      );

      CREATE TABLE IF NOT EXISTS email_iteration_setups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dealership_id INTEGER NOT NULL,
        campaign_key TEXT NOT NULL,
        campaign_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active-now',
        latest_base_email_reference_file TEXT,
        prior_reference_files TEXT NOT NULL DEFAULT '[]',
        month_label TEXT NOT NULL DEFAULT '',
        campaign_label TEXT NOT NULL DEFAULT '',
        offer_changes_notes TEXT NOT NULL DEFAULT '',
        photo_changes_notes TEXT NOT NULL DEFAULT '',
        theme_custom_block_notes TEXT NOT NULL DEFAULT '',
        cta_link_notes TEXT NOT NULL DEFAULT '',
        carryover_notes TEXT NOT NULL DEFAULT '',
        selected_offer_review_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(dealership_id, campaign_key)
      );
    `);

    const postColumns = sqlite.prepare(`PRAGMA table_info(posts)`).all() as Array<{ name: string }>;
    const postColumnNames = new Set(postColumns.map((col) => col.name));
    if (!postColumnNames.has("caption_facebook")) {
      sqlite.exec(`ALTER TABLE posts ADD COLUMN caption_facebook TEXT;`);
    }
    if (!postColumnNames.has("caption_gmb")) {
      sqlite.exec(`ALTER TABLE posts ADD COLUMN caption_gmb TEXT;`);
    }
    if (!postColumnNames.has("publish_attempts")) {
      sqlite.exec(`ALTER TABLE posts ADD COLUMN publish_attempts INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!postColumnNames.has("last_publish_attempt_at")) {
      sqlite.exec(`ALTER TABLE posts ADD COLUMN last_publish_attempt_at TEXT;`);
    }
    if (!postColumnNames.has("publish_backoff_until")) {
      sqlite.exec(`ALTER TABLE posts ADD COLUMN publish_backoff_until TEXT;`);
    }
    if (!postColumnNames.has("publish_results")) {
      sqlite.exec(`ALTER TABLE posts ADD COLUMN publish_results TEXT;`);
    }

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

    const engineSourceColumns = sqlite.prepare(`PRAGMA table_info(engine_sources)`).all() as Array<{ name: string }>;
    const engineSourceColumnNames = new Set(engineSourceColumns.map((col) => col.name));
    if (!engineSourceColumnNames.has("source_url")) {
      sqlite.exec(`ALTER TABLE engine_sources ADD COLUMN source_url TEXT;`);
    }
    if (!engineSourceColumnNames.has("access_status")) {
      sqlite.exec(`ALTER TABLE engine_sources ADD COLUMN access_status TEXT NOT NULL DEFAULT 'unknown';`);
    }
    if (!engineSourceColumnNames.has("preferred_rank")) {
      sqlite.exec(`ALTER TABLE engine_sources ADD COLUMN preferred_rank INTEGER;`);
    }
    if (!engineSourceColumnNames.has("update_window_days")) {
      sqlite.exec(`ALTER TABLE engine_sources ADD COLUMN update_window_days TEXT NOT NULL DEFAULT '[]';`);
    }
    if (!engineSourceColumnNames.has("evidence_notes")) {
      sqlite.exec(`ALTER TABLE engine_sources ADD COLUMN evidence_notes TEXT;`);
    }

    const offerReviewColumns = sqlite.prepare(`PRAGMA table_info(offer_reviews)`).all() as Array<{ name: string }>;
    const offerReviewColumnNames = new Set(offerReviewColumns.map((col) => col.name));
    if (!offerReviewColumnNames.has("source_item_key")) {
      sqlite.exec(`ALTER TABLE offer_reviews ADD COLUMN source_item_key TEXT;`);
    }

    const emailIterationColumns = sqlite.prepare(`PRAGMA table_info(email_iteration_setups)`).all() as Array<{ name: string }>;
    const emailIterationColumnNames = new Set(emailIterationColumns.map((col) => col.name));
    if (!emailIterationColumnNames.has("selected_offer_review_ids")) {
      sqlite.exec(`ALTER TABLE email_iteration_setups ADD COLUMN selected_offer_review_ids TEXT NOT NULL DEFAULT '[]';`);
    }

    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_review_targets_offer_dealer
      ON offer_review_targets (offer_review_id, dealership_id);
    `);

    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_review_downstream_uses_offer_dealer_channel
      ON offer_review_downstream_uses (offer_review_id, dealership_id, channel);
    `);

    sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_content_engine_build_manifest_offer_dealer_channel
      ON content_engine_build_manifest_entries (offer_review_id, dealership_id, channel);
    `);

    try {
      sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS ${DUPLICATE_FOLDER_SOURCE_INDEX}
        ON posts (dealership_id, folder_source)
        WHERE folder_source IS NOT NULL AND trim(folder_source) <> '';
      `);
    } catch (error) {
      console.warn(`[storage] Unable to create ${DUPLICATE_FOLDER_SOURCE_INDEX}:`, error);
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
    this.seedEmailIterationSetups();
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
    const now = new Date().toISOString();
    const seededSources: InsertEngineSource[] = [
      {
        key: "post-engine-drive-ingestion",
        moduleKey: "post-engine",
        name: "Post Engine Drive Ingestion",
        watcherType: "manual-scan",
        sourceType: "google-drive",
        status: "active",
        target: "Shared dealership Drive roots",
        sourceUrl: null,
        accessStatus: "internal",
        preferredRank: 1,
        updateWindowDays: JSON.stringify([]),
        evidenceNotes: "Existing live ingestion path for dealership creative assets; retained as-is.",
        cadenceMinutes: 30,
        lastCheckedAt: null,
        lastResultSummary: "Ready for manual scans via /api/drive/scan",
        metadata: JSON.stringify({ route: "/api/drive/scan", notes: "Preserves existing Post Engine ingestion flow." }),
      },
      {
        key: "bmw-offers-api",
        moduleKey: "content-engine",
        name: "BMW Offers API",
        watcherType: "api-poll",
        sourceType: "offers-api",
        status: "active",
        target: "BMW USA national new-vehicle offers structured feed",
        sourceUrl: "https://www.bmwusa.com/offers-api/current-offers/v2?bySeries=true",
        accessStatus: "reliable",
        preferredRank: 1,
        updateWindowDays: JSON.stringify([1, 2, 3, 4, 5]),
        evidenceNotes: "Preferred structured source. Wayback sampling suggests offer refreshes usually appear near the start of the month, commonly days 1-5; API had a 2026-05-02 snapshot.",
        cadenceMinutes: 1440,
        lastCheckedAt: null,
        lastResultSummary: "Vetted preferred BMW source; watcher not built yet",
        metadata: JSON.stringify({
          brand: "BMW",
          preferred: true,
          observedOn: "2026-05-08",
          observedValidity: "Live offers page said offers valid through June 01, 2026.",
          firstSeenSnapshotDays: [4, 3, 2, 1, 5, 1, 3, 5, 2],
        }),
      },
      {
        key: "bmw-offers-page",
        moduleKey: "content-engine",
        name: "BMW Offers Landing Page",
        watcherType: "page-reference",
        sourceType: "offers-page",
        status: "active",
        target: "BMW USA public specials/offers page",
        sourceUrl: "https://www.bmwusa.com/special-offers-new.html",
        accessStatus: "reference",
        preferredRank: 2,
        updateWindowDays: JSON.stringify([1, 2, 3, 4, 5]),
        evidenceNotes: "Secondary public reference page for verifying live offer windows. Observed on 2026-05-08 with page copy stating offers valid through June 01, 2026.",
        cadenceMinutes: 1440,
        lastCheckedAt: null,
        lastResultSummary: "Vetted BMW reference page; watcher not built yet",
        metadata: JSON.stringify({
          brand: "BMW",
          preferred: false,
          observedOn: "2026-05-08",
          observedValidity: "Offers valid through June 01, 2026.",
        }),
      },
      {
        key: "audi-offers-page",
        moduleKey: "content-engine",
        name: "Audi Offers Page",
        watcherType: "browser-needed",
        sourceType: "offers-page",
        status: "blocked",
        target: "Audi USA consumer offers landing page",
        sourceUrl: "https://www.audiusa.com/en/offers/",
        accessStatus: "blocked-403",
        preferredRank: 1,
        updateWindowDays: JSON.stringify([1, 2, 3, 4, 5, 6]),
        evidenceNotes: "Likely primary consumer offers page, but direct requests from this environment are currently blocked (403 Access Denied). Treat as browser-required / conditional until a browser fetch path exists.",
        cadenceMinutes: 1440,
        lastCheckedAt: null,
        lastResultSummary: "Vetted as likely source, but blocked in current environment",
        metadata: JSON.stringify({
          brand: "Audi",
          preferred: true,
          observedOn: "2026-05-08",
          blocker: "403 Access Denied from current environment",
          archiveUpdateWindow: "Wayback appearances often around days 1-6 with more noise than BMW.",
        }),
      },
      {
        key: "audi-financial-hub",
        moduleKey: "content-engine",
        name: "Audi Financial Services Offers Hub",
        watcherType: "page-reference",
        sourceType: "finance-program-page",
        status: "conditional",
        target: "Audi USA finance/program offers reference hub",
        sourceUrl: "https://www.audiusa.com/en/shopping-tools/financial-services-hub/offers-special-programs/",
        accessStatus: "conditional",
        preferredRank: 2,
        updateWindowDays: JSON.stringify([1, 2, 3, 4, 5, 6]),
        evidenceNotes: "Secondary/reference path for Audi offers and special programs. Useful fallback context, but not yet validated as a stable structured source in this environment.",
        cadenceMinutes: 1440,
        lastCheckedAt: null,
        lastResultSummary: "Reference source only; no watcher built yet",
        metadata: JSON.stringify({
          brand: "Audi",
          preferred: false,
          observedOn: "2026-05-08",
          notes: "Use as reference alongside browser-based checks for /en/offers/.",
        }),
      },
    ];

    for (const source of seededSources) {
      db.insert(engineSources).values({
        ...source,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: engineSources.key,
        set: {
          moduleKey: source.moduleKey,
          name: source.name,
          watcherType: source.watcherType,
          sourceType: source.sourceType,
          status: source.status,
          target: source.target,
          sourceUrl: source.sourceUrl ?? null,
          accessStatus: source.accessStatus,
          preferredRank: source.preferredRank ?? null,
          updateWindowDays: source.updateWindowDays,
          evidenceNotes: source.evidenceNotes ?? null,
          cadenceMinutes: source.cadenceMinutes ?? null,
          lastResultSummary: source.lastResultSummary ?? null,
          metadata: source.metadata,
          updatedAt: now,
        },
      }).run();
    }

    db.delete(engineSources).where(sql`${engineSources.key} in ('bmw-offers-watcher', 'audi-offers-watcher')`).run();
  }

  private seedEmailIterationSetups() {
    const dealershipIdByName = new Map(this.getDealerships().map((dealership) => [dealership.name, dealership.id]));
    const now = new Date().toISOString();

    for (const definition of buildSeededEmailIterationDefinitions()) {
      const dealershipId = dealershipIdByName.get(definition.dealershipName);
      if (!dealershipId) continue;

      db.insert(emailIterationSetups).values({
        dealershipId,
        campaignKey: definition.campaignKey,
        campaignType: definition.campaignType,
        status: definition.status,
        latestBaseEmailReferenceFile: definition.latestBaseEmailReferenceFile,
        priorReferenceFiles: JSON.stringify(definition.priorReferenceFiles),
        monthLabel: definition.monthLabel,
        campaignLabel: definition.campaignLabel,
        offerChangesNotes: definition.offerChangesNotes,
        photoChangesNotes: definition.photoChangesNotes,
        themeCustomBlockNotes: definition.themeCustomBlockNotes,
        ctaLinkNotes: definition.ctaLinkNotes,
        carryoverNotes: definition.carryoverNotes,
        selectedOfferReviewIds: "[]",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing().run();
    }
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
    const folderSource = normalizeFolderSource(data.folderSource);

    if (folderSource) {
      ensureFolderSourceUnique(data.dealershipId, folderSource);
    }

    try {
      return db.insert(posts).values({
        ...data,
        folderSource,
        createdAt: new Date().toISOString(),
      }).returning().get();
    } catch (error) {
      if (folderSource && isSqliteDuplicateFolderSourceError(error)) {
        throw new DuplicateFolderSourceError(folderSource);
      }
      throw error;
    }
  }

  updatePost(id: number, data: Partial<InsertPost>): Post | undefined {
    const needsFolderSourceCheck = typeof data.folderSource !== "undefined" || typeof data.dealershipId !== "undefined";
    if (needsFolderSourceCheck) {
      const existing = this.getPost(id);
      if (!existing) return undefined;

      const folderSource = normalizeFolderSource(
        typeof data.folderSource !== "undefined" ? data.folderSource : existing.folderSource,
      );
      if (folderSource) {
        ensureFolderSourceUnique(data.dealershipId ?? existing.dealershipId, folderSource, id);
      }

      const nextData = typeof data.folderSource !== "undefined"
        ? { ...data, folderSource }
        : data;

      return db.update(posts)
        .set(nextData)
        .where(eq(posts.id, id))
        .returning()
        .get();
    }

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
    return db.select().from(engineSources).orderBy(engineSources.moduleKey, engineSources.preferredRank, engineSources.name).all();
  }

  getEngineSourceByKey(key: string): EngineSource | undefined {
    return db.select().from(engineSources).where(eq(engineSources.key, key)).get();
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

  getOfferReviewBySourceItemKey(sourceItemKey: string): OfferReview | undefined {
    return db.select().from(offerReviews).where(eq(offerReviews.sourceItemKey, sourceItemKey)).get();
  }

  createOfferReview(data: InsertOfferReview): OfferReview {
    const now = new Date().toISOString();
    return db.insert(offerReviews).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  upsertOfferReviewBySourceItemKey(sourceItemKey: string, data: InsertOfferReview): OfferReview {
    const existing = this.getOfferReviewBySourceItemKey(sourceItemKey);
    if (existing) {
      return db.update(offerReviews).set({
        ...data,
        sourceItemKey,
        status: existing.status === "published" ? existing.status : data.status,
        updatedAt: new Date().toISOString(),
      }).where(eq(offerReviews.id, existing.id)).returning().get();
    }

    return this.createOfferReview({
      ...data,
      sourceItemKey,
    });
  }

  updateOfferReview(id: number, data: Partial<InsertOfferReview>): OfferReview | undefined {
    return db.update(offerReviews).set({
      ...data,
      updatedAt: new Date().toISOString(),
    }).where(eq(offerReviews.id, id)).returning().get();
  }

  getOfferReviewTargets(offerReviewId?: number): OfferReviewTarget[] {
    if (offerReviewId) {
      return db.select()
        .from(offerReviewTargets)
        .where(eq(offerReviewTargets.offerReviewId, offerReviewId))
        .orderBy(offerReviewTargets.dealershipId)
        .all();
    }

    return db.select()
      .from(offerReviewTargets)
      .orderBy(offerReviewTargets.offerReviewId, offerReviewTargets.dealershipId)
      .all();
  }

  upsertOfferReviewTarget(data: InsertOfferReviewTarget): OfferReviewTarget {
    const now = new Date().toISOString();
    const existing = db.select().from(offerReviewTargets).where(and(
      eq(offerReviewTargets.offerReviewId, data.offerReviewId),
      eq(offerReviewTargets.dealershipId, data.dealershipId),
    )).get();

    if (existing) {
      return db.update(offerReviewTargets).set({
        selectionStatus: data.selectionStatus,
        notes: data.notes,
        updatedAt: now,
      }).where(eq(offerReviewTargets.id, existing.id)).returning().get();
    }

    return db.insert(offerReviewTargets).values({
      ...data,
      createdAt: now,
      updatedAt: now,
    }).returning().get();
  }

  replaceOfferReviewTargets(offerReviewId: number, dealershipIds: number[]): OfferReviewTarget[] {
    db.delete(offerReviewTargets).where(eq(offerReviewTargets.offerReviewId, offerReviewId)).run();

    const uniqueDealershipIds = Array.from(new Set(dealershipIds.filter((id) => Number.isInteger(id) && id > 0)));
    return uniqueDealershipIds.map((dealershipId) => this.upsertOfferReviewTarget({
      offerReviewId,
      dealershipId,
      selectionStatus: "selected",
      notes: null,
    }));
  }

  getOfferReviewDownstreamUses(offerReviewId?: number, dealershipId?: number): OfferReviewDownstreamUse[] {
    if (offerReviewId && dealershipId) {
      return db.select()
        .from(offerReviewDownstreamUses)
        .where(and(
          eq(offerReviewDownstreamUses.offerReviewId, offerReviewId),
          eq(offerReviewDownstreamUses.dealershipId, dealershipId),
        ))
        .orderBy(offerReviewDownstreamUses.channel)
        .all();
    }

    if (offerReviewId) {
      return db.select()
        .from(offerReviewDownstreamUses)
        .where(eq(offerReviewDownstreamUses.offerReviewId, offerReviewId))
        .orderBy(offerReviewDownstreamUses.dealershipId, offerReviewDownstreamUses.channel)
        .all();
    }

    return db.select()
      .from(offerReviewDownstreamUses)
      .orderBy(offerReviewDownstreamUses.offerReviewId, offerReviewDownstreamUses.dealershipId, offerReviewDownstreamUses.channel)
      .all();
  }

  replaceOfferReviewDownstreamUses(offerReviewId: number, dealershipId: number, uses: Array<{ channel: string; placement: string }>): OfferReviewDownstreamUse[] {
    db.delete(offerReviewDownstreamUses).where(and(
      eq(offerReviewDownstreamUses.offerReviewId, offerReviewId),
      eq(offerReviewDownstreamUses.dealershipId, dealershipId),
    )).run();

    const now = new Date().toISOString();
    const uniqueUses = uses.filter((use, index, array) =>
      Boolean(use.channel) && Boolean(use.placement) && array.findIndex((entry) => entry.channel === use.channel) === index,
    );

    return uniqueUses.map((use) => db.insert(offerReviewDownstreamUses).values({
      offerReviewId,
      dealershipId,
      channel: use.channel,
      placement: use.placement,
      isActive: true,
      notes: null,
      createdAt: now,
      updatedAt: now,
    }).returning().get());
  }

  getContentEngineBuildManifestEntries(offerReviewId?: number): ContentEngineBuildManifestEntry[] {
    if (offerReviewId) {
      return db.select()
        .from(contentEngineBuildManifestEntries)
        .where(eq(contentEngineBuildManifestEntries.offerReviewId, offerReviewId))
        .orderBy(contentEngineBuildManifestEntries.dealershipId, contentEngineBuildManifestEntries.channel)
        .all();
    }

    return db.select()
      .from(contentEngineBuildManifestEntries)
      .orderBy(contentEngineBuildManifestEntries.dealershipId, contentEngineBuildManifestEntries.channel, contentEngineBuildManifestEntries.offerReviewId)
      .all();
  }

  replaceContentEngineBuildManifestEntriesForOfferReview(
    offerReviewId: number,
    entries: InsertContentEngineBuildManifestEntry[],
  ): ContentEngineBuildManifestEntry[] {
    const now = new Date().toISOString();
    return sqlite.transaction(() => {
      db.delete(contentEngineBuildManifestEntries)
        .where(eq(contentEngineBuildManifestEntries.offerReviewId, offerReviewId))
        .run();

      if (entries.length === 0) {
        return [];
      }

      return entries.map((entry) => db.insert(contentEngineBuildManifestEntries).values({
        ...entry,
        createdAt: now,
        updatedAt: now,
      }).returning().get());
    })();
  }

  getEmailIterationSetups(): EmailIterationSetup[] {
    return db.select()
      .from(emailIterationSetups)
      .orderBy(emailIterationSetups.status, emailIterationSetups.campaignType, emailIterationSetups.dealershipId)
      .all();
  }

  updateEmailIterationSetup(id: number, data: Partial<InsertEmailIterationSetup>): EmailIterationSetup | undefined {
    return db.update(emailIterationSetups)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(emailIterationSetups.id, id))
      .returning()
      .get();
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
