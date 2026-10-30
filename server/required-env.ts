/**
 * Production refuses to boot when a required setting is missing.
 * Development (npm run dev) stays unchanged so the Mac Mini can keep running
 * while Railway is being prepared.
 */

import { serviceAccountCanSign } from "./drive-api";
import { driveFoldersConfigured } from "./drive-scanner";

const REQUIRED_PRODUCTION_ENV = [
  "BASIC_AUTH_USER",
  "BASIC_AUTH_PASSWORD",
  "CRON_SECRET",
  "ZERNIO_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_URL",
  "PUBLIC_APP_URL",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
] as const;

/** Present on the Mini .env. Missing values do not stop production boot. */
const OPTIONAL_ENV = [
  "CAPTION_API_KEY",
  "CAPTION_PROVIDER",
  "CAPTION_BASE_URL",
  "CAPTION_MODEL",
  "GITHUB_TOKEN",
  "GITHUB_MEDIA_UPLOAD",
  "ENGINE_DASHBOARD_PASSWORD",
  "EPIDEMIC_SOUND_API_KEY",
  "TELEGRAM_SET_WEBHOOK",
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
  if (!driveFoldersConfigured()) {
    problems.push("DRIVE_FOLDERS_JSON or DRIVE_FOLDERS_PATH");
  }
  return Array.from(new Set(problems));
}

export function optionalEnvUnset(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  return OPTIONAL_ENV.filter((name) => !process.env[name]?.trim());
}
