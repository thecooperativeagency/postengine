import type { Request, Response, NextFunction } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cronAuthorized } from "./auth";

export const ENGINE_DASHBOARD_PASSWORD_ENV = "ENGINE_DASHBOARD_PASSWORD";
export const DASHBOARD_PINS_JSON_ENV = "DASHBOARD_PINS_JSON";
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

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;
const ADMIN_NAME = "admin";

/** Short token from the PIN example. The database has no slug column. */
const NAME_ALIASES: Record<string, string> = {
  bhbmw: "brianharrisbmw",
};

export type DealershipRef = {
  id: number;
  name: string;
  domain: string;
  instagramHandle?: string | null;
};

export type DashboardPrincipal = {
  name: string;
  /** null means every dealership, which is the shared-PIN behavior. */
  dealershipIds: number[] | null;
};

type StoredPin = DashboardPrincipal & {
  salt: Buffer;
  hash: Buffer;
};

declare global {
  namespace Express {
    interface Request {
      dashboardUser?: DashboardPrincipal;
    }
  }
}

let dealerships: DealershipRef[] = [];
let cachedKey = "";
let cachedUsers: StoredPin[] = [];
let cachedProblems: string[] = [];
const failures = new Map<string, number[]>();

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function setDashboardDealerships(rows: DealershipRef[]) {
  dealerships = rows;
  cachedKey = "";
}

export function clearDashboardAuthState() {
  cachedKey = "";
  cachedUsers = [];
  cachedProblems = [];
  failures.clear();
}

function dealershipIndex(): Map<string, number> {
  const index = new Map<string, number>();
  for (const dealer of dealerships) {
    const nameKey = normalizeToken(dealer.name);
    const add = (token: string | number | null | undefined) => {
      const key = normalizeToken(String(token ?? ""));
      if (key && !index.has(key)) index.set(key, dealer.id);
    };
    add(dealer.id);
    add(dealer.name);
    add(dealer.domain);
    add((dealer.domain || "").split(".")[0]);
    add((dealer.instagramHandle || "").replace(/^@/, ""));
    for (const [alias, target] of Object.entries(NAME_ALIASES)) {
      if (target === nameKey) add(alias);
    }
  }
  return index;
}

function hashPin(pin: string, salt = randomBytes(16)): { salt: Buffer; hash: Buffer } {
  return { salt, hash: scryptSync(pin, salt, 32) };
}

function pinsMatch(candidate: string, stored: StoredPin): boolean {
  const hash = scryptSync(candidate, stored.salt, 32);
  return timingSafeEqual(hash, stored.hash);
}

function loadPins(): { users: StoredPin[]; problems: string[] } {
  const admin = process.env[ENGINE_DASHBOARD_PASSWORD_ENV]?.trim() || "";
  const raw = process.env[DASHBOARD_PINS_JSON_ENV]?.trim() || "";
  const key = `${admin}\n${raw}\n${dealerships.map((d) => `${d.id}:${d.name}:${d.domain}`).join("|")}`;
  if (key === cachedKey) return { users: cachedUsers, problems: cachedProblems };

  const problems: string[] = [];
  const users: StoredPin[] = [];
  const seen = new Set<string>();

  const remember = (pin: string) => {
    if (seen.has(pin)) return false;
    seen.add(pin);
    return true;
  };

  if (process.env.NODE_ENV === "production" && !admin && !raw) {
    problems.push("ENGINE_DASHBOARD_PASSWORD or DASHBOARD_PINS_JSON");
  }

  if (admin) {
    remember(admin);
    const hashed = hashPin(admin);
    users.push({ name: ADMIN_NAME, dealershipIds: null, ...hashed });
  }

  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      problems.push("DASHBOARD_PINS_JSON is not valid JSON");
      parsed = null;
    }
    if (parsed !== null && !Array.isArray(parsed)) {
      problems.push("DASHBOARD_PINS_JSON must be an array");
    }
    const index = dealershipIndex();
    if (Array.isArray(parsed)) {
      parsed.forEach((entry, i) => {
        const row = entry as { name?: unknown; pin?: unknown; dealerships?: unknown };
        const name = typeof row?.name === "string" ? row.name.trim() : "";
        const pin = typeof row?.pin === "string" ? row.pin.trim() : "";
        if (!name) problems.push(`DASHBOARD_PINS_JSON entry ${i + 1} is missing a name`);
        if (!/^\d{5}$/.test(pin)) {
          problems.push(`DASHBOARD_PINS_JSON entry ${i + 1} PIN must be 5 digits`);
          return;
        }
        if (!remember(pin)) {
          problems.push(admin && pin === admin
            ? "DASHBOARD_PINS_JSON duplicates ENGINE_DASHBOARD_PASSWORD"
            : "DASHBOARD_PINS_JSON has a duplicate PIN");
          return;
        }
        let dealershipIds: number[] | null = null;
        if (row.dealerships !== undefined) {
          if (!Array.isArray(row.dealerships)) {
            problems.push(`DASHBOARD_PINS_JSON entry ${i + 1} dealerships must be an array`);
            return;
          }
          const ids: number[] = [];
          for (const token of row.dealerships) {
            const key = normalizeToken(String(token ?? ""));
            const id = index.get(key);
            if (!id) {
              problems.push(`DASHBOARD_PINS_JSON dealership not found: ${String(token)}`);
              continue;
            }
            if (!ids.includes(id)) ids.push(id);
          }
          dealershipIds = ids;
        }
        const hashed = hashPin(pin);
        users.push({ name: name || `entry ${i + 1}`, dealershipIds, ...hashed });
      });
    }
  }

  cachedKey = key;
  cachedUsers = problems.length ? [] : users;
  cachedProblems = problems;
  return { users: cachedUsers, problems };
}

export function dashboardAuthProblems(): string[] {
  return loadPins().problems;
}

export function isDashboardProtectionEnabled() {
  return loadPins().users.length > 0;
}

export function dashboardLoginMessage(name: string) {
  return `Dashboard login: ${name}`;
}

export function authenticateDashboardPin(password?: string | null): DashboardPrincipal | null {
  const candidate = password?.trim() || "";
  if (!candidate) return null;
  const { users } = loadPins();
  let matched: DashboardPrincipal | null = null;
  for (const user of users) {
    if (pinsMatch(candidate, user)) {
      matched = { name: user.name, dealershipIds: user.dealershipIds };
    }
  }
  return matched;
}

export function isAuthorizedDashboardPassword(password?: string | null) {
  if (!isDashboardProtectionEnabled()) return true;
  return Boolean(authenticateDashboardPin(password));
}

export function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function dashboardFailureLimited(ip: string, now = Date.now()): boolean {
  const recent = (failures.get(ip) || []).filter((at) => now - at < FAILURE_WINDOW_MS);
  failures.set(ip, recent);
  return recent.length >= MAX_FAILURES;
}

export function recordDashboardFailure(ip: string, now = Date.now()) {
  const recent = (failures.get(ip) || []).filter((at) => now - at < FAILURE_WINDOW_MS);
  recent.push(now);
  failures.set(ip, recent);
}

export function dashboardDealershipIds(req: Request): number[] | null {
  if (!req.dashboardUser) return null;
  return req.dashboardUser.dealershipIds;
}

export function dashboardCanSeeDealership(req: Request, dealershipId: number): boolean {
  const ids = dashboardDealershipIds(req);
  if (ids === null) return true;
  return ids.includes(dealershipId);
}

export function readDashboardPassword(req: Request) {
  const headerValue = req.get(ENGINE_DASHBOARD_HEADER) || req.get("x-dashboard-pin");
  if (headerValue) return headerValue;
  if (typeof req.body?.pin === "string") return req.body.pin;
  if (typeof req.body?.password === "string") return req.body.password;
  return null;
}

function rejectPin(req: Request, res: Response) {
  const ip = clientIp(req);
  if (dashboardFailureLimited(ip)) {
    return res.status(429).json({
      ok: false,
      error: "Too many attempts",
      message: "Too many attempts. Try again in a few minutes.",
    });
  }
  const user = authenticateDashboardPin(readDashboardPassword(req));
  if (!user) {
    recordDashboardFailure(ip);
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      message: "Valid dashboard PIN required",
    });
  }
  req.dashboardUser = user;
  return null;
}

export function requireDashboardPassword(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api") || !isDashboardProtectionEnabled()) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  if (CRON_SECRET_PATHS.has(req.path) && cronAuthorized(req)) return next();
  const rejected = rejectPin(req, res);
  if (rejected) return;
  return next();
}

export function checkDashboardPin(req: Request, res: Response) {
  if (!isDashboardProtectionEnabled()) {
    return res.json({ ok: true, enabled: false });
  }
  const rejected = rejectPin(req, res);
  if (rejected) return;
  const name = req.dashboardUser?.name || "unknown";
  console.log(dashboardLoginMessage(name));
  return res.json({ ok: true, enabled: true, name });
}
