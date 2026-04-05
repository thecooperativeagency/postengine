import { dealerships, posts, activityLog, cadenceSettings, type Dealership, type InsertDealership, type Post, type InsertPost, type ActivityLog, type InsertActivityLog, type CadenceSetting, type InsertCadence } from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, and, sql } from "drizzle-orm";

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
        caption_template TEXT,
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
    `);

    // Seed dealerships if empty
    const count = db.select({ count: sql<number>`count(*)` }).from(dealerships).get();
    if (count && count.count === 0) {
      this.seedDealerships();
    }
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
        captionTemplate: "Click here --> @bmwofjackson then click the linkin.bio to browse and click on the link of this post.",
      },
      {
        name: "Brian Harris BMW",
        brand: "BMW",
        domain: "brianharrisbmw.com",
        location: "Baton Rouge, LA",
        instagramHandle: "@brianharrisbmw",
        facebookPage: "BrianHarrisBMW",
        color: "#1C69D4",
        captionTemplate: "Click here --> @brianharrisbmw then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Brian Harris BMW a 2024 Center of Excellence Dealer.",
      },
      {
        name: "Audi Baton Rouge",
        brand: "Audi",
        domain: "audibatonrouge.com",
        location: "Baton Rouge, LA",
        instagramHandle: "@audibatonrouge",
        facebookPage: "AudiBatonRouge",
        color: "#BB0A30",
        captionTemplate: "Click here --> @audibatonrouge then click the linkin.bio to browse and click on the link of this post.\n\nThank you for making Audi Baton Rouge your Magna Society Dealer.",
      },
      {
        name: "Harris Porsche",
        brand: "Porsche",
        domain: "harrisporsche.com",
        location: "Baton Rouge, LA",
        instagramHandle: "@harrisporsche",
        facebookPage: "HarrisPorsche",
        color: "#C8102E",
        captionTemplate: "Click here --> @harrisporsche then click the linkin.bio to browse and click on the link of this post.",
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

  // Dealerships
  getDealerships(): Dealership[] {
    return db.select().from(dealerships).all();
  }

  getDealership(id: number): Dealership | undefined {
    return db.select().from(dealerships).where(eq(dealerships.id, id)).get();
  }

  createDealership(data: InsertDealership): Dealership {
    return db.insert(dealerships).values(data).returning().get();
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
