/**
 * Desired Railway project for PostEngine.
 * This file is not applied from CI. Run `railway config plan` locally,
 * review it, and apply only when Lance asks. Do not commit secret values.
 *
 * Postgres and Redis are intentionally absent. PostEngine stores posts in
 * SQLite on a volume. See docs/RAILWAY_DEPLOY.md.
 */
import { defineRailway, github, group, project, service, volume } from "railway/iac";

const watchPatterns = [
  "client/**",
  "server/**",
  "shared/**",
  "script/**",
  "scripts/railway-weekly-scan.mjs",
  "package.json",
  "package-lock.json",
  "Dockerfile",
  ".dockerignore",
  "vite.config.ts",
  "tsconfig.json",
  "tailwind.config.ts",
  "postcss.config.js",
  "components.json",
  ".railway/**",
  ".drive-folders.json",
  ".zernio-accounts.json",
];

const build = {
  builder: "DOCKERFILE" as const,
  dockerfilePath: "Dockerfile",
  watchPatterns,
};

export default defineRailway(() => {
  const data = volume("postengine-data", { sizeMB: 1024 });
  const source = github("thecooperativeagency/postengine", { branch: "main" });

  const web = service("postengine", {
    source,
    build,
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: 1,
    deploy: {
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
    },
    volumeMounts: {
      "/data": data,
    },
    env: {
      NODE_ENV: "production",
      SQLITE_PATH: "/data/sqlite.db",
      FFMPEG_PATH: "ffmpeg",
      FFPROBE_PATH: "ffprobe",
      MEDIA_DIR: "/data/media",
    },
  });

  // 07:00 UTC Sunday = 02:00 CDT / 01:00 CST.
  const weekly = service("postengine-weekly-scan", {
    source: github("thecooperativeagency/postengine", { branch: "main" }),
    build: { ...build, watchPatterns: [...watchPatterns] },
    start: "node scripts/railway-weekly-scan.mjs",
    deploy: {
      cronSchedule: "0 7 * * 0",
      restartPolicyType: "NEVER",
    },
    env: {
      POSTENGINE_HOST: web.env.RAILWAY_PRIVATE_DOMAIN,
      POSTENGINE_PORT: web.env.PORT,
      POSTENGINE_SCHEME: "http",
    },
  });

  return project("postengine", {
    resources: group("PostEngine", [web, weekly, data]),
  });
});
