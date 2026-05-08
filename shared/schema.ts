import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Dealerships
export const dealerships = sqliteTable("dealerships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  brand: text("brand").notNull(), // BMW, Audi, Porsche
  domain: text("domain").notNull(),
  location: text("location").notNull(),
  instagramHandle: text("instagram_handle"),
  facebookPage: text("facebook_page"),
  tiktokHandle: text("tiktok_handle"),
  instagramCta: text("instagram_cta"),
  facebookCta: text("facebook_cta"),
  gmbCta: text("gmb_cta"),
  captionSpec: text("caption_spec"), // dealership-specific caption instructions
  hashtagTemplate: text("hashtag_template"), // dealership default hashtag bank/rules
  gmbSpec: text("gmb_spec"), // dealership-specific GMB instructions
  facebookLink: text("facebook_link"), // optional link for Facebook posts
  gmbLink: text("gmb_link"), // optional link for GMB posts
  color: text("color").notNull().default("#01696F"), // brand accent color
});

export const insertDealershipSchema = createInsertSchema(dealerships).omit({ id: true });
export type InsertDealership = z.infer<typeof insertDealershipSchema>;
export type Dealership = typeof dealerships.$inferSelect;

// Social Posts
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealershipId: integer("dealership_id").notNull(),
  status: text("status").notNull().default("draft"), // draft, queued, scheduled, published, rejected
  postType: text("post_type").notNull().default("inventory"), // inventory, promo, lifestyle, announcement
  vehicleInfo: text("vehicle_info"), // e.g. "2026 BMW X5 M60"
  caption: text("caption"), // Instagram/Facebook caption
  captionFacebook: text("caption_facebook"), // Facebook caption (same as IG unless different)
  captionGmb: text("caption_gmb"), // Google My Business caption
  hashtags: text("hashtags"),
  ctaBlock: text("cta_block"), // dealership-specific CTA
  mediaUrls: text("media_urls"), // JSON array of URLs
  mediaType: text("media_type").default("image"), // image, video, carousel
  platforms: text("platforms").default('["instagram","facebook"]'), // JSON array
  scheduledFor: text("scheduled_for"), // ISO datetime
  publishedAt: text("published_at"),
  folderSource: text("folder_source"), // Drive folder path
  notes: text("notes"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertPostSchema = createInsertSchema(posts).omit({ id: true, createdAt: true });
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Post = typeof posts.$inferSelect;

// Post Cadence Settings
export const cadenceSettings = sqliteTable("cadence_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealershipId: integer("dealership_id").notNull(),
  postType: text("post_type").notNull(), // New Cars, Pre-Owned Cars, Service, Parts & Accessories
  daysOfWeek: text("days_of_week").notNull().default('[]'), // JSON array: ["monday","wednesday","friday"]
  postsPerDay: integer("posts_per_day").notNull().default(1),
  autoTime: integer("auto_time", { mode: "boolean" }).notNull().default(true), // let app pick best time
  manualTime: text("manual_time"), // e.g. "10:00" if autoTime is false
  platforms: text("platforms").notNull().default('["instagram","facebook","googlebusiness"]'), // JSON array
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertCadenceSchema = createInsertSchema(cadenceSettings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCadence = z.infer<typeof insertCadenceSchema>;
export type CadenceSetting = typeof cadenceSettings.$inferSelect;

// Activity log
export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id"),
  dealershipId: integer("dealership_id"),
  action: text("action").notNull(), // created, edited, approved, scheduled, published, rejected
  details: text("details"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLog.$inferSelect;

// Shared engine modules
export const engineModules = sqliteTable("engine_modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  route: text("route"),
  description: text("description"),
  status: text("status").notNull().default("active"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertEngineModuleSchema = createInsertSchema(engineModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEngineModule = z.infer<typeof insertEngineModuleSchema>;
export type EngineModule = typeof engineModules.$inferSelect;

export const accountModules = sqliteTable("account_modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dealershipId: integer("dealership_id").notNull(),
  moduleKey: text("module_key").notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  settings: text("settings").notNull().default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertAccountModuleSchema = createInsertSchema(accountModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAccountModule = z.infer<typeof insertAccountModuleSchema>;
export type AccountModule = typeof accountModules.$inferSelect;

export const engineJobs = sqliteTable("engine_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduleKey: text("module_key").notNull(),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("pending"),
  dealershipId: integer("dealership_id"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  summary: text("summary"),
  payload: text("payload"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertEngineJobSchema = createInsertSchema(engineJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEngineJob = z.infer<typeof insertEngineJobSchema>;
export type EngineJob = typeof engineJobs.$inferSelect;

export const engineSources = sqliteTable("engine_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  moduleKey: text("module_key").notNull(),
  name: text("name").notNull(),
  watcherType: text("watcher_type").notNull(),
  sourceType: text("source_type").notNull(),
  status: text("status").notNull().default("active"),
  target: text("target").notNull(),
  cadenceMinutes: integer("cadence_minutes"),
  lastCheckedAt: text("last_checked_at"),
  lastResultSummary: text("last_result_summary"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
});

export const insertEngineSourceSchema = createInsertSchema(engineSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEngineSource = z.infer<typeof insertEngineSourceSchema>;
export type EngineSource = typeof engineSources.$inferSelect;
