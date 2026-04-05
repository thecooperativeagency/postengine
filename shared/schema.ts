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
  captionTemplate: text("caption_template"), // AutoCaption-style rules as text
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
