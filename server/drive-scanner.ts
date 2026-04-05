/**
 * Drive Scanner — PostEngine
 * Cadence-aware weekly scanner.
 * Only pulls images needed to fill this week's cadence schedule.
 * On approval: moves image to _Archive folder.
 */

import { execSync } from "child_process";
import { storage } from "./storage";
import { generateCaption } from "./caption-writer";
import fs from "fs";
import path from "path";

const DRIVE_FOLDERS_PATH = path.join(process.cwd(), ".drive-folders.json");
const ACCOUNT = "lance@thecoopbrla.com";

interface DealershipFolders {
  id: number;
  root: string;
  folders: Record<string, string>;
}

interface DriveFolders {
  account: string;
  dealerships: Record<string, DealershipFolders>;
}

function loadFolders(): DriveFolders {
  const raw = fs.readFileSync(DRIVE_FOLDERS_PATH, "utf-8");
  return JSON.parse(raw);
}

function gogCommand(args: string): any {
  try {
    const result = execSync(`gog ${args} --account ${ACCOUNT} --json --no-input`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    return JSON.parse(result);
  } catch (e) {
    return null;
  }
}

function listFolder(folderId: string): any[] {
  const result = gogCommand(`drive ls --parent=${folderId}`);
  if (!result) return [];
  const files = Array.isArray(result) ? result : result.files || [];
  return files.filter((f: any) =>
    f.mimeType && (
      f.mimeType.startsWith("image/") ||
      f.mimeType.startsWith("video/")
    )
  );
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

function parseFileName(fileName: string): string {
  const name = fileName.replace(/\.[^/.]+$/, "");
  return name.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
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
 * Calculates how many posts each dealership/type needs this week,
 * then pulls exactly that many images from Drive.
 */
export async function scanDriveFolders(): Promise<number> {
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
      const postsNeeded = days.length * rule.postsPerDay;

      // How many are already scheduled/queued for this dealership + type this week?
      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const existingThisWeek = storage.getPosts({
        dealershipId: dealership.id,
        postType,
      }).filter(p =>
        ["draft", "queued", "scheduled"].includes(p.status) &&
        p.scheduledFor &&
        new Date(p.scheduledFor) >= weekStart &&
        new Date(p.scheduledFor) <= weekEnd
      );

      const slotsToFill = Math.max(0, postsNeeded - existingThisWeek.length);
      if (slotsToFill === 0) {
        console.log(`[DriveScanner] ${dealershipName} / ${postType}: Already have ${postsNeeded} posts this week, skipping.`);
        continue;
      }

      // Get existing source files to avoid duplicates
      const existingPosts = storage.getPosts({ dealershipId: dealership.id });
      const existingSourceFiles = new Set(existingPosts.map(p => p.folderSource).filter(Boolean));

      // List available images in the folder
      const allFiles = listFolder(folderId);
      const newFiles = allFiles.filter(f => !existingSourceFiles.has(`${folderId}/${f.id}`));

      if (newFiles.length === 0) {
        console.log(`[DriveScanner] ${dealershipName} / ${postType}: No new images available (need ${slotsToFill}).`);
        continue;
      }

      // Take only what we need
      const filesToUse = newFiles.slice(0, slotsToFill);

      // Get schedule dates
      const scheduleDates = getNextScheduleDates(days, filesToUse.length, rule.autoTime, rule.manualTime);

      for (let i = 0; i < filesToUse.length; i++) {
        const file = filesToUse[i];
        const vehicleInfo = parseFileName(file.name);

        // Generate captions for each platform
        const [captionIG, captionFB, captionGMB] = await Promise.all([
          generateCaption({ dealershipName, brand: dealership.brand, postType, vehicleInfo, platform: "instagram", tone: "punchy" }),
          generateCaption({ dealershipName, brand: dealership.brand, postType, vehicleInfo, platform: "facebook", tone: "punchy" }),
          generateCaption({ dealershipName, brand: dealership.brand, postType, vehicleInfo, platform: "googlebusiness", tone: "professional" }),
        ]);

        const scheduledFor = scheduleDates[i] || null;

        storage.createPost({
          dealershipId: dealership.id,
          status: scheduledFor ? "queued" : "draft",
          postType,
          vehicleInfo,
          caption: captionIG,
          captionFacebook: captionFB,
          captionGmb: captionGMB,
          hashtags: null,
          ctaBlock: dealership.captionTemplate,
          mediaUrls: JSON.stringify([`https://drive.usercontent.google.com/download?id=${file.id}&export=download`]),
          mediaType: file.mimeType?.startsWith("video/") ? "video" : "image",
          platforms: rule.platforms,
          scheduledFor,
          publishedAt: null,
          folderSource: `${folderId}/${file.id}`,
          notes: `Auto-imported: ${dealershipName} / ${postType} / ${file.name}`,
        });

        newPostsCreated++;
        console.log(`[DriveScanner] Created post: ${dealershipName} / ${postType} / ${file.name} → ${scheduledFor || "draft"}`);
      }
    }
  }

  return newPostsCreated;
}

/**
 * Move a file to _Archive after scheduling.
 */
export function archiveFile(dealershipId: number, folderSource: string): boolean {
  const config = loadFolders();
  const dealershipConfig = Object.values(config.dealerships).find(d => d.id === dealershipId);
  if (!dealershipConfig) return false;

  const archiveFolderId = dealershipConfig.folders["_Archive"];
  if (!archiveFolderId) return false;

  const parts = folderSource.split("/");
  const fileId = parts[parts.length - 1];

  console.log(`[DriveScanner] Archiving file ${fileId} to _Archive...`);
  return moveFile(fileId, archiveFolderId);
}
