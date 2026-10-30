# PostEngine on Railway

This document is the map of what PostEngine is in this repository, and the deploy plan for moving it off Lance's Mac Mini. Nothing in this file is a secret. Set values in Railway or a local `.env`. Names only are listed here. An empty template is in `.env.example`.

This change does not deploy anything and does not call Railway.

## What PostEngine is

PostEngine is the social publishing app for The Cooperative Agency. It schedules and publishes posts for the dealership clients (BMW of Jackson, Brian Harris BMW, Audi Baton Rouge, Harris Porsche) plus the Luc OpenCRAW account. There is no separate "offers engine" service in this repo. Service specials and promo posts use the same pipeline (`postType` such as `Service` or `promo`). Static specials pages and email HTML under `seo-pages/` and `email-creative/` are marketing files, not a running service.

The running app is:

| Piece | Role |
|---|---|
| `client/` | React + Vite + Tailwind dashboard. Hash routes: `/`, `/posts`, `/posts/new`, `/queue`, `/calendar`, `/content-engine`, `/settings`. |
| `server/index.ts` | Express entry. Serves the API and, in production, the built client. |
| `server/routes.ts` | Dealerships, posts, cadence, activity, dashboard, Telegram webhook, Zernio publish, Drive scan. |
| `server/storage.ts` | SQLite via `better-sqlite3` and Drizzle. File name `sqlite.db`. |
| `server/zernio-publisher.ts` | Sends due posts to Zernio. Polls every 60 seconds inside the web process. |
| `server/drive-scanner.ts` | Sunday import. Lists, downloads, and archives Drive files through the Drive API. |
| `server/media-host.ts` | Stores downloaded images on the app volume and returns a URL on `PUBLIC_APP_URL`. |
| `server/drive-api.ts` | Service-account client for Drive. |
| `server/caption-writer.ts` | Writes captions with the Anthropic API. Template fallback if the key is absent. |
| `server/telegram-notify.ts` | Approval cards and the weekly summary. |
| `shared/schema.ts` | Drizzle table definitions. |
| `script/build.ts` | Vite client build + esbuild server bundle to `dist/index.cjs`. |
| `start.sh` | Mac Mini dev start. Loads `.env` and runs `PORT=3456 npm run dev`. |
| `.drive-folders.json` | Drive folder ids per client and post type. |
| `.zernio-accounts.json` | Zernio account ids per client and platform. Not an API key. |
| `media/`, `postengine/media/` | Older images committed for raw GitHub URLs. New images are not stored this way. |

Local commands:

- Dev: `bash start.sh` (port 3456) or `npm run dev` (port 5000 unless `PORT` is set).
- Production: `npm run build` then `npm start`. Listens on `PORT` or 5000, host `0.0.0.0`.

External APIs the server calls:

- Zernio `https://zernio.com/api/v1` for Instagram, Facebook, and Google Business posts.
- Google Drive API with a service account, for list, download, and archive.
- Anthropic Messages API for captions.
- Telegram Bot API for approval buttons and the weekly summary.
- This app's own `/media/hosted/` URLs for images Zernio must fetch. New posts do not push files into the git repo.

Database: one SQLite file. There is no Postgres and no Redis in this app. Do not add those plugins for PostEngine. The investment monitor in this repo uses Postgres and Redis. That app is not PostEngine.

Background work:

| Job | Where it runs today | Railway shape |
|---|---|---|
| Publish poller, every 60 seconds | Inside the Node process (`startPublishPoller`) | Stays inside the web service. It must share the SQLite file. A cron container cannot mount the same volume. |
| Drive scan, Sunday 2:00 AM America/Chicago | `scripts/weekly-scan.sh` via Mac crontab. The script's path (`postengine/social-post-manager`) does not match this repo. It curls `POST /api/drive/scan` on localhost:3456. | Cron service `postengine-weekly-scan`. |
| Weekly Telegram summary | `POST /api/notify/weekly`. No crontab calls it. The Mac script writes `/tmp/postengine-notify.txt` and expects Ada's heartbeat to notice. | The Railway cron calls this endpoint after the scan. |
| Overnight builder | `scripts/overnight-builder.sh` | Ada, not PostEngine. Not deployed. |

The Content Engine screen (`/#/content-engine`) reads cadence from the API and otherwise shows hardcoded shoots and brand notes. It is a page in this app, not another service.

## What is not PostEngine

Leave these on the Mac Mini with Ada. They are not in the Docker image (`.dockerignore`) and they are not Railway services:

- Assistant persona and memory: `AGENTS.md`, `SOUL.md`, `USER.md`, `MEMORY.md`, `HEARTBEAT.md`, `TOOLS.md`, `OPERATIONS.md`, `memory/`, `state/`, `.openclaw/`
- `clawchief/`, Todoist, calendar, and mail scripts
- Kalshi weather trading and `investment-monitor/`
- GA4 HTML dashboards, `ga4-query.sh`, `ga4-auth.py`
- `tas/` ad scraper, `seo-pages/`, vendor briefs, `email-creative/`, `email-triage/`
- `scraper.js` and `scrape_jalex.cjs` (Playwright). Playwright stays in `package.json` because those scripts import it. The image sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and the server never launches a browser.
- `scripts/overnight-builder.sh`
- Screenshots and saved HTML at the repo root

## Railway services

Config lives in `.railway/railway.ts` (TypeScript project config). There is no `railway.json` on purpose. This repo is TypeScript, and Railway will not let one service be owned by both files. A Dockerfile is used instead of Nixpacks because the repo root is the mixed workspace above, the server needs `ffmpeg`, and `better-sqlite3` is a native module.

`railway config apply` has not been run.

| Resource | Name | What it does |
|---|---|---|
| Web service | `postengine` | Docker build, start `npm start`, healthcheck `GET /api/health`, one replica, restart on failure. |
| Volume | `postengine-data` | Mounted at `/data` on the web service only. SQLite file `/data/sqlite.db`. 1024 MB. |
| Cron service | `postengine-weekly-scan` | Same image and repo. Start `node scripts/railway-weekly-scan.mjs`. Schedule `0 7 * * 0` (07:00 UTC Sunday = 02:00 CDT, 01:00 CST). Restart policy never. No volume. |
| Postgres | none | Not used. |
| Redis | none | Not used. |
| Bucket | none yet | See the media blocker below. |

Watch patterns in `.railway/railway.ts` limit rebuilds to the app paths. They take effect only after the config is applied. Until then, a push to the connected branch rebuilds the service.

The cron container calls the web service over Railway private networking:

- `POST /api/drive/scan`
- `POST /api/notify/weekly`

Build and start:

- Builder: Dockerfile at the repo root.
- Image start (web): `npm start` → `node dist/index.cjs`.
- Health: `GET /api/health` returns `{"status":"ok","service":"postengine"}`. It is not behind basic auth.
- Port: Railway sets `PORT`. The process listens on `0.0.0.0`.

Do not scale the web service past one replica. SQLite allows one writer.

## The live Mac Mini app is not this branch

The process on the Mini is one Node server on port 3456, started by launchd `com.postengine`, reached through a Cloudflare tunnel at `postengine.thecoopbrla.com`. It runs from a nested checkout, `postengine/social-post-manager`, whose git HEAD is commit `1fb3d6eb095c4e21b8f8f86cc3dd82c5e0d6be5d` (2026-04-20, "Fix review queue: filter on pending_review status not queued"). Its database file is `~/.postengine/sqlite.db`, not `./sqlite.db`.

That commit is in this repository. It is an ancestor of `main`, of this branch, and of `origin/archive/pre-engine-hub-content-cut-2026-08-03`. The commit itself changes only `client/src/pages/review-queue.tsx` and one jpg. Its tree does not contain `server/reel-pipeline.ts`, an `engine_jobs` table, `GET /api/engine/status`, dashboard password auth, or the `~/.postengine/sqlite.db` path.

Later commits that are **not** on `main` do contain related code:

- `86953a3d` (2026-05-08) adds an engine hub. It is not on `main`.
- `origin/archive/pre-engine-hub-content-cut-2026-08-03` (`a5b1cb2d`, 2026-08-03) contains `server/reel-pipeline.ts`, `engine_jobs`, `GET /api/engine/status`, `server/dashboard-auth.ts` (`ENGINE_DASHBOARD_PASSWORD`), and `scripts/friday-queue-reminder.sh` (reads `~/.postengine/sqlite.db`). `f6bd7864` then deletes the engine hub and offer scrapers; that cut is not on `main` either.

This PR does not copy any of that code. The Mini working tree can differ from both `1fb3d6eb` and the archive branch, and `reel-pipeline.ts` on the archive branch is not proof it matches the file on the Mini. Before cutover, put the Mini's exact tree on a branch and diff it. See the first cutover step.

## Google Drive service account

Drive no longer shells out to `gog`. A service account is the right credential for a container: there is no browser on Railway, and the Mini's `gog` user tokens were expiring (Google OAuth testing mode, about 7 days). The key is one JSON value in an env var. The account can only see folders Lance shares with it. Domain-wide delegation would expose the whole Workspace and needs a Workspace admin, so it is not used.

Setup:

1. In Google Cloud, enable the Google Drive API on a project.
2. Create a service account and a JSON key. Do not commit the file.
3. Put the key in `GOOGLE_SERVICE_ACCOUNT_JSON` as one JSON object. `jq -c . key.json` prints a single line. The object must include `client_email` and `private_key`.
4. Share these Drive folders with that `client_email` as **Editor** (Viewer can list and download, and cannot move files into `_Archive`). Share each dealership root. The ids are the `root` values in `.drive-folders.json`: Brian Harris BMW, BMW of Jackson, Audi Baton Rouge, Harris Porsche, and Luc OpenCRAW. Confirm the child folders the scanner uses are included: New Cars, Pre-Owned Cars, Service, Parts & Accessories, `_Archive`, and for OpenCRAW `Posts` plus `_Archive`. Sharing the root usually covers the children. If a child was shared separately and inheritance is off, share that child as Editor too.
5. Production will not start until `GOOGLE_SERVICE_ACCOUNT_JSON` is set and parses as a key.

A successful list with no images or videos is an empty folder. A token, permission, or network failure fails the scan. It does not report zero new posts.

## Media files

New images are copied onto the volume at `MEDIA_DIR` (Railway: `/data/media`, next to the SQLite file) and served at `/media/hosted/<file>`. The URL stored on the post is `PUBLIC_APP_URL` plus that path. `/media/hosted` is public so Zernio can fetch it. Filenames start with random bytes. There is no directory listing. Basic auth still covers the dashboard.

`GITHUB_TOKEN` is no longer required to publish. It is only for the one-time migration if `raw.githubusercontent.com` URLs stop being anonymous.

Migration, once, after `PUBLIC_APP_URL` points at the new host and before the git repo is made private:

`POST /api/media/migrate-github` with header `X-Cron-Secret`.

That rewrites `draft`, `queued`, and `scheduled` posts whose `media_urls` still point at GitHub. Published posts are left as they are. If a download fails, that URL is kept and `failed` is counted. Set `GITHUB_TOKEN` with contents read on the repo if the files are already private.

## Environment variables

Set these on the **web** service unless noted. Values stay out of git.

Production (`npm start` / the Railway image) exits before it listens if any of these are missing or if `GOOGLE_SERVICE_ACCOUNT_JSON` is not a key this process can sign with (`client_email` and `private_key`):

`BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`, `CRON_SECRET`, `ZERNIO_API_KEY`, `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `PUBLIC_APP_URL`, `GOOGLE_SERVICE_ACCOUNT_JSON`.

`npm run dev` does not apply that check.

| Name | Service | What it is for |
|---|---|---|
| `PORT` | web | Listen port. Railway sets this. The live Mini uses 3456. Code default is 5000. |
| `NODE_ENV` | web | `production` selects the static build and the required-env check. The production bundle bakes this in. |
| `SQLITE_PATH` | web | SQLite file. Railway value `/data/sqlite.db`. The Mini file to copy is `~/.postengine/sqlite.db`. |
| `RAILWAY_VOLUME_MOUNT_PATH` | web | Injected by Railway when a volume is mounted. |
| `MEDIA_DIR` | web | Image directory. Railway value `/data/media`. |
| `BASIC_AUTH_USER` | web | HTTP basic auth username. Required in production. This is not the Mini's dashboard password. |
| `BASIC_AUTH_PASSWORD` | web | HTTP basic auth password. Required in production. |
| `CRON_SECRET` | web and cron | Shared secret. Header `X-Cron-Secret`. Required in production. Gates Drive scan, weekly summary, GitHub media migration, and `GET /api/reports/friday-queue`. Also bypasses basic auth. |
| `ZERNIO_API_KEY` | web | Bearer token for the Zernio API. Required in production. |
| `ANTHROPIC_API_KEY` | web | Caption generation. Required in production. Dev still falls back to a template if this is empty. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | web | Service account key JSON. Required in production. |
| `TELEGRAM_BOT_TOKEN` | web | Dedicated PostEngine bot. Required in production. Do not reuse Ada's bot. |
| `TELEGRAM_CHAT_ID` | web | Destination chat. Required in production. |
| `TELEGRAM_WEBHOOK_SECRET` | web | Checked on `POST /api/telegram/webhook`. Required in production. |
| `TELEGRAM_WEBHOOK_URL` | web | Public `https` URL of `/api/telegram/webhook`. Required in production. |
| `TELEGRAM_SET_WEBHOOK` | web | Set to `1` to call Telegram `setWebhook` on boot. |
| `PUBLIC_APP_URL` | web | Origin for media URLs and the queue link in Telegram. Required in production. No localhost default there. |
| `GITHUB_TOKEN` | web | Optional. Contents read, only for `POST /api/media/migrate-github` if GitHub raw URLs are private. |
| `FFMPEG_PATH` | web | ffmpeg binary. Image uses `ffmpeg`. Homebrew path is still used on the Mini when that file exists. |
| `FFPROBE_PATH` | web | ffprobe binary. Same rule as ffmpeg. |
| `DRIVE_FOLDERS_PATH` | web | Folder map. Default `./.drive-folders.json`, copied into the image. |
| `ZERNIO_ACCOUNTS_PATH` | web | Zernio account map. Default `./.zernio-accounts.json`, copied into the image. |
| `POSTENGINE_URL` | cron | Full base URL of the web service. Optional if host and port are set. |
| `POSTENGINE_HOST` | cron | Private hostname. `.railway/railway.ts` references `RAILWAY_PRIVATE_DOMAIN`. |
| `POSTENGINE_PORT` | cron | Web service `PORT`. |
| `POSTENGINE_SCHEME` | cron | `http` on the private network. |

Also set `CRON_SECRET` on the cron service to the same value.

## Mac Mini dependencies

| Dependency | Used for | Railway plan |
|---|---|---|
| Nested checkout `social-post-manager` at `1fb3d6eb`, plus uncommitted files | The process that is actually live | Copy that working tree to a branch and diff before cutover. This PR does not include it. |
| `~/.postengine/sqlite.db` | Live posts | Copy this file to `/data/sqlite.db`. Not `./sqlite.db` from the git checkout. |
| launchd `com.postengine` on port 3456 | Keeps the one Node process up. A killed process is restarted. | `launchctl bootout` before Railway's publish loop starts. |
| Cloudflare tunnel `postengine.thecoopbrla.com` | Public hostname to localhost:3456 | Point the hostname at Railway only after the Mini process is stopped. |
| `gog` | Old Drive access | Removed from this app. Service account replaces it. Ada can keep `gog` for mail and calendar. |
| Homebrew ffmpeg | Instagram crop | In the image. |
| GitHub raw URLs in `media/` | Public image links for Zernio | Replaced by `/media/hosted` on the volume. Migrate queued posts before the repo goes private. |
| Ada's Telegram bot | Must not be the PostEngine webhook | New bot. |
| Friday job that reads SQLite directly | Queue reminder. The 08:00 job is not in this git history. The archive branch has `scripts/friday-queue-reminder.sh` at 10:45 AM CDT, which counts queued posts and scheduled posts in the next 14 days. | `GET /api/reports/friday-queue` returns those three counts. Point the live job at it after the Mini diff confirms the SQL. |
| Mac crontab `scripts/weekly-scan.sh` | Sunday scan against localhost | Replaced by the Railway cron. Disable the Mini entry after cutover. |

## Blockers and open questions

1. **Diff the Mini tree before trusting this deploy.** Head `1fb3d6eb` is in git and does not contain the engine, reels, or PIN behavior described on the Mini. The archive branch has a later snapshot of some of that, and it is not on `main`. Treat both as clues, not as the live source.

2. **Basic auth here is not the Mini's dashboard password.** Production requires `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD`. `GET /api/health` and `/media/hosted` stay public. The Telegram webhook checks `TELEGRAM_WEBHOOK_SECRET`.

3. **Telegram must be a new bot.** `setWebhook` on Ada's bot takes her updates. Set `TELEGRAM_SET_WEBHOOK=1` only for the new bot.

4. **Copy `~/.postengine/sqlite.db` before the first real boot.** An empty database seeds sample posts, including one `scheduled` post that the poller will publish. Checkpoint first: `sqlite3 ~/.postengine/sqlite.db "PRAGMA wal_checkpoint(TRUNCATE);"`. Copy to `/data/sqlite.db`. If a seeded file was created, stop the service and replace `sqlite.db`, `sqlite.db-wal`, and `sqlite.db-shm`.

5. **One replica, one volume, web service only.** The cron job uses HTTP. Two web replicas will corrupt SQLite.

6. **Media URLs need `PUBLIC_APP_URL` to be the public origin** Zernio can reach, with `/media/hosted` not behind basic auth. That is how this app serves them.

7. **Every Zernio attachment is still sent as `type: "image"`.** Video posts are not given a video type.

8. **No offers engine is deployed from this branch.** Offer review and engine hub commits exist off `main`. They are not imported here.

9. **Sunday cron is UTC.** `0 7 * * 0` is 2:00 AM CDT and 1:00 AM CST.

10. **Config is not applied.** `.railway/railway.ts` was not planned or applied.

## Cutover

1. On the Mini, in the nested checkout that is actually running, record `git rev-parse HEAD` and `git status`. Create a branch from that checkout and commit the app files that are not on GitHub (`server/`, `client/`, `shared/`, `package.json`, `package-lock.json`, and any `reel-pipeline.ts`). Do not add `.env`, `sqlite.db`, or credential JSON. Push that branch. Diff it against this PR and against `origin/archive/pre-engine-hub-content-cut-2026-08-03`. Do not cut over until that diff is reviewed. This PR does not guess those files.
2. Merge PR #2 and this PR only after that diff says this server is the one to run, or after the missing Mini files are brought onto the deploy branch on purpose.
3. Create the service account, share the folders listed above, and set every required env var. Review `railway config plan` before apply. That creates the web service, the volume, and the Sunday cron. It does not create Postgres, Redis, or a bucket.
4. Checkpoint and copy `~/.postengine/sqlite.db` to `/data/sqlite.db` before the first production boot.
5. Stop the Mini publisher **before** Railway starts its 60-second publish loop. Unload launchd so it does not restart the process: `launchctl bootout gui/$(id -u)/com.postengine`. If the label lives in `~/Library/LaunchAgents/com.postengine.plist`, `launchctl unload` that plist as well. Confirm `launchctl print gui/$(id -u)/com.postengine` does not show a running job. Killing node alone is not enough.
6. Start Railway. Confirm `GET /api/health` and that the dashboard shows the copied posts, not seed data.
7. Set `TELEGRAM_SET_WEBHOOK=1` for the new bot. Confirm an approval button updates a post.
8. Run `POST /api/media/migrate-github` once. Confirm a queued post's `media_urls` now start with `PUBLIC_APP_URL/media/hosted/`.
9. Run the Sunday scan command once by hand. An empty folder is success with zero posts. An auth error is a failure.
10. Point the external Friday job at `GET /api/reports/friday-queue` with `X-Cron-Secret` instead of opening the SQLite file. The live 08:00 script is not in this repo. The endpoint matches the archive script's three counts (queued total, queued by store, scheduled in the next 14 days). Change the SQL only after the Mini diff shows a different query.
11. Disable the Mini crontab entry for `scripts/weekly-scan.sh`. Leave Ada's other agents on the Mini.
12. Point `postengine.thecoopbrla.com` at Railway and set `PUBLIC_APP_URL` to that origin. Do this only after step 5, or the tunnel and Railway will both be attached to publishers.

The Mini process and the Railway process must not run the publish loop at the same time. They would both send due posts to Zernio.
