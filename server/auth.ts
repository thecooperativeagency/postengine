import crypto from "crypto";
import type { NextFunction, Request, Response } from "express";

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  return safeEqual(req.get("x-cron-secret") || "", secret);
}

/**
 * Optional HTTP basic auth for a public Railway URL.
 * Unset credentials leave local Mac Mini access unchanged.
 * /api/health stays open for the platform healthcheck.
 * The Telegram webhook stays open and is checked separately.
 * A valid X-Cron-Secret bypasses basic auth for the weekly job.
 */
export function requireBasicAuth(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/api/health" || req.path === "/api/telegram/webhook") return next();
  if (cronAuthorized(req)) return next();

  const user = process.env.BASIC_AUTH_USER || "";
  const pass = process.env.BASIC_AUTH_PASSWORD || "";
  if (!user || !pass) return next();

  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (
      idx >= 0 &&
      safeEqual(decoded.slice(0, idx), user) &&
      safeEqual(decoded.slice(idx + 1), pass)
    ) {
      return next();
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="PostEngine"');
  return res.status(401).send("Authentication required");
}

/** When CRON_SECRET is set, operational endpoints must present it. */
export function requireCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return true;
  if (cronAuthorized(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}
