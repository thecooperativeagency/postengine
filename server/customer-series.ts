/**
 * Customer Media series grouping.
 * Multiple photos/videos of the same customer delivery become one swipe/carousel post.
 */

export interface SeriesMediaFile {
  id: string;
  name: string;
  mimeType?: string | null;
}

export interface CustomerMediaSeries {
  /** Stable normalized key used for dedupe / folderSource */
  key: string;
  /** Human label for captions (title-cased) */
  label: string;
  files: SeriesMediaFile[];
}

const MAX_CAROUSEL_ITEMS = 10;

export function isCustomerMediaPostType(postType: string): boolean {
  const n = (postType || "").trim().toLowerCase();
  return n === "customer media" || n === "customer delivery" || n === "deliveries";
}

/** Normalize a filename into a customer/delivery series key. */
export function customerSeriesKey(fileName: string): string {
  let n = (fileName || "").toLowerCase();
  n = n.replace(/\.[^.]+$/, "");
  n = n.replace(/\s+/g, " ").trim();
  // camera dump tokens
  n = n.replace(/\bimg[_\s-]?\d+\b/gi, " ");
  n = n.replace(/\bdsc[_\s-]?\d+\b/gi, " ");
  n = n.replace(/\bpxl[_\s-]?\d+\b/gi, " ");
  n = n.replace(/\b_?33a\d+\b/gi, " ");
  n = n.replace(/\bcopy\b/gi, " ");
  // wording noise that splits the same customer across titles
  n = n.replace(/\banother\b/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  // trailing frame counters: "… 02", "…-04", "… 01 ", "…_01"
  n = n.replace(/[\s_-]*\d{1,2}[\s_-]*$/g, "").trim();
  // internal multi-spaces / punctuation
  n = n.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  // second pass after punctuation cleanup (e.g. leftover lone numbers)
  n = n.replace(/[\s_-]*\d{1,2}$/g, "").trim();
  return n || "customer-delivery";
}

export function seriesSlug(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "customer-delivery";
}

export function titleCaseSeriesLabel(key: string): string {
  return key
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (/^\d/.test(word)) return word.toUpperCase();
      if (["bmw", "audi", "porsche", "ev", "suv", "gts", "e"].includes(word)) return word.toUpperCase();
      if (word === "s" || word === "e") return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function isVideoMime(file: SeriesMediaFile): boolean {
  const mime = (file.mimeType || "").toLowerCase();
  if (mime.startsWith("video/")) return true;
  return /\.(mp4|mov|m4v|webm)$/i.test(file.name || "");
}

/**
 * Sort carousel slides: stills first (name order), videos last.
 * Instagram carousels read better with photos leading.
 */
export function sortSeriesFilesForCarousel(files: SeriesMediaFile[]): SeriesMediaFile[] {
  const images = files.filter((f) => !isVideoMime(f)).sort((a, b) => a.name.localeCompare(b.name));
  const videos = files.filter((f) => isVideoMime(f)).sort((a, b) => a.name.localeCompare(b.name));
  return [...images, ...videos].slice(0, MAX_CAROUSEL_ITEMS);
}

export function groupCustomerMediaSeries(files: SeriesMediaFile[]): CustomerMediaSeries[] {
  const buckets = new Map<string, SeriesMediaFile[]>();
  for (const file of files) {
    const key = customerSeriesKey(file.name);
    const list = buckets.get(key) || [];
    list.push(file);
    buckets.set(key, list);
  }

  return Array.from(buckets.entries())
    .map(([key, groupFiles]) => ({
      key,
      label: titleCaseSeriesLabel(key),
      files: sortSeriesFilesForCarousel(groupFiles),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveSeriesMediaType(files: SeriesMediaFile[]): "image" | "video" | "carousel" {
  if (files.length === 0) return "image";
  if (files.length === 1) return isVideoMime(files[0]) ? "video" : "image";
  const allVideo = files.every((f) => isVideoMime(f));
  if (allVideo && files.length === 1) return "video";
  // multi-asset delivery set → swipe carousel (images and/or mixed)
  return "carousel";
}

/**
 * folderSource formats:
 * - single file: `{folderId}/{fileId}`
 * - series: `{folderId}/series:{slug}#{id1,id2,...}`
 */
export function buildSeriesFolderSource(folderId: string, seriesKey: string, fileIds: string[]): string {
  const slug = seriesSlug(seriesKey);
  const ids = fileIds.filter(Boolean).join(",");
  return `${folderId}/series:${slug}#${ids}`;
}

export function parseFolderSource(folderSource: string): {
  folderId: string;
  kind: "file" | "series";
  fileIds: string[];
  seriesSlug?: string;
} {
  const raw = (folderSource || "").trim();
  const slash = raw.indexOf("/");
  if (slash <= 0) {
    return { folderId: "", kind: "file", fileIds: raw ? [raw] : [] };
  }
  const folderId = raw.slice(0, slash);
  const rest = raw.slice(slash + 1);

  if (rest.startsWith("series:")) {
    const body = rest.slice("series:".length);
    const hash = body.indexOf("#");
    const slug = hash >= 0 ? body.slice(0, hash) : body;
    const idsPart = hash >= 0 ? body.slice(hash + 1) : "";
    const fileIds = idsPart.split(",").map((s) => s.trim()).filter(Boolean);
    return { folderId, kind: "series", fileIds, seriesSlug: slug };
  }

  return { folderId, kind: "file", fileIds: [rest].filter(Boolean) };
}

export function seriesAlreadyUsed(
  folderId: string,
  series: CustomerMediaSeries,
  existingFolderSources: Set<string | null | undefined>,
): boolean {
  const sources = Array.from(existingFolderSources).filter(Boolean) as string[];
  const slug = seriesSlug(series.key);
  const seriesPrefix = `${folderId}/series:${slug}`;

  for (const src of sources) {
    if (src === `${folderId}/series:${slug}` || src.startsWith(`${seriesPrefix}#`)) return true;
    const parsed = parseFolderSource(src);
    if (parsed.folderId !== folderId) continue;
    if (parsed.kind === "series" && parsed.seriesSlug === slug) return true;
    // any member file already imported as a single post
    for (const id of parsed.fileIds) {
      if (series.files.some((f) => f.id === id)) return true;
    }
    if (parsed.kind === "file" && series.files.some((f) => f.id === parsed.fileIds[0])) return true;
  }

  // also catch plain folderId/fileId entries
  for (const file of series.files) {
    if (existingFolderSources.has(`${folderId}/${file.id}`)) return true;
  }

  return false;
}
