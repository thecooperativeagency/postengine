import { randomBytes } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanupNormalizedImage, normalizeImageForSocial } from "./image-normalizer";
import { hostPublicMediaFile } from "./public-media";

const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm"]);

function sanitizeFilename(filename: string) {
  const base = path.basename(filename || "upload.bin");
  return base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/--+/g, "-")
    .replace(/^\.+/, "")
    .toLowerCase() || "upload.bin";
}

function extOf(filename: string, mimeType?: string) {
  const fromName = path.extname(filename).toLowerCase();
  if (fromName) return fromName;
  const mime = (mimeType || "").toLowerCase();
  if (mime.includes("jpeg")) return ".jpg";
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("mp4")) return ".mp4";
  if (mime.includes("quicktime") || mime.includes("mov")) return ".mov";
  if (mime.includes("webm")) return ".webm";
  return ".bin";
}

export function classifyMediaType(filename: string, mimeType?: string): "image" | "video" | "unknown" {
  const ext = extOf(filename, mimeType);
  const mime = (mimeType || "").toLowerCase();
  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) return "image";
  if (VIDEO_EXT.has(ext) || mime.startsWith("video/")) return "video";
  return "unknown";
}

function decodeDataPayload(contentBase64: string) {
  const trimmed = contentBase64.trim();
  const dataUrl = trimmed.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrl) {
    return {
      mimeType: dataUrl[1],
      buffer: Buffer.from(dataUrl[2], "base64"),
    };
  }
  return {
    mimeType: undefined as string | undefined,
    buffer: Buffer.from(trimmed, "base64"),
  };
}

export async function hostUploadedMedia(input: {
  filename: string;
  contentBase64: string;
  mimeType?: string;
}): Promise<{ url: string; mediaType: "image" | "video"; filename: string; bytes: number }> {
  const safeName = sanitizeFilename(input.filename);
  const decoded = decodeDataPayload(input.contentBase64);
  const mimeType = input.mimeType || decoded.mimeType;
  const buffer = decoded.buffer;

  if (!buffer.length) {
    throw new Error("Empty upload");
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`);
  }

  const kind = classifyMediaType(safeName, mimeType);
  if (kind === "unknown") {
    throw new Error("Unsupported file type. Use an image (jpg/png/webp/gif) or video (mp4/mov/webm).");
  }

  const ext = extOf(safeName, mimeType);
  const tempDir = await mkdtemp(path.join(tmpdir(), "pe-upload-"));
  const tempPath = path.join(tempDir, `${randomBytes(4).toString("hex")}-${safeName.endsWith(ext) ? safeName : `${safeName}${ext}`}`);

  try {
    await writeFile(tempPath, buffer);

    let hostPath = tempPath;
    let hostName = path.basename(tempPath);

    if (kind === "image") {
      try {
        const normalized = await normalizeImageForSocial(tempPath);
        hostPath = normalized.path;
        hostName = normalized.filename;
      } catch (error) {
        console.warn("[MediaUpload] image normalize skipped:", error instanceof Error ? error.message : error);
      }
    }

    const url = await hostPublicMediaFile(hostPath, hostName);
    cleanupNormalizedImage(hostPath, tempPath);

    return {
      url,
      mediaType: kind,
      filename: hostName,
      bytes: buffer.length,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function inferPostMediaType(mediaTypes: Array<"image" | "video">): "image" | "video" | "carousel" {
  if (mediaTypes.length === 0) return "image";
  if (mediaTypes.some((t) => t === "video")) {
    return mediaTypes.length === 1 ? "video" : "carousel";
  }
  return mediaTypes.length > 1 ? "carousel" : "image";
}
