/**
 * Production refuses to boot when a required setting is missing.
 * Development (npm run dev) stays unchanged so the Mac Mini can keep running
 * while Railway is being prepared.
 */

const REQUIRED_PRODUCTION_ENV = [
  "CRON_SECRET",
  "ZERNIO_API_KEY",
] as const;

/** Present on the Mini .env. Missing values do not stop production boot. */
const OPTIONAL_ENV = [
  "CAPTION_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_URL",
  "CAPTION_PROVIDER",
  "CAPTION_BASE_URL",
  "CAPTION_MODEL",
  "GITHUB_TOKEN",
  "GITHUB_MEDIA_UPLOAD",
  "EPIDEMIC_SOUND_API_KEY",
  "PORSCHE_SALES_EMAIL_DIR",
  "PUBLIC_APP_URL",
  "TELEGRAM_SET_WEBHOOK",
  "IMPORT_TOKEN",
  "PUBLISH_ENABLED",
  "DRIVE_SCAN_ENABLED",
  "GOOGLE_SERVICE_ACCOUNT_JSON",
  "DRIVE_FOLDERS_JSON",
  "DRIVE_FOLDERS_PATH",
  "ENGINE_DASHBOARD_PASSWORD",
  "DASHBOARD_PINS_JSON",
] as const;

export function productionEnvProblems(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (!process.env[name]?.trim()) problems.push(name);
  }
  return problems;
}

export function optionalEnvUnset(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  return OPTIONAL_ENV.filter((name) => !process.env[name]?.trim());
}
