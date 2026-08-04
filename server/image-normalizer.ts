import fs from "fs";
import path from "path";
import sharp from "sharp";

const TARGET_RATIO = 4 / 5;
const RATIO_EPSILON = 0.01;

export interface NormalizedImageResult {
  path: string;
  filename: string;
  wasNormalized: boolean;
  originalWidth: number;
  originalHeight: number;
  finalWidth: number;
  finalHeight: number;
}

export async function normalizeImageForSocial(inputPath: string): Promise<NormalizedImageResult> {
  const image = sharp(inputPath, { failOn: "none" });
  const metadata = await image.metadata();

  const originalWidth = metadata.width ?? 0;
  const originalHeight = metadata.height ?? 0;

  if (!originalWidth || !originalHeight) {
    return {
      path: inputPath,
      filename: path.basename(inputPath),
      wasNormalized: false,
      originalWidth,
      originalHeight,
      finalWidth: originalWidth,
      finalHeight: originalHeight,
    };
  }

  const aspectRatio = originalWidth / originalHeight;
  const isPortrait = originalHeight > originalWidth;
  const isTooTall = isPortrait && aspectRatio < TARGET_RATIO - RATIO_EPSILON;

  if (!isTooTall) {
    return {
      path: inputPath,
      filename: path.basename(inputPath),
      wasNormalized: false,
      originalWidth,
      originalHeight,
      finalWidth: originalWidth,
      finalHeight: originalHeight,
    };
  }

  const targetHeight = Math.round(originalWidth / TARGET_RATIO);
  const cropTop = Math.max(0, Math.floor((originalHeight - targetHeight) / 2));
  const ext = path.extname(inputPath) || ".jpg";
  const base = path.basename(inputPath, ext);
  const normalizedPath = path.join(path.dirname(inputPath), `${base}--4x5${ext}`);

  await image
    .extract({ left: 0, top: cropTop, width: originalWidth, height: targetHeight })
    .toFile(normalizedPath);

  return {
    path: normalizedPath,
    filename: path.basename(normalizedPath),
    wasNormalized: true,
    originalWidth,
    originalHeight,
    finalWidth: originalWidth,
    finalHeight: targetHeight,
  };
}

export function cleanupNormalizedImage(filePath: string, originalPath: string) {
  if (filePath === originalPath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}
