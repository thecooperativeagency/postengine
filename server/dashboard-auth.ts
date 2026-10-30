import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { cronAuthorized } from "./auth";

export const ENGINE_DASHBOARD_PASSWORD_ENV = "ENGINE_DASHBOARD_PASSWORD";
export const ENGINE_DASHBOARD_HEADER = "x-dashboard-password";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/config",
  "/api/auth/check",
  "/api/health",
  "/api/telegram/webhook",
  "/api/admin/import",
  "/api/admin/import/status",
  "/api/reports/friday-queue",
]);

// Railway cron presents X-Cron-Secret. Managers still use the PIN.
const CRON_SECRET_PATHS = new Set([
  "/api/drive/scan",
  "/api/notify/weekly",
]);

function normalizedExpectedPassword() {
  return process.env[ENGINE_DASHBOARD_PASSWORD_ENV]?.trim() || "";
}

export function isDashboardProtectionEnabled() {
  return normalizedExpectedPassword().length > 0;
}

function timingSafeEqualText(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return timingSafeEqual(aBuffer, bBuffer);
}

export function isAuthorizedDashboardPassword(password?: string | null) {
  const expected = normalizedExpectedPassword();
  if (!expected) {
    return true;
  }

  const candidate = password?.trim() || "";
  if (!candidate) {
    return false;
  }

  return timingSafeEqualText(candidate, expected);
}

export function readDashboardPassword(req: Request) {
  const headerValue = req.get(ENGINE_DASHBOARD_HEADER) || req.get("x-dashboard-pin");
  if (headerValue) {
    return headerValue;
  }

  // PIN gate accepts either field name so older clients/scripts keep working.
  if (typeof req.body?.pin === "string") {
    return req.body.pin;
  }

  if (typeof req.body?.password === "string") {
    return req.body.password;
  }

  return null;
}

export function requireDashboardPassword(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api") || !isDashboardProtectionEnabled()) {
    return next();
  }

  if (PUBLIC_API_PATHS.has(req.path)) {
    return next();
  }

  if (CRON_SECRET_PATHS.has(req.path) && cronAuthorized(req)) {
    return next();
  }

  if (isAuthorizedDashboardPassword(readDashboardPassword(req))) {
    return next();
  }

  return res.status(401).json({
    error: "Unauthorized",
    message: "Valid dashboard PIN required",
  });
}
