/**
 * Drive Scanner — PostEngine
 * Cadence-aware weekly scanner.
 * Only pulls images needed to fill this week's cadence schedule.
 * On approval: moves image to _Archive folder.
 */

import { execSync } from "child_process";
import { storage, isDuplicateFolderSourceError } from "./storage";
import { generateCaption } from "./caption-writer";
import { hostImage } from "./media-host";
import fs from "fs";
import path from "path";
import {
  getAssetClassification,
  inferModelKeyFromText,
  isGenericMediaName,
} from "./asset-classifier";
import { findRecentVehicleDuplicate } from "./post-dedup";
import {
  buildSeriesFolderSource,
  groupCustomerMediaSeries,
  isCustomerMediaPostType,
  parseFolderSource,
  resolveSeriesMediaType,
  seriesAlreadyUsed,
} from "./customer-series";

const DRIVE_FOLDERS_PATH = path.join(process.cwd(), ".drive-folders.json");
const ACCOUNT = "lance@thecoopbrla.com";
const MAX_SUBFOLDER_DEPTH = 3;

interface DealershipFolders {
  id: number;
  root: string;
  folders: Record<string, string>;
}

interface DriveFolders {
  account: string;
  parentFolderId?: string;
  parentFolderName?: string;
  dealerships: Record<string, DealershipFolders>;
}

/** Media file discovered under a category folder (possibly nested). */
export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  /** Category folder id from .drive-folders.json (New Cars, Service, etc.) */
  categoryFolderId: string;
  /** Immediate parent folder id (category root or a model subfolder). */
  parentFolderId: string;
  /** Immediate parent folder name when nested; null at category root. */
  parentFolderName: string | null;
  /** Relative path under the category folder, e.g. "BMW x3" or "SUV/X5". */
  relativeFolderPath: string;
}

export function loadFolders(): DriveFolders {
  const raw = fs.readFileSync(DRIVE_FOLDERS_PATH, "utf-8");
  return JSON.parse(raw);
}

function gogCommand(args: string): any {
  try {
    const result = execSync(`gog ${args} --account ${ACCOUNT} --json --no-input`, {
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

function listFolderEntries(folderId: string): any[] {
  let pageToken: string | undefined;
  const allEntries: any[] = [];

  while (true) {
    const pageArg = pageToken ? ` --page=${pageToken}` : "";
    const result = gogCommand(`drive ls --parent=${folderId} --max=200${pageArg}`);
    if (!result) break;
    const files = Array.isArray(result) ? result : result.files || [];
    allEntries.push(...files);
    pageToken = Array.isArray(result) ? undefined : result.nextPageToken;
    if (!pageToken) break;
  }

  return allEntries;
}

function isDriveFolder(entry: any): boolean {
  return entry?.mimeType === "application/vnd.google-apps.folder";
}

function isDriveMedia(entry: any): boolean {
  const mime = entry?.mimeType || "";
  return mime.startsWith("image/") || mime.startsWith("video/");
}

function shouldSkipSubfolder(name: string): boolean {
  const n = (name || "").trim().toLowerCase();
  if (!n) return true;
  if (n.startsWith("_")) return true; // _Archive, _staging, etc.
  if (n === "archive" || n === "archives") return true;
  return false;
}

/** Skip junk / duplicate dump files that should never become posts. */
export function shouldSkipMediaFile(fileName: string): boolean {
  const base = (fileName || "").replace(/\.[^/.]+$/, "").trim().toLowerCase();
  if (!base) return true;
  // Drive "Copy of …" duplicates of already-used creative
  if (/^copy(\s+of)?\b/.test(base) || base.startsWith("copy of ")) return true;
  // Known dead assets Lance does not want recycled
  if (base.includes("neon") && base.includes("shield")) return true;
  if (base.includes("neon sign") && base.includes("service")) return true;
  return false;
}

/**
 * List media under a category folder, including model/subject subfolders.
 * Folder names travel with each file so camera-dump filenames can inherit identity.
 */
export function listFolder(folderId: string, maxDepth = MAX_SUBFOLDER_DEPTH): DriveMediaFile[] {
  const media: DriveMediaFile[] = [];

  const walk = (
    currentFolderId: string,
    parentFolderName: string | null,
    relativeFolderPath: string,
    depth: number,
  ) => {
    const entries = listFolderEntries(currentFolderId);

    for (const entry of entries) {
      if (isDriveFolder(entry)) {
        if (depth >= maxDepth) continue;
        if (shouldSkipSubfolder(entry.name || "")) continue;
        const childName = (entry.name || "").trim();
        const nextPath = relativeFolderPath ? `${relativeFolderPath}/${childName}` : childName;
        walk(entry.id, childName, nextPath, depth + 1);
        continue;
      }

      if (!isDriveMedia(entry)) continue;

      media.push({
        id: entry.id,
        name: entry.name,
        mimeType: entry.mimeType,
        categoryFolderId: folderId,
        parentFolderId: currentFolderId,
        parentFolderName,
        relativeFolderPath,
      });
    }
  };

  walk(folderId, null, "", 0);
  return media;
}

export function moveFile(fileId: string, targetFolderId: string): boolean {
  try {
    execSync(`gog drive move ${fileId} --parent=${targetFolderId} --account ${ACCOUNT} --no-input`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return true;
  } catch (e) {
    console.error(`[DriveScanner] Failed to move file ${fileId}:`, e);
    return false;
  }
}

/** Clean a free-text label (file base or folder name) into caption-ready vehicleInfo. */
export function parseFileName(fileName: string): string {
  let name = fileName.replace(/\.[^/.]+$/, "");
  name = name.replace(/[-_/]/g, " ").replace(/\s+/g, " ").trim();
  // Drop camera/lot serials and dump noise so they never hit captions.
  name = name
    .replace(/\bcopy\s+of\b/gi, " ")
    .replace(/\b_?\d{2}[a-z]\d{3,}\b/gi, " ") // 33A9398 / _33A9398
    .replace(/\b(?:img|dsc|dcim|pxl|mvimg|photo)[-_\s]?\d+\b/gi, " ")
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Trailing bare frame counters: "... louisiana 12" / "... siana 7"
  name = name.replace(/\s[-_]?\d{1,3}$/g, "").trim();
  return name;
}

/**
 * Final caption-facing vehicle label: title case + strip leftover serials.
 */
export function cleanVehicleInfoLabel(raw: string): string {
  const cleaned = parseFileName(raw.includes(".") ? raw : `${raw}.jpg`);
  return titleCaseWords(cleaned || "Vehicle");
}

function titleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word)) return word.toUpperCase();
      if (["bmw", "audi", "porsche", "suv", "ev"].includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      if (/^[qsamxr]\d/i.test(word) || /^[a-z]\d+$/i.test(word)) return word.toUpperCase();
      if (word.length <= 3 && /[a-z]/i.test(word) && /\d/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Resolve vehicle/subject identity from filename and/or parent folder name.
 * Rule: named photos win; generic camera dumps inherit the containing folder name.
 */
export function resolveVehicleInfo(
  fileName: string,
  folderName?: string | null,
  folderPath?: string | null,
): { vehicleInfo: string; identitySource: "filename" | "folder" | "filename+folder" } {
  const folderLabel = (folderPath || folderName || "").trim();
  const fromFile = parseFileName(fileName);
  const fromFolder = folderLabel ? parseFileName(folderLabel.split("/").pop() || folderLabel) : "";

  const fileModel = inferModelKeyFromText(fileName);
  const folderModel = fromFolder ? inferModelKeyFromText(fromFolder) : "unknown";
  const fileIsGeneric = isGenericMediaName(fileName);

  // Strong filename (descriptive + preferably model-bearing)
  if (!fileIsGeneric && fromFile) {
    if (fileModel !== "unknown") {
      return { vehicleInfo: cleanVehicleInfoLabel(fromFile), identitySource: "filename" };
    }
    // Descriptive non-model file (service lounge, lifestyle) still wins over folder
    if (!fromFolder || folderModel === "unknown") {
      return { vehicleInfo: cleanVehicleInfoLabel(fromFile), identitySource: "filename" };
    }
  }

  // Camera dump or weak filename → folder is the car/subject
  if (fromFolder) {
    const cleaned = cleanVehicleInfoLabel(fromFolder);
    if (fileIsGeneric || fileModel === "unknown") {
      return { vehicleInfo: cleaned, identitySource: "folder" };
    }
    // Both contribute
    return {
      vehicleInfo: cleaned,
      identitySource: "filename+folder",
    };
  }

  return {
    vehicleInfo: cleanVehicleInfoLabel(fromFile || "Vehicle"),
    identitySource: fileIsGeneric ? "filename" : "filename",
  };
}

function classifyAssetPostType(basePostType: string, _vehicleInfo: string, _dealershipBrand?: string): string {
  return basePostType;
}

function shuffleArray<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function scoreAssetDiversity(
  file: any,
  selected: any[],
  allCandidates: any[],
): number {
  const modelKey = file.classification?.modelKey || "unknown";
  const lookBucket = file.classification?.lookBucket || "unknown";
  const shotType = file.classification?.shotType || "unknown";
  const shootCluster = file.classification?.shootCluster || "unknown-cluster";

  const modelCount = selected.filter((item) => (item.classification?.modelKey || "unknown") === modelKey).length;
  const lookCount = selected.filter((item) => (item.classification?.lookBucket || "unknown") === lookBucket).length;
  const shotCount = selected.filter((item) => (item.classification?.shotType || "unknown") === shotType).length;
  const clusterCount = selected.filter((item) => (item.classification?.shootCluster || "unknown-cluster") === shootCluster).length;

  const candidateModelCount = allCandidates.filter((item) => (item.classification?.modelKey || "unknown") === modelKey).length;
  const rarityBoost = candidateModelCount > 0 ? 1 / candidateModelCount : 0;
  const unknownPenalty = modelKey === "unknown" ? 100 : 0;

  return (clusterCount * 10000) + (modelCount * 2000) + (lookCount * 200) + (shotCount * 80) + unknownPenalty - rarityBoost;
}

function normalizeModelBucket(modelKey: string): string[] {
  if (!modelKey || modelKey === "unknown") return ["unknown"];
  return modelKey.split("+").map((part) => part.trim()).filter(Boolean);
}

function bucketByModel(files: any[]): Map<string, any[]> {
  const buckets = new Map<string, any[]>();
  for (const file of files) {
    const modelKeys = normalizeModelBucket(file.classification?.modelKey || "unknown");
    const primaryKey = modelKeys[0] || "unknown";
    const existing = buckets.get(primaryKey) || [];
    existing.push(file);
    buckets.set(primaryKey, existing);
  }
  return buckets;
}

function takeBestFromBucket(bucket: any[], selected: any[], allCandidates: any[]): any | null {
  if (bucket.length === 0) return null;
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < bucket.length; i++) {
    const score = scoreAssetDiversity(bucket[i], selected, allCandidates);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bucket.splice(bestIndex, 1)[0];
}

export function selectDiverseFiles(files: any[], count: number): any[] {
  const selected: any[] = [];
  const remaining = shuffleArray(files);
  const usedModelBuckets = new Set<string>();
  const usedClusters = new Set<string>();
  const usedLooks = new Set<string>();
  const usedShots = new Set<string>();

  while (selected.length < count && remaining.length > 0) {
    const fullyFresh = remaining.filter((file) => {
      const model = normalizeModelBucket(file.classification?.modelKey || "unknown")[0] || "unknown";
      const cluster = file.classification?.shootCluster || "unknown-cluster";
      const look = file.classification?.lookBucket || "unknown";
      const shot = file.classification?.shotType || "unknown";
      return !usedModelBuckets.has(model) && !usedClusters.has(cluster) && !usedLooks.has(look) && !usedShots.has(shot);
    });

    const freshModelAndCluster = remaining.filter((file) => {
      const model = normalizeModelBucket(file.classification?.modelKey || "unknown")[0] || "unknown";
      const cluster = file.classification?.shootCluster || "unknown-cluster";
      return !usedModelBuckets.has(model) && !usedClusters.has(cluster);
    });

    const freshCluster = remaining.filter((file) => {
      const cluster = file.classification?.shootCluster || "unknown-cluster";
      return !usedClusters.has(cluster);
    });

    const candidatePool = fullyFresh.length > 0
      ? fullyFresh
      : freshModelAndCluster.length > 0
        ? freshModelAndCluster
        : freshCluster;

    if (candidatePool.length === 0) {
      break;
    }

    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < candidatePool.length; i++) {
      const score = scoreAssetDiversity(candidatePool[i], selected, files);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    const chosen = candidatePool[bestIndex];
    const chosenIndex = remaining.findIndex((file) => file.id === chosen.id);
    if (chosenIndex === -1) break;

    selected.push(remaining.splice(chosenIndex, 1)[0]);
    const model = normalizeModelBucket(chosen.classification?.modelKey || "unknown")[0] || "unknown";
    const cluster = chosen.classification?.shootCluster || "unknown-cluster";
    const look = chosen.classification?.lookBucket || "unknown";
    const shot = chosen.classification?.shotType || "unknown";
    usedModelBuckets.add(model);
    usedClusters.add(cluster);
    usedLooks.add(look);
    usedShots.add(shot);
  }

  return selected;
}

export function isVideoMedia(file: { mimeType?: string | null; mediaType?: string | null }): boolean {
  if (file.mediaType === "video") return true;
  return Boolean(file.mimeType?.startsWith("video/"));
}

/**
 * How many Reel/video slots remain for this cadence rule in the current window.
 * Caps at total open slots so we never over-allocate.
 */
export function getReelSlotsToFill(args: {
  reelsEnabled?: boolean | null;
  reelsPerWeek?: number | null;
  weeksWindow: number;
  existingVideoPostsInWindow: number;
  openSlots: number;
}): number {
  if (!args.reelsEnabled) return 0;
  const weekly = Math.max(0, Math.trunc(args.reelsPerWeek || 0));
  if (weekly <= 0 || args.openSlots <= 0) return 0;
  const target = weekly * Math.max(1, args.weeksWindow);
  const remaining = Math.max(0, target - Math.max(0, args.existingVideoPostsInWindow));
  return Math.min(args.openSlots, remaining);
}

/**
 * Fill cadence slots with a video/Reel floor first, then images.
 * If not enough good videos, remaining slots fall back to images.
 */
export function selectFilesForCadenceSlots(
  classifiedFiles: any[],
  totalSlots: number,
  reelSlots: number,
): any[] {
  if (totalSlots <= 0) return [];
  const videos = classifiedFiles.filter((file) => isVideoMedia(file));
  const images = classifiedFiles.filter((file) => !isVideoMedia(file));
  const desiredReels = Math.max(0, Math.min(totalSlots, reelSlots));

  const selectedVideos = selectDiverseFiles(videos, desiredReels);
  const remainingSlots = totalSlots - selectedVideos.length;
  const selectedImages = selectDiverseFiles(images, remainingSlots);

  // If still short (no images either), try leftover videos beyond the reel floor.
  const combined = [...selectedVideos, ...selectedImages];
  if (combined.length < totalSlots) {
    const usedIds = new Set(combined.map((f) => f.id));
    const leftoverVideos = videos.filter((f) => !usedIds.has(f.id));
    combined.push(...selectDiverseFiles(leftoverVideos, totalSlots - combined.length));
  }

  return combined.slice(0, totalSlots);
}

function buildCaption(
  dealershipName: string,
  postType: string,
  vehicleInfo: string,
  ctaTemplate: string | null
): string {
  const typeIntros: Record<string, string> = {
    "New Cars": `Introducing the ${vehicleInfo}. ✨`,
    "Pre-Owned Cars": `Now available: ${vehicleInfo}. 🚗`,
    "Service": `${vehicleInfo} — keeping your vehicle running at its best. 🔧`,
    "Parts & Accessories": `${vehicleInfo} — now available. 🛒`,
  };
  const intro = typeIntros[postType] || `${vehicleInfo}.`;
  const cta = ctaTemplate || "";
  return `${intro}\n\n${cta}`.trim();
}

export function getOpenReplacementSlots(
  activeScheduledDates: Array<string | null | undefined>,
  rejectedScheduledDates: Array<string | null | undefined>,
): string[] {
  const activeDateSet = new Set(activeScheduledDates.filter((value): value is string => Boolean(value)));
  const rejectedDateSet = new Set(rejectedScheduledDates.filter((value): value is string => Boolean(value)));

  return Array.from(rejectedDateSet)
    .filter((date) => !activeDateSet.has(date))
    .sort();
}

export function getOpenCadenceDates(
  candidateDates: Array<string | null | undefined>,
  activeScheduledDates: Array<string | null | undefined>,
): string[] {
  const activeDateSet = new Set(activeScheduledDates.filter((value): value is string => Boolean(value)));

  return candidateDates
    .filter((value): value is string => Boolean(value))
    .filter((date) => !activeDateSet.has(date));
}

export function createQueuedDrivePost(
  post: Parameters<typeof storage.createPost>[0],
  context: { dealershipName: string; postType: string; folderSource: string },
): boolean {
  const duplicate = findRecentVehicleDuplicate(
    {
      dealershipId: post.dealershipId,
      vehicleInfo: post.vehicleInfo ?? null,
      status: post.status || "queued",
      scheduledFor: post.scheduledFor ?? null,
      publishedAt: post.publishedAt ?? null,
    },
    storage.getPosts({ dealershipId: post.dealershipId }),
  );
  if (duplicate) {
    console.warn(
      `[DriveScanner] Skipping recent duplicate vehicle for ${context.dealershipName} / ${context.postType}: ${post.vehicleInfo} (matches post ${duplicate.id})`,
    );
    return false;
  }

  try {
    storage.createPost(post);
    return true;
  } catch (error) {
    if (isDuplicateFolderSourceError(error)) {
      console.warn(`[DriveScanner] Skipping duplicate source for ${context.dealershipName} / ${context.postType}: ${context.folderSource}`);
      return false;
    }
    throw error;
  }
}

/**
 * Get the next N schedule dates for a cadence rule starting from today.
 */
function getNextScheduleDates(daysOfWeek: string[], count: number, autoTime: boolean, manualTime: string | null): string[] {
  const dayMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };

  // Best posting times per post type
  const defaultTime = "10:00";
  const timeStr = autoTime ? defaultTime : (manualTime || defaultTime);
  const [hours, minutes] = timeStr.split(":").map(Number);

  const dates: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Look ahead up to 14 days to find N slots
  for (let daysAhead = 1; daysAhead <= 14 && dates.length < count; daysAhead++) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + daysAhead);
    const dayName = Object.keys(dayMap).find(k => dayMap[k] === candidate.getDay());

    if (dayName && daysOfWeek.includes(dayName)) {
      candidate.setHours(hours, minutes, 0, 0);
      dates.push(candidate.toISOString());
    }
  }

  return dates;
}

/**
 * Main cadence-aware scan.
 * Calculates how many posts each dealership/type needs across the requested week window,
 * then pulls exactly that many images from Drive.
 */
export async function scanDriveFolders(weeks = 1): Promise<number> {
  const weeksWindow = Math.min(4, Math.max(1, Math.trunc(weeks || 1)));
  const config = loadFolders();
  const dealerships = storage.getDealerships();
  const allCadence = storage.getCadenceSettings();
  let newPostsCreated = 0;

  for (const [dealershipName, folderConfig] of Object.entries(config.dealerships)) {
    const dealership = dealerships.find(d => d.id === folderConfig.id);
    if (!dealership) continue;

    // Get cadence rules for this dealership
    const cadenceRules = allCadence.filter(c => c.dealershipId === dealership.id && c.isActive);

    for (const rule of cadenceRules) {
      const postType = rule.postType;
      const folderId = folderConfig.folders[postType];
      if (!folderId) continue;

      const days = JSON.parse(rule.daysOfWeek) as string[];
      if (days.length === 0) continue;

      // How many posts does this rule need this week?
      const postsNeeded = days.length * rule.postsPerDay * weeksWindow;

      // How many are already scheduled/queued for this dealership + type this week?
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const weekEndExclusive = new Date(weekStart);
      weekEndExclusive.setDate(weekStart.getDate() + (7 * weeksWindow) + 1);

      const activeStatuses = ["draft", "queued", "scheduled"];
      const dealershipActiveThisWeek = storage.getPosts({
        dealershipId: dealership.id,
      }).filter(p =>
        activeStatuses.includes(p.status) &&
        p.scheduledFor &&
        new Date(p.scheduledFor) >= weekStart &&
        new Date(p.scheduledFor) < weekEndExclusive
      );

      const existingThisWeek = dealershipActiveThisWeek.filter((post) => post.postType === postType);

      const rejectedThisWeek = storage.getPosts({
        dealershipId: dealership.id,
        postType,
      }).filter(p =>
        p.status === "rejected" &&
        p.scheduledFor &&
        new Date(p.scheduledFor) >= weekStart &&
        new Date(p.scheduledFor) < weekEndExclusive
      );

      const cadenceDates = getNextScheduleDates(days, postsNeeded, rule.autoTime, rule.manualTime);
      const openCadenceDates = getOpenCadenceDates(
        cadenceDates,
        dealershipActiveThisWeek.map((post) => post.scheduledFor),
      );
      const replacementSlots = getOpenReplacementSlots(
        dealershipActiveThisWeek.map((post) => post.scheduledFor),
        rejectedThisWeek.map((post) => post.scheduledFor),
      ).filter((date) => cadenceDates.includes(date));
      const slotsToFill = openCadenceDates.length;
      const replacementMode = replacementSlots.length > 0;
      if (slotsToFill === 0 && !replacementMode) {
        console.log(`[DriveScanner] ${dealershipName} / ${postType}: No open cadence slots in the next ${weeksWindow} week(s), skipping.`);
        continue;
      }

      // Get existing source files to avoid duplicates
      const existingPosts = storage.getPosts({ dealershipId: dealership.id });
      const existingSourceFiles = new Set(existingPosts.map(p => p.folderSource).filter(Boolean));

      // List available media in the category folder AND model/subject subfolders
      const allFiles = listFolder(folderId);
      const nestedCount = allFiles.filter((f) => Boolean(f.relativeFolderPath)).length;

      const talkingPoints =
        storage.getAppSetting(`caption_talking_points.${dealership.id}`) ||
        storage.getAppSetting("caption_talking_points") ||
        "";
      const instagramCta = (dealership as any).instagramCta || (dealership as any).captionTemplate || "";
      const targetCount = replacementMode ? replacementSlots.length : slotsToFill;
      const schedulePool = replacementMode ? replacementSlots : openCadenceDates;

      // ── Customer Media: group same-customer assets into one swipe/carousel post ──
      if (isCustomerMediaPostType(postType)) {
        const seriesList = groupCustomerMediaSeries(allFiles).filter(
          (series) => !seriesAlreadyUsed(folderId, series, existingSourceFiles),
        );

        console.log(
          `[DriveScanner] ${dealershipName} / ${postType}: found ${allFiles.length} files → ${seriesList.length} unused customer series (${nestedCount} nested), ${existingThisWeek.length} active in-type this week, ${openCadenceDates.length} open cadence slots.`,
        );

        if (seriesList.length === 0) {
          console.log(`[DriveScanner] ${dealershipName} / ${postType}: No new customer series available (need ${targetCount}).`);
          continue;
        }

        // Prefer fuller sets (more slides) then stable label order
        const ranked = [...seriesList].sort((a, b) => {
          if (b.files.length !== a.files.length) return b.files.length - a.files.length;
          return a.label.localeCompare(b.label);
        });
        const seriesToUse = ranked.slice(0, targetCount);
        const scheduleDates = schedulePool.slice(0, seriesToUse.length);

        for (let i = 0; i < seriesToUse.length; i++) {
          const series = seriesToUse[i];
          const vehicleInfo = series.label;
          const mediaType = resolveSeriesMediaType(series.files);
          const folderSource = buildSeriesFolderSource(
            folderId,
            series.key,
            series.files.map((f) => f.id),
          );

          const captionBase = {
            dealershipName,
            brand: dealership.brand,
            postType: "Customer Media",
            vehicleInfo,
            captionSpec: (dealership as any).captionSpec,
            gmbSpec: (dealership as any).gmbSpec,
            talkingPoints: talkingPoints || null,
          };
          const captionIG = await generateCaption({ ...captionBase, platform: "instagram", tone: "punchy" });
          const captionFB = await generateCaption({ ...captionBase, platform: "facebook", tone: "punchy" });
          const captionGMB = await generateCaption({ ...captionBase, platform: "googlebusiness", tone: "professional" });

          const hostedUrls: string[] = [];
          for (const file of series.files) {
            const publicUrl = await hostImage(file.id, file.name, file.mimeType || undefined);
            hostedUrls.push(
              publicUrl ||
                `https://drive.usercontent.google.com/download?id=${file.id}&export=download`,
            );
          }

          const scheduledFor = scheduleDates[i] || null;
          const fileNames = series.files.map((f) => f.name).join(", ");

          const created = createQueuedDrivePost(
            {
              dealershipId: dealership.id,
              status: "queued",
              postType: "Customer Media",
              vehicleInfo,
              caption: captionIG,
              captionFacebook: captionFB,
              captionGmb: captionGMB,
              hashtags: null,
              ctaBlock: instagramCta,
              mediaUrls: JSON.stringify(hostedUrls),
              mediaType,
              platforms: rule.platforms,
              scheduledFor,
              publishedAt: null,
              folderSource,
              notes: `Auto-imported customer series: ${dealershipName} / ${series.files.length} assets (${mediaType}) — ${fileNames}`,
            },
            {
              dealershipName,
              postType,
              folderSource,
            },
          );
          if (!created) continue;

          newPostsCreated++;
          console.log(
            `[DriveScanner] Created customer series post: ${dealershipName} / ${vehicleInfo} (${series.files.length} slides, ${mediaType}) → ${scheduledFor || "unscheduled"}`,
          );
        }
        continue;
      }

      const newFiles = allFiles.filter(
        (f) => !existingSourceFiles.has(`${folderId}/${f.id}`) && !shouldSkipMediaFile(f.name),
      );

      console.log(`[DriveScanner] ${dealershipName} / ${postType}: found ${allFiles.length} files (${nestedCount} in subfolders), ${existingSourceFiles.size} used, ${newFiles.length} eligible, ${existingThisWeek.length} active in-type this week, ${dealershipActiveThisWeek.length} active dealership-wide this week, ${rejectedThisWeek.length} rejected this week, ${openCadenceDates.length} open cadence slots.`);

      if (newFiles.length === 0) {
        console.log(`[DriveScanner] ${dealershipName} / ${postType}: No new images available (need ${replacementMode ? replacementSlots.length : slotsToFill}).`);
        continue;
      }

      const classifiedFiles = await Promise.all(
        newFiles.map(async (file) => ({
          ...file,
          classification: await getAssetClassification({
            id: file.id,
            name: file.name,
            folderName: file.parentFolderName,
            folderPath: file.relativeFolderPath,
          }),
        }))
      );

      const existingVideoPostsInWindow = existingThisWeek.filter((post) => post.mediaType === "video").length;
      const availableVideos = classifiedFiles.filter((file) => isVideoMedia(file)).length;
      const reelSlots = getReelSlotsToFill({
        reelsEnabled: Boolean((rule as any).reelsEnabled),
        reelsPerWeek: Number((rule as any).reelsPerWeek || 0),
        weeksWindow,
        existingVideoPostsInWindow,
        openSlots: targetCount,
      });
      const filesToUse = selectFilesForCadenceSlots(classifiedFiles, targetCount, reelSlots);
      console.log(
        `[DriveScanner] ${dealershipName} / ${postType}: selecting ${filesToUse.length}/${targetCount} (reel slots ${reelSlots}, available videos ${availableVideos}, existing videos this window ${existingVideoPostsInWindow}).`,
      );

      // Get proposed schedule dates for reviewer visibility; approval moves posts onto the actual schedule.
      const scheduleDates = schedulePool.slice(0, filesToUse.length);

      for (let i = 0; i < filesToUse.length; i++) {
        const file = filesToUse[i];
        const { vehicleInfo, identitySource } = resolveVehicleInfo(
          file.name,
          file.parentFolderName,
          file.relativeFolderPath,
        );
        const resolvedPostType = classifyAssetPostType(postType, vehicleInfo, dealership.brand);
        const folderHint = file.relativeFolderPath ? ` folder="${file.relativeFolderPath}"` : "";

        // Generate captions one at a time so caption-provider rate limits don't collapse the whole scan
        const captionBase = {
          dealershipName,
          brand: dealership.brand,
          postType: resolvedPostType,
          vehicleInfo,
          captionSpec: (dealership as any).captionSpec,
          gmbSpec: (dealership as any).gmbSpec,
          talkingPoints: talkingPoints || null,
        };
        const captionIG = await generateCaption({ ...captionBase, platform: "instagram", tone: "punchy" });
        const captionFB = await generateCaption({ ...captionBase, platform: "facebook", tone: "punchy" });
        const captionGMB = await generateCaption({ ...captionBase, platform: "googlebusiness", tone: "professional" });

        // Upload media to GitHub for public hosting
        const publicUrl = await hostImage(file.id, file.name, file.mimeType || undefined);
        const mediaUrls = publicUrl
          ? JSON.stringify([publicUrl])
          : JSON.stringify([`https://drive.usercontent.google.com/download?id=${file.id}&export=download`]);

        const scheduledFor = scheduleDates[i] || null;

        const created = createQueuedDrivePost(
          {
            dealershipId: dealership.id,
            status: "queued",
            postType: resolvedPostType,
            vehicleInfo,
            caption: captionIG,
            captionFacebook: captionFB,
            captionGmb: captionGMB,
            hashtags: null,
            ctaBlock: instagramCta,
            mediaUrls,
            mediaType: file.mimeType?.startsWith("video/") ? "video" : "image",
            platforms: rule.platforms,
            scheduledFor,
            publishedAt: null,
            folderSource: `${folderId}/${file.id}`,
            notes: `Auto-imported: ${dealershipName} / ${postType} → ${resolvedPostType} / ${file.name}${folderHint} (identity=${identitySource}, model=${file.classification?.modelKey || "unknown"})`,
          },
          {
            dealershipName,
            postType,
            folderSource: `${folderId}/${file.id}`,
          },
        );
        if (!created) continue;

        newPostsCreated++;
        console.log(`[DriveScanner] Created review-queue post: ${dealershipName} / ${postType} → ${resolvedPostType} / ${vehicleInfo} ← ${file.name}${folderHint} → ${scheduledFor || "unscheduled"}`);
      }
    }
  }

  return newPostsCreated;
}

/**
 * Move file(s) to _Archive after scheduling.
 * Supports single-file sources and customer series (`folderId/series:slug#id1,id2`).
 * Non-Drive sources (e.g. reels-ready/* local masters) are no-ops that succeed.
 */
export function archiveFile(dealershipId: number, folderSource: string): boolean {
  const config = loadFolders();
  const dealershipConfig = Object.values(config.dealerships).find(d => d.id === dealershipId);
  if (!dealershipConfig) return false;

  const archiveFolderId = dealershipConfig.folders["_Archive"];
  if (!archiveFolderId) return false;

  const source = (folderSource || "").trim();
  if (!source) return true;

  // Local/reel masters are not Drive file IDs — never block approve/schedule on them.
  if (/^reels-ready\//i.test(source) || source.includes("\\") || source.startsWith("/")) {
    console.log(`[DriveScanner] Skipping Drive archive for non-Drive source: ${source}`);
    return true;
  }

  const parsed = parseFolderSource(folderSource);
  const fileIds = parsed.fileIds.length > 0
    ? parsed.fileIds
    : [folderSource.split("/").pop()].filter(Boolean) as string[];

  // Google Drive IDs are long alphanumerics; reject obvious dump names.
  const driveIds = fileIds.filter((id) => /^[A-Za-z0-9_-]{10,}$/.test(id) && !/^reels?/i.test(id) && !/\./.test(id));
  if (driveIds.length === 0) {
    console.log(`[DriveScanner] Skipping Drive archive — no Drive file ids in: ${source}`);
    return true;
  }

  let allOk = true;
  for (const fileId of driveIds) {
    console.log(`[DriveScanner] Archiving file ${fileId} to _Archive...`);
    if (!moveFile(fileId, archiveFolderId)) allOk = false;
  }
  return allOk;
}
