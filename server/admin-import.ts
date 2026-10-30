/**
 * One-time copy of the Mac Mini database and public-media tree.
 * The body is a tar.gz stream. Nothing is buffered whole.
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";
import { extract } from "tar-stream";
import type { Request, Response } from "express";
import { safeEqual } from "./auth";
import { generatedMediaDir } from "./media-store";
import { publishEnabled } from "./publish-switch";
import { closeDatabase, postCountsByStatus, reopenDatabase, sqliteFilePath } from "./storage";

export function authorizeImport(req: Request, res: Response): boolean {
  const expected = process.env.IMPORT_TOKEN?.trim() || "";
  if (!expected) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  const header = req.get("authorization") || "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!presented || !safeEqual(presented, expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

function entryName(raw: string): string {
  return raw.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isUnsafe(name: string): boolean {
  if (!name || name.includes("\0")) return true;
  return name.split("/").some((part) => part === "..");
}

function mediaDest(name: string): string | null {
  const prefix = "public-media/";
  if (!name.startsWith(prefix)) return null;
  const rel = name.slice(prefix.length);
  if (!rel || rel.endsWith("/")) return null;
  const root = path.resolve(generatedMediaDir());
  const dest = path.resolve(root, rel);
  if (dest !== root && !dest.startsWith(root + path.sep)) return null;
  return dest;
}

export function countMediaFiles(dir = generatedMediaDir()): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countMediaFiles(full);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

export async function handleAdminImport(req: Request, res: Response): Promise<void> {
  if (!authorizeImport(req, res)) return;
  if (publishEnabled()) {
    req.destroy();
    res.status(409).json({ error: "Refusing import while PUBLISH_ENABLED is true" });
    return;
  }

  const dbPath = sqliteFilePath();
  const incoming = `${dbPath}.incoming`;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.mkdirSync(generatedMediaDir(), { recursive: true });
  fs.rmSync(incoming, { force: true });

  const hash = createHash("sha256");
  let dbBytes = 0;
  let sawSqlite = false;
  let mediaFiles = 0;
  let skipped = 0;

  const extractor = extract();
  const extracted = new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error("import failed"));
    };
    extractor.on("entry", (header, stream, next) => {
      const name = entryName(header.name || "");
      const entryFail = (error: unknown) => {
        stream.resume();
        next();
        fail(error);
      };

      if (header.type === "symlink" || header.type === "link" || isUnsafe(name)) {
        skipped += 1;
        stream.resume();
        stream.on("end", () => next());
        return;
      }

      if (name === "sqlite.db" && header.type === "file") {
        sawSqlite = true;
        const out = fs.createWriteStream(incoming);
        const hasher = new Transform({
          transform(chunk, _enc, cb) {
            hash.update(chunk);
            dbBytes += chunk.length;
            cb(null, chunk);
          },
        });
        pipeline(stream, hasher, out).then(() => next(), entryFail);
        return;
      }

      const dest = header.type === "file" ? mediaDest(name) : null;
      if (!dest) {
        if (header.type !== "directory") skipped += 1;
        stream.resume();
        stream.on("end", () => next());
        return;
      }

      fs.mkdirSync(path.dirname(dest), { recursive: true });
      pipeline(stream, fs.createWriteStream(dest, { flags: "w" })).then(() => {
        mediaFiles += 1;
        next();
      }, entryFail);
    });
    extractor.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    extractor.on("error", fail);
  });

  try {
    const gunzip = createGunzip();
    gunzip.on("error", () => extractor.destroy());
    req.pipe(gunzip).pipe(extractor);
    await extracted;
  } catch (error) {
    fs.rmSync(incoming, { force: true });
    const message = error instanceof Error ? error.message : "import failed";
    if (!res.headersSent) res.status(400).json({ error: message });
    return;
  }

  if (!sawSqlite) {
    fs.rmSync(incoming, { force: true });
    res.status(400).json({ error: "Archive is missing sqlite.db" });
    return;
  }

  try {
    closeDatabase();
    fs.rmSync(`${dbPath}-wal`, { force: true });
    fs.rmSync(`${dbPath}-shm`, { force: true });
    fs.renameSync(incoming, dbPath);
  } catch (error) {
    fs.rmSync(incoming, { force: true });
    try { reopenDatabase(); } catch { /* reported below if still closed */ }
    const message = error instanceof Error ? error.message : "could not replace database";
    res.status(500).json({ error: message });
    return;
  }

  reopenDatabase();
  res.json({
    sqlite: { sha256: hash.digest("hex"), bytes: dbBytes },
    mediaFiles,
    skipped,
  });
}

export function handleImportStatus(req: Request, res: Response): void {
  if (!authorizeImport(req, res)) return;
  res.json({
    postsByStatus: postCountsByStatus(),
    mediaFileCount: countMediaFiles(),
  });
}
