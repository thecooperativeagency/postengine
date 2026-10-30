/**
 * Production refuses to boot when a required setting is missing.
 * Development (npm run dev) stays unchanged so the Mac Mini can keep running
 * while Railway is being prepared.
 */

import { serviceAccountCanSign } from "./drive-api";

const REQUIRED_PRODUCTION_ENV = [
  "BASIC_AUTH_USER",
  "BASIC_AUTH_PASSWORD",
  "CRON_SECRET",
  "ZERNIO_API_KEY",
  "ANTHROPIC_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_URL",
  "PUBLIC_APP_URL",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
] as const;

export function productionEnvProblems(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (!process.env[name]?.trim()) problems.push(name);
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && !serviceAccountCanSign()) {
    problems.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  }
  return Array.from(new Set(problems));
}
