import crypto from "crypto";
import type { Request, Response } from "express";

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

/** When CRON_SECRET is set, operational endpoints must present it. */
export function requireCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return true;
  if (cronAuthorized(req)) return true;
  res.status(401).json({ error: "Unauthorized" });
  return false;
}
