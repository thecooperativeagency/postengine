/**
 * Google Drive API client for PostEngine.
 * Uses a service account key from GOOGLE_SERVICE_ACCOUNT_JSON.
 * A user OAuth refresh token (what `gog` stored on the Mac Mini) expires and
 * needs a browser. A service account does not. Lance shares the dealership
 * folders with the service account email. Scope is full Drive so list,
 * download, and move all work; access is still limited to shared folders.
 */

import { spawnSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

let tokenCache: { token: string; expMs: number } | null = null;

export function resetDriveTokenCache(): void {
  tokenCache = null;
}

/** True when the env value is a key Node can sign with. Does not call Google. */
export function serviceAccountCanSign(): boolean {
  try {
    signServiceAccountJwt(readServiceAccount());
    return true;
  } catch {
    return false;
  }
}

export function readServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() || "";
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  }
  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return parsed;
}

function base64url(value: Buffer | string): string {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buf.toString("base64url");
}

function signServiceAccountJwt(account: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: account.client_email,
    scope: DRIVE_SCOPE,
    aud: account.token_uri || TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  let signature: Buffer;
  try {
    signature = crypto.createSign("RSA-SHA256").update(unsigned).sign(account.private_key);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON private_key could not be used to sign");
  }
  return `${unsigned}.${base64url(signature)}`;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expMs > Date.now() + 60_000) return tokenCache.token;
  const account = readServiceAccount();
  const assertion = signServiceAccountJwt(account);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch(account.token_uri || TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Google Drive token request failed (${res.status})`);
  }
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error("Google Drive token response had no access_token");
  }
  tokenCache = {
    token: data.access_token,
    expMs: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return data.access_token;
}

function driveErrorMessage(status: number, body: string): string {
  let detail = "";
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message || "";
    if (message && !/private key|BEGIN /i.test(message)) detail = `: ${message.slice(0, 180)}`;
  } catch {
    // ignore non-JSON bodies
  }
  return `Google Drive request failed (${status})${detail}`;
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

/**
 * List image and video files in a folder.
 * A successful list with no media is an empty array.
 * Auth, permission, and network failures throw.
 */
export async function listMediaInFolder(folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";
  const parent = folderId.replace(/'/g, "\\'");
  const q = `'${parent}' in parents and trashed = false`;

  do {
    const params = new URLSearchParams({
      q,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
    const text = await res.text();
    if (!res.ok) throw new Error(driveErrorMessage(res.status, text));
    const data = JSON.parse(text) as { nextPageToken?: string; files?: DriveFile[] };
    for (const file of data.files || []) {
      if (!file.mimeType) continue;
      if (file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")) {
        files.push(file);
      }
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return files;
}

export async function downloadDriveFile(fileId: string, destPath: string): Promise<boolean> {
  const params = new URLSearchParams({
    alt: "media",
    supportsAllDrives: "true",
  });
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
  );
  if (!res.ok || !res.body) return false;
  const body = res.body as unknown as import("stream/web").ReadableStream;
  await pipeline(Readable.fromWeb(body), fs.createWriteStream(destPath));
  return fs.existsSync(destPath) && fs.statSync(destPath).size > 0;
}

/** Move a file into another folder, removing its previous parents. */
export async function moveDriveFile(fileId: string, targetFolderId: string): Promise<void> {
  const metaParams = new URLSearchParams({
    fields: "parents",
    supportsAllDrives: "true",
  });
  const metaRes = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${metaParams}`,
  );
  const metaText = await metaRes.text();
  if (!metaRes.ok) throw new Error(driveErrorMessage(metaRes.status, metaText));
  const meta = JSON.parse(metaText) as { parents?: string[] };
  const parents = Array.isArray(meta.parents) ? meta.parents : [];
  if (parents.length === 1 && parents[0] === targetFolderId) return;

  const params = new URLSearchParams({
    addParents: targetFolderId,
    supportsAllDrives: "true",
  });
  const remove = parents.filter((parent) => parent !== targetFolderId);
  if (remove.length) params.set("removeParents", remove.join(","));
  const patch = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  if (!patch.ok) {
    const text = await patch.text();
    throw new Error(driveErrorMessage(patch.status, text));
  }
}

let syncToken: { token: string; expMs: number } | null = null;

function curlRaw(args: string[]): { status: number; body: string } {
  const result = spawnSync("curl", ["-sS", ...args, "-w", "\n%{http_code}"], {
    encoding: "utf-8",
    timeout: 120000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error("Google Drive request failed. curl is required in this environment.");
  }
  const out = result.stdout || "";
  const splitAt = out.lastIndexOf("\n");
  const body = splitAt >= 0 ? out.slice(0, splitAt) : out;
  const status = Number(splitAt >= 0 ? out.slice(splitAt + 1).trim() : "0");
  if (!status) throw new Error("Google Drive request failed");
  return { status, body };
}

function accessTokenSync(): string {
  if (syncToken && syncToken.expMs > Date.now() + 60_000) return syncToken.token;
  const account = readServiceAccount();
  const assertion = signServiceAccountJwt(account);
  const { status, body } = curlRaw([
    "-X", "POST",
    "-H", "Content-Type: application/x-www-form-urlencoded",
    "--data", `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(assertion)}`,
    account.token_uri || TOKEN_URL,
  ]);
  if (status !== 200) throw new Error(`Google Drive token request failed (${status})`);
  const data = JSON.parse(body) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Google Drive token response had no access_token");
  syncToken = { token: data.access_token, expMs: Date.now() + (data.expires_in || 3600) * 1000 };
  return data.access_token;
}

/** One page of children. An empty page is success. Auth and HTTP errors throw. */
export function listDrivePageSync(folderId: string, pageToken?: string): { files: Array<{ id: string; name: string; mimeType: string }>; nextPageToken?: string } {
  const parent = folderId.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    q: `'${parent}' in parents and trashed = false`,
    fields: "nextPageToken,files(id,name,mimeType)",
    pageSize: "200",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  if (pageToken) params.set("pageToken", pageToken);
  const token = accessTokenSync();
  const { status, body } = curlRaw([
    "-H", `Authorization: Bearer ${token}`,
    `https://www.googleapis.com/drive/v3/files?${params}`,
  ]);
  if (status !== 200) throw new Error(driveErrorMessage(status, body));
  const data = JSON.parse(body) as { files?: Array<{ id: string; name: string; mimeType: string }>; nextPageToken?: string };
  return { files: data.files || [], nextPageToken: data.nextPageToken };
}

export function downloadDriveFileSync(fileId: string, destPath: string): boolean {
  const token = accessTokenSync();
  const params = new URLSearchParams({ alt: "media", supportsAllDrives: "true" });
  const result = spawnSync("curl", [
    "-fsS",
    "-L",
    "-H", `Authorization: Bearer ${token}`,
    "-o", destPath,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
  ], { encoding: "utf-8", timeout: 120000 });
  if (result.status !== 0 || !fs.existsSync(destPath) || fs.statSync(destPath).size === 0) {
    try { fs.rmSync(destPath, { force: true }); } catch { /* ignore */ }
    return false;
  }
  return true;
}

export function moveDriveFileSync(fileId: string, targetFolderId: string): void {
  const token = accessTokenSync();
  const meta = curlRaw([
    "-H", `Authorization: Bearer ${token}`,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=parents&supportsAllDrives=true`,
  ]);
  if (meta.status !== 200) throw new Error(driveErrorMessage(meta.status, meta.body));
  const parents = (JSON.parse(meta.body) as { parents?: string[] }).parents || [];
  if (parents.length === 1 && parents[0] === targetFolderId) return;
  const params = new URLSearchParams({ addParents: targetFolderId, supportsAllDrives: "true" });
  const remove = parents.filter((parent) => parent !== targetFolderId);
  if (remove.length) params.set("removeParents", remove.join(","));
  const patch = curlRaw([
    "-X", "PATCH",
    "-H", `Authorization: Bearer ${token}`,
    "-H", "Content-Type: application/json",
    "--data", "{}",
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
  ]);
  if (patch.status !== 200) throw new Error(driveErrorMessage(patch.status, patch.body));
}

export function uploadDriveFileSync(localPath: string, parentId: string, filename: string): string {
  const token = accessTokenSync();
  const metaPath = `${localPath}.upload-meta.json`;
  fs.writeFileSync(metaPath, JSON.stringify({ name: filename, parents: [parentId] }));
  try {
    const { status, body } = curlRaw([
      "-X", "POST",
      "-H", `Authorization: Bearer ${token}`,
      "-F", `metadata=<${metaPath};type=application/json;charset=UTF-8`,
      "-F", `file=@${localPath};type=application/octet-stream`,
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id",
    ]);
    if (status !== 200) throw new Error(driveErrorMessage(status, body));
    const parsed = JSON.parse(body) as { id?: string };
    if (!parsed.id) throw new Error("Google Drive upload did not return a file id");
    return parsed.id;
  } finally {
    fs.rmSync(metaPath, { force: true });
  }
}
