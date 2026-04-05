/**
 * Media Host — PostEngine
 * Downloads images from Google Drive and hosts them on GitHub
 * for use as public URLs with Zernio/Instagram.
 *
 * Flow: Drive file ID → download → push to GitHub → return raw URL
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const GITHUB_REPO = "thecooperativeagency/postengine";
const MEDIA_BRANCH = "main";
const MEDIA_FOLDER = "media";
const ACCOUNT = "lance@thecoopbrla.com";

function getGithubToken(): string {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const envFile = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
    const match = envFile.match(/GITHUB_TOKEN=(.+)/);
    if (match) return match[1].trim();
  } catch {}
  return "";
}

/**
 * Download a file from Google Drive using gog CLI
 */
function downloadFromDrive(fileId: string, destPath: string): boolean {
  try {
    execSync(
      `gog drive download ${fileId} --account ${ACCOUNT} --out "${destPath}" --no-input`,
      { encoding: "utf-8", timeout: 60000 }
    );
    return fs.existsSync(destPath);
  } catch (e) {
    console.error(`[MediaHost] Failed to download ${fileId}:`, e);
    return false;
  }
}

/**
 * Upload a file to GitHub via API and return the raw URL
 */
async function uploadToGithub(localPath: string, filename: string): Promise<string | null> {
  const token = getGithubToken();
  if (!token) {
    console.error("[MediaHost] No GitHub token");
    return null;
  }

  try {
    const content = fs.readFileSync(localPath);
    const base64Content = content.toString("base64");
    const githubPath = `${MEDIA_FOLDER}/${filename}`;

    // Check if file already exists (to get SHA for update)
    let sha: string | undefined;
    const checkRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" } }
    );
    if (checkRes.ok) {
      const existing = await checkRes.json() as any;
      sha = existing.sha;
    }

    // Upload file
    const body: any = {
      message: `Add media: ${filename}`,
      content: base64Content,
      branch: MEDIA_BRANCH,
    };
    if (sha) body.sha = sha;

    const uploadRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${githubPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (uploadRes.ok) {
      const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${MEDIA_BRANCH}/${githubPath}`;
      console.log(`[MediaHost] ✅ Uploaded ${filename} → ${rawUrl}`);
      return rawUrl;
    } else {
      const err = await uploadRes.json() as any;
      console.error("[MediaHost] GitHub upload failed:", err.message);
      return null;
    }
  } catch (e: any) {
    console.error("[MediaHost] Error:", e.message);
    return null;
  }
}

/**
 * Main function: given a Drive file ID and filename,
 * download and host on GitHub, return public URL.
 */
export async function hostImage(fileId: string, filename: string): Promise<string | null> {
  // Sanitize filename for GitHub
  const safeName = filename
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/--+/g, "-")
    .toLowerCase();

  const tmpPath = path.join("/tmp", `pe-media-${fileId}-${safeName}`);

  // Download from Drive
  console.log(`[MediaHost] Downloading ${filename} from Drive...`);
  const downloaded = downloadFromDrive(fileId, tmpPath);
  if (!downloaded) return null;

  // Upload to GitHub
  const url = await uploadToGithub(tmpPath, safeName);

  // Cleanup temp file
  try { fs.unlinkSync(tmpPath); } catch {}

  return url;
}
