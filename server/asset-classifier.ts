import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { storage } from "./storage";

const ACCOUNT = "lance@thecoopbrla.com";
// v3: folder-context labels participate in classification identity
const CACHE_KEY = "drive_asset_classification_cache_v3";

export type ClassificationSource =
  | "filename"
  | "folder"
  | "filename+folder"
  | "vision"
  | "filename+vision"
  | "folder+vision";

export interface AssetClassification {
  modelKey: string;
  shotType: string;
  lookBucket: string;
  shootCluster: string;
  visualTags: string[];
  source: ClassificationSource;
  contextLabel?: string;
}

export interface ClassifiableAsset {
  id: string;
  name: string;
  /** Immediate parent model/subfolder name, e.g. "BMW x3" */
  folderName?: string | null;
  /** Relative path under the category folder, e.g. "BMW alpina" or "SUV/X5" */
  folderPath?: string | null;
}

interface CacheEntry extends AssetClassification {
  fileId: string;
  fileName: string;
  contextKey: string;
  updatedAt: string;
}

interface CacheMap {
  [cacheId: string]: CacheEntry;
}

function loadCache(): CacheMap {
  const raw = storage.getAppSetting(CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CacheMap;
  } catch {
    return {};
  }
}

function saveCache(cache: CacheMap) {
  storage.setAppSetting(CACHE_KEY, JSON.stringify(cache));
}

export function normalizeForMatching(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Camera dumps / UUID copies that should not drive vehicle identity. */
export function isGenericMediaName(fileName: string): boolean {
  const base = fileName.replace(/\.[^/.]+$/, "").trim();
  if (!base) return true;

  const normalized = normalizeForMatching(base);
  if (!normalized) return true;

  // Canon/Nikon style dumps used heavily in lot shoots: _33A9369, 33A9369
  if (/^_?33a\d+/i.test(base)) return true;
  if (/^(img|dsc|dcim|pxl|mvimg|photo)[-_]?\d+/i.test(base)) return true;
  if (/^copy([_-]|\s)/i.test(base) || /^copy\s+of\b/i.test(base)) return true;
  if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(base)) return true;
  if (/^[0-9a-f]{10,}$/i.test(normalized.replace(/\s/g, ""))) return true;
  if (/^\d{3,6}$/.test(normalized)) return true;
  // Bare frame counters with almost no language
  if (/^[_-]?\d{4,}[a-z]?$/i.test(base)) return true;

  return false;
}

export function buildContextLabel(file: Pick<ClassifiableAsset, "folderName" | "folderPath">): string {
  const pathLabel = (file.folderPath || "").trim();
  if (pathLabel) return pathLabel;
  return (file.folderName || "").trim();
}

/**
 * Infer model key from any free-text label (filename, folder name, or both).
 * Longer / more specific patterns are checked first.
 */
export function inferModelKeyFromText(text: string): string {
  const normalized = normalizeForMatching(text);
  if (!normalized) return "unknown";

  const explicitPatterns: Array<[RegExp, string]> = [
    // Audi
    [/\bq\s?3\b/, "q3"],
    [/\bq\s?5\b/, "q5"],
    [/\bq\s?7\b/, "q7"],
    [/\bq\s?8\b/, "q8"],
    [/\ba\s?3\b/, "a3"],
    [/\ba\s?4\b/, "a4"],
    [/\ba\s?5\b/, "a5"],
    [/\ba\s?6\b/, "a6"],
    [/\ba\s?7\b/, "a7"],
    [/\bs\s?3\b/, "s3"],
    [/\bs\s?4\b/, "s4"],
    [/\bs\s?5\b/, "s5"],
    [/\bs\s?6\b/, "s6"],
    [/\bs\s?7\b/, "s7"],
    [/\brs\s?3\b/, "rs3"],
    [/\brs\s?5\b/, "rs5"],
    [/\brs\s?6\b/, "rs6"],
    [/\brs\s?7\b/, "rs7"],
    [/\betron\b|\be tron\b/, "e-tron"],
    // Porsche
    [/\bmacan\b/, "macan"],
    [/\bcayenne\b/, "cayenne"],
    [/\bpanamera\b/, "panamera"],
    [/\b911\b/, "911"],
    [/\btaycan\b/, "taycan"],
    [/\b718\b|\bboxster\b|\bcayman\b/, "718"],
    // BMW — order matters (x5m before x5, m440 before m4, etc.)
    [/\balpina\b/, "alpina"],
    [/\bx\s?5\s?m\b|\bx5m\b/, "x5m"],
    [/\bx\s?6\s?m\b|\bx6m\b/, "x6m"],
    [/\bx\s?3\s?m\b|\bx3m\b/, "x3m"],
    [/\bx\s?4\s?m\b|\bx4m\b/, "x4m"],
    [/\bx\s?1\b/, "x1"],
    [/\bx\s?2\b/, "x2"],
    [/\bx\s?3\b(?!\s*m\b)/, "x3"],
    [/\bx\s?4\b(?!\s*m\b)/, "x4"],
    [/\bx\s?5\b(?!\s*m\b)/, "x5"],
    [/\bx\s?6\b(?!\s*m\b)/, "x6"],
    [/\bx\s?7\b/, "x7"],
    [/\bxm\b/, "xm"],
    [/\bm240i?\b/, "m240"],
    [/\bm340i?\b/, "m340"],
    [/\bm440i?\b/, "m440"],
    [/\bm550i?\b/, "m550"],
    [/\bm\s?2\b(?!\d)/, "m2"],
    [/\bm\s?3\b(?!\d)/, "m3"],
    [/\bm\s?4\b(?!\d)/, "m4"],
    [/\bm\s?5\b(?!\d)/, "m5"],
    [/\bm\s?8\b(?!\d)/, "m8"],
    [/\bm85\b/, "m85"],
    [/\b228i?\b/, "228"],
    [/\b330i?\b/, "330"],
    [/\b530i?\b/, "530"],
    [/\b540i?\b/, "540"],
    [/\b740i?\b|\b750i?\b|\b7\s*series\b/, "7-series"],
    [/\b5\s*series\b/, "5-series"],
    [/\b3\s*series\b/, "3-series"],
    [/\bz4\b/, "z4"],
    [/\bix\b/, "ix"],
    [/\bi4\b/, "i4"],
    [/\bi5\b/, "i5"],
    [/\bi7\b/, "i7"],
  ];

  const matches = explicitPatterns
    .filter(([pattern]) => pattern.test(normalized))
    .map(([, key]) => key);

  // Prefer more specific M-car / package keys over their base model siblings.
  const specificityDrops = new Set<string>();
  if (matches.includes("x5m")) specificityDrops.add("x5");
  if (matches.includes("x6m")) specificityDrops.add("x6");
  if (matches.includes("x3m")) specificityDrops.add("x3");
  if (matches.includes("x4m")) specificityDrops.add("x4");
  if (matches.includes("m240")) specificityDrops.add("m2");
  if (matches.includes("m340")) specificityDrops.add("m3");
  if (matches.includes("m440")) specificityDrops.add("m4");
  if (matches.includes("m550")) specificityDrops.add("m5");

  const unique = Array.from(new Set(matches.filter((key) => !specificityDrops.has(key))));
  if (unique.length > 1) return unique.sort().join("+");
  if (unique.length === 1) return unique[0];
  return "unknown";
}

/** @deprecated Prefer inferModelKeyFromText — kept for call-site compatibility. */
export function inferModelKeyFromFilename(fileName: string): string {
  return inferModelKeyFromText(fileName);
}

export function inferShotTypeFromFilename(fileName: string): string {
  const normalized = normalizeForMatching(fileName);
  const shotPatterns: Array<[RegExp, string]> = [
    [/\binterior\b|\bcockpit\b|\bcabin\b|\bdash\b|\bconsole\b|\bseat\b|\bseats\b|\bsteering\b/, "interior"],
    [/\bwheel\b|\brim\b|\bbadge\b|\bdetail\b|\bclose up\b|\bcloseup\b|\bgrille\b|\blight\b/, "detail"],
    [/\brear\b|\bback\b|\btaillight\b/, "rear"],
    [/\bside\b|\bprofile\b/, "side"],
    [/\bfront\b|\bgrille\b/, "front"],
    [/\bdrone\b|\bbuilding\b|\blot\b|\bevent\b|\bgolf\b|\bcountry club\b/, "lifestyle"],
  ];
  for (const [pattern, shotType] of shotPatterns) {
    if (pattern.test(normalized)) return shotType;
  }
  return "exterior";
}

export function inferLookBucketFromFilename(fileName: string): string {
  const normalized = normalizeForMatching(fileName);
  const shotType = inferShotTypeFromFilename(fileName);
  if (shotType === "interior") return "interior";
  if (shotType === "detail") return "detail";
  if (shotType === "lifestyle") return "lifestyle";
  if (/\bblack\b|\boptics\b|\bs line\b|\bperformance\b/.test(normalized)) return "trim-package";
  return shotType;
}

export function inferShootClusterFromFilename(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "");
  let normalized = normalizeForMatching(base);
  normalized = normalized
    .replace(/\b_?33a\d+\b/g, " ")
    .replace(/\b\d{2,4}[a-z]?\b/g, " ")
    .replace(/\bcopy\b/g, " ")
    .replace(/\b\(\d+\)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || "unknown-cluster";
}

function downloadFromDrive(fileId: string, destPath: string): boolean {
  try {
    execSync(`gog drive download ${fileId} --account ${ACCOUNT} --out "${destPath}" --no-input`, {
      encoding: "utf-8",
      timeout: 60000,
    });
    return fs.existsSync(destPath);
  } catch {
    return false;
  }
}

async function classifyWithVision(_localPath: string, fileName: string): Promise<Partial<AssetClassification>> {
  const normalized = normalizeForMatching(fileName);
  const tags = new Set<string>();

  if (/\binterior\b|\bcockpit\b|\bcabin\b|\bdash\b|\bseat\b/.test(normalized)) tags.add("interior");
  if (/\bwheel\b|\bbadge\b|\bdetail\b|\blight\b/.test(normalized)) tags.add("detail");
  if (/\bfront\b/.test(normalized)) tags.add("front");
  if (/\brear\b|\bback\b/.test(normalized)) tags.add("rear");
  if (/\bside\b|\bprofile\b/.test(normalized)) tags.add("side");
  if (/\bdrone\b|\bbuilding\b|\bevent\b|\bgolf\b|\bcountry club\b/.test(normalized)) tags.add("lifestyle");

  const shotType = tags.has("interior")
    ? "interior"
    : tags.has("detail")
      ? "detail"
      : tags.has("rear")
        ? "rear"
        : tags.has("side")
          ? "side"
          : tags.has("front")
            ? "front"
            : tags.has("lifestyle")
              ? "lifestyle"
              : undefined;

  return {
    shotType,
    lookBucket: shotType === "lifestyle" ? "lifestyle" : shotType,
    visualTags: Array.from(tags),
    source: tags.size > 0 ? "filename+vision" : "filename",
  };
}

function resolveLabelSource(
  fileModel: string,
  folderModel: string,
  usedFolderForModel: boolean,
): ClassificationSource {
  if (usedFolderForModel && fileModel !== "unknown") return "filename+folder";
  if (usedFolderForModel) return "folder";
  return "filename";
}

/**
 * Classify a Drive asset using filename and optional parent-folder context.
 * Folder names are a first-class substitute when camera dumps have useless filenames.
 */
export async function getAssetClassification(file: ClassifiableAsset): Promise<AssetClassification> {
  const contextLabel = buildContextLabel(file);
  const contextKey = normalizeForMatching(contextLabel);
  const cacheId = `${file.id}::${contextKey || "root"}`;
  const cache = loadCache();
  const cached = cache[cacheId];
  if (cached && cached.fileName === file.name && cached.contextKey === contextKey) {
    return cached;
  }

  const fileModel = inferModelKeyFromText(file.name);
  const folderModel = contextLabel ? inferModelKeyFromText(contextLabel) : "unknown";
  const combinedModel = inferModelKeyFromText([file.name, contextLabel].filter(Boolean).join(" "));

  let modelKey = "unknown";
  let usedFolderForModel = false;

  // Prefer a concrete model from the filename when present; otherwise use folder.
  if (fileModel !== "unknown" && !isGenericMediaName(file.name)) {
    modelKey = fileModel;
  } else if (folderModel !== "unknown") {
    modelKey = folderModel;
    usedFolderForModel = true;
  } else if (combinedModel !== "unknown") {
    modelKey = combinedModel;
    usedFolderForModel = folderModel !== "unknown" || Boolean(contextLabel);
  } else if (fileModel !== "unknown") {
    modelKey = fileModel;
  }

  const labelForShots = !isGenericMediaName(file.name)
    ? file.name
    : contextLabel || file.name;

  let shootCluster = inferShootClusterFromFilename(file.name);
  if (shootCluster === "unknown-cluster" && contextLabel) {
    shootCluster = normalizeForMatching(contextLabel) || "unknown-cluster";
  } else if (contextLabel && isGenericMediaName(file.name)) {
    // Camera dump inside a model folder: cluster by folder so diversity spreads across models
    shootCluster = normalizeForMatching(contextLabel) || shootCluster;
  }

  const filenameBased: AssetClassification = {
    modelKey,
    shotType: inferShotTypeFromFilename(labelForShots),
    lookBucket: inferLookBucketFromFilename(labelForShots),
    shootCluster,
    visualTags: [],
    source: resolveLabelSource(fileModel, folderModel, usedFolderForModel),
    contextLabel: contextLabel || undefined,
  };

  const tmpPath = path.join(
    "/tmp",
    `pe-asset-classify-${file.id}-${Date.now()}${path.extname(file.name) || ".jpg"}`,
  );
  let enriched: Partial<AssetClassification> = {};

  try {
    const downloaded = downloadFromDrive(file.id, tmpPath);
    if (downloaded) {
      enriched = await classifyWithVision(tmpPath, labelForShots);
    }
  } catch {
    enriched = {};
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
  }

  let source: ClassificationSource = filenameBased.source;
  if (enriched.source === "filename+vision" || (enriched.visualTags && enriched.visualTags.length > 0)) {
    source = usedFolderForModel ? "folder+vision" : "filename+vision";
  }

  const merged: CacheEntry = {
    fileId: file.id,
    fileName: file.name,
    contextKey,
    modelKey: enriched.modelKey || filenameBased.modelKey,
    shotType: enriched.shotType || filenameBased.shotType,
    lookBucket: enriched.lookBucket || filenameBased.lookBucket,
    shootCluster: enriched.shootCluster || filenameBased.shootCluster,
    visualTags: enriched.visualTags || filenameBased.visualTags,
    source,
    contextLabel: filenameBased.contextLabel,
    updatedAt: new Date().toISOString(),
  };

  cache[cacheId] = merged;
  saveCache(cache);
  return merged;
}
