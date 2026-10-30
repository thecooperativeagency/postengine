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
| `server/drive-scanner.ts` | Friday import. Lists, downloads, and archives Drive files through the Drive API. |
| `server/media-host.ts` | Stores downloaded images on the app volume and returns a URL on `PUBLIC_APP_URL`. |
| `server/drive-api.ts` | Service-account client for Drive. |
| `server/caption-writer.ts` | Writes captions through `CAPTION_API_KEY`. Default provider is Nous. Template fallback if the key is absent. |
| `server/telegram-notify.ts` | Approval cards and the weekly summary. No-op when the bot token or chat id is unset. |
| `shared/schema.ts` | Drizzle table definitions. |
| `script/build.ts` | Vite client build + esbuild server bundle to `dist/index.cjs`. |
| `start.sh` | Mac Mini dev start. Loads `.env` and runs `PORT=3456 npm run dev`. |
| `.drive-folders.example.json` | Shape of the Drive map. Real folder ids are not in git. |
| `.zernio-accounts.json` | Zernio account ids per client and platform. Not an API key. |
| `media/`, `postengine/media/` | Older images committed for raw GitHub URLs. New images are not stored this way. |

Local commands:

- Dev: `bash start.sh` (port 3456) or `npm run dev` (port 5000 unless `PORT` is set).
- Production: `npm run build` then `npm start`. Listens on `PORT` or 5000, host `0.0.0.0`.

External APIs the server calls:

- Zernio `https://zernio.com/api/v1` for Instagram, Facebook, and Google Business posts.
- Google Drive API with a service account, for list, download, and archive.
- Caption API (`CAPTION_PROVIDER`, default Nous) for captions.
- Telegram Bot API for approval buttons and the weekly summary, only when both Telegram variables are set.
- This app's own `/media/generated/` URLs for images Zernio must fetch. GitHub upload is off unless `GITHUB_MEDIA_UPLOAD=1`, and the stored URL is still the volume URL.

Database: one SQLite file. There is no Postgres and no Redis in this app. Do not add those plugins for PostEngine. The investment monitor in this repo uses Postgres and Redis. That app is not PostEngine.

Background work:

| Job | Where it runs today | Railway shape |
|---|---|---|
| Publish poller, every 60 seconds | Inside the Node process (`startPublishPoller`) | Stays inside the web service. It must share the SQLite file. A cron container cannot mount the same volume. |
| Drive scan, Friday 08:00 America/Chicago | Live Mini crontab. Curls `POST /api/drive/scan` on localhost:3456. | Cron `postengine-weekly-scan`, `0 13 * * 5` UTC. |
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
| Volume | `postengine-data` | Mounted at `/data` on the web service only. SQLite at `/data/sqlite.db`, generated media at `/data/media/generated`. 8192 MB, sized for the Mini's ~2 GB media tree. |
| Cron service | `postengine-weekly-scan` | Same image and repo. Start `node scripts/railway-weekly-scan.mjs`. Schedule `0 13 * * 5` (13:00 UTC Friday). Restart policy never. No volume. |
| Postgres | none | Not used. |
| Redis | none | Not used. |
| Bucket | none | Generated media lives on the volume at `/data/media/generated`. |

Watch patterns in `.railway/railway.ts` limit rebuilds to the app paths. They take effect only after the config is applied. Until then, a push to the connected branch rebuilds the service.

The cron container calls the web service over Railway private networking:

- `POST /api/drive/scan`
- `POST /api/notify/weekly`

Build and start:

- Builder: Dockerfile at the repo root.
- Image start (web): `npm start` → `node dist/index.cjs`.
- Health: `GET /api/health` returns `{"status":"ok","service":"postengine"}`. It is not behind the dashboard PIN.
- Port: Railway sets `PORT`. The process listens on `0.0.0.0`.

Do not scale the web service past one replica. SQLite allows one writer.

## Source of truth

App behavior on this branch is `mini/live-snapshot-2026-10-30` at `0556d95236d1872e39ed32c28f92fc47231003ca`, plus the Railway overlay in this PR. That snapshot is the Mini tree that was built into the running dist on Oct 21. It includes `server/reel-pipeline.ts` and `server/specials-talking-sync.ts`.

`main` does not contain that tree. Commit `1fb3d6eb` (2026-04-20) is only a review-queue filter. The archive branch `origin/archive/pre-engine-hub-content-cut-2026-08-03` (`a5b1cb2d`, 2026-08-03) is older than the snapshot. Offer-scraper files that exist only on the archive (`audi-offers-detector.ts`, `bmw-offers-detector.ts`, `content-engine-build-manifest.ts`, `email-iteration-config.ts`, `email-iteration-offers.ts`) are not in the live process and are not restored here.

Nothing from archive or `main` replaces a snapshot file. The Railway overlay is Dockerfile, `.railway/railway.ts`, health, volume paths, the publish kill switch, the import endpoints, Drive via service account, the Friday cron, optional Telegram, Nous captions, the friday-queue report, and production env checks.

## Google Drive service account

Drive no longer shells out to `gog`. A service account is the right credential for a container: there is no browser on Railway, and the Mini's `gog` user tokens were expiring (Google OAuth testing mode, about 7 days). The key is one JSON value in an env var. The account can only see folders Lance shares with it. Domain-wide delegation would expose the whole Workspace and needs a Workspace admin, so it is not used.

Setup:

1. In Google Cloud, enable the Google Drive API on a project.
2. Create a service account and a JSON key. Do not commit the file.
3. Put the key in `GOOGLE_SERVICE_ACCOUNT_JSON` as one JSON object. `jq -c . key.json` prints a single line. The object must include `client_email` and `private_key`.
4. Share the Drive parent folder named `Postengine` (account `lance@thecoopbrla.com`) with that `client_email` as **Editor**. Viewer can list and download, and cannot move files into `_Archive`. Editor on the parent covers the children when inheritance is on. Each store uses New Cars, Pre-Owned Cars, Service, Parts & Accessories, Customer Media, and `_Archive`. Harris Porsche also has Reels. If a child was shared separately and inheritance is off, share that child as Editor too.
5. Put the folder map in `DRIVE_FOLDERS_JSON` (the JSON text) or in a file at `DRIVE_FOLDERS_PATH` (Railway default `/data/.drive-folders.json`). Shape is `.drive-folders.example.json`. Do not commit real folder ids. Both the key and the folder map are optional at boot. Until they are set, the process still starts, and `POST /api/drive/scan` returns `{skipped:true, reason:"drive not configured"}`. Dashboard, Zernio publishing, `/media/generated`, and the import endpoint do not need them. Set them before the first real Friday scan.

A successful list with no images or videos is an empty folder. A token, permission, or network failure fails the scan. It does not report zero new posts.

## Media files

Live posts already point at `https://postengine.thecoopbrla.com/media/generated/...`. GitHub upload on the Mini is failing on bad credentials and falling back to those local files. About 2.0 GB and 567 files sit in `~/.postengine/public-media`.

This app serves that same path from the volume. Railway sets `MEDIA_GENERATED_DIR=/data/media/generated`. `/media/generated` is public so Zernio can fetch it. There is no directory listing. New files from Drive are written there too. `GITHUB_MEDIA_UPLOAD` defaults off. Setting it to `1` does not switch the URL to GitHub. The volume file is what gets served.

One-time copy, before the hostname moves, so existing filenames still resolve:

```bash
# From the Mini. The destination is the Railway volume path /data/media/generated.
rsync -a --info=stats ~/.postengine/public-media/ /path/to/volume/media/generated/
```

Copy the contents, not an extra nested `public-media` directory. A file that is `~/.postengine/public-media/abc.jpg` must be `/data/media/generated/abc.jpg`, which is `https://postengine.thecoopbrla.com/media/generated/abc.jpg` after DNS points at Railway.

The live snapshot does not expose `POST /api/media/migrate-github`. Existing posts already use `/media/generated/` URLs. Copy the files with the import in the cutover section. `GITHUB_TOKEN` stays optional and unused unless a later route reads it.

## Environment variables

Set these on the **web** service unless noted. Values stay out of git.

Production (`npm start` / the Railway image) exits before it listens if any of these are missing:

`ENGINE_DASHBOARD_PASSWORD`, `CRON_SECRET`, `ZERNIO_API_KEY`.

`GOOGLE_SERVICE_ACCOUNT_JSON` and drive folder config (`DRIVE_FOLDERS_JSON` or a file at `DRIVE_FOLDERS_PATH`) are optional. If either is missing, or the key cannot sign, boot logs a warning and continues. The Friday scan then returns `{skipped:true, reason:"drive not configured"}` and does not call Drive.

`BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are not used. Managers still sign in with the same 5-digit PIN. The screen says "Enter the 5-digit PIN to open Post Engine." The browser stores it in sessionStorage under `engine-dashboard-password` and sends `X-Dashboard-Password`. That is the same before and after this branch.

Optional names are logged at boot and do not stop the process: `CAPTION_API_KEY`, `CAPTION_PROVIDER`, `CAPTION_BASE_URL`, `CAPTION_MODEL`, `GITHUB_TOKEN`, `GITHUB_MEDIA_UPLOAD`, `EPIDEMIC_SOUND_API_KEY`, `PORSCHE_SALES_EMAIL_DIR`, `PUBLIC_APP_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_SET_WEBHOOK`, `IMPORT_TOKEN`, `PUBLISH_ENABLED`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_FOLDERS_JSON`, `DRIVE_FOLDERS_PATH`. Telegram is dropped. If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_CHAT_ID` is unset, startup logs once that notifications are off, sends are no-ops, `POST /api/telegram/webhook` returns 404, and the process does not call `setWebhook`. Captions default to `CAPTION_PROVIDER=nous` and `CAPTION_MODEL=anthropic/claude-haiku-4.5`, using `CAPTION_API_KEY` only. Requests do not send `max_tokens`. A model id containing `haiku-5` sends `reasoning: {enabled: false}`. `ANTHROPIC_API_KEY`, `GITHUB_MODELS_TOKEN`, `OPENAI_API_KEY`, and `NOUS_API_KEY` are not read. A missing key or a failed call uses a template. Nothing shells out to Hermes, `gog`, or the macOS Keychain.

`npm run dev` does not apply that check.

| Name | Service | What it is for |
|---|---|---|
| `PORT` | web | Listen port. Railway sets this. The live Mini uses 3456. Code default is 5000. |
| `NODE_ENV` | web | `production` selects the static build and the required-env check. The production bundle bakes this in. |
| `SQLITE_PATH` | web | SQLite file. Railway value `/data/sqlite.db`. The Mini file to copy is `~/.postengine/sqlite.db`. |
| `RAILWAY_VOLUME_MOUNT_PATH` | web | Injected by Railway when a volume is mounted. |
| `MEDIA_DIR` | web | Parent media directory. Railway value `/data/media`. |
| `MEDIA_GENERATED_DIR` | web | Files served at `/media/generated`. Railway value `/data/media/generated`. |
| `CRON_SECRET` | web and cron | Shared secret. Header `X-Cron-Secret`. Required in production. Lets the Friday cron call `POST /api/drive/scan` and `POST /api/notify/weekly` without the manager PIN. Also required by `GET /api/reports/friday-queue`. |
| `PUBLISH_ENABLED` | web | Optional. The 60s publish loop and the Friday scan run only when this is exactly `true`. Any other value, including unset, leaves them off. |
| `IMPORT_TOKEN` | web | Optional. Bearer token for `POST /api/admin/import` and `GET /api/admin/import/status`. Unset returns 404 for both. A wrong token returns 401. |
| `ZERNIO_API_KEY` | web | Bearer token for the Zernio API. Required in production. |
| `CAPTION_API_KEY` | web | Optional at boot. The only caption credential. Unset or a failed call uses a template. Put the former Nous key here. |
| `CAPTION_PROVIDER` | web | Optional. Default `nous`. Also `openai`, `openai-compatible`, `github-models`, `fallback`. |
| `CAPTION_BASE_URL` | web | Optional. Used only for `openai-compatible`. Nous uses its own endpoint. |
| `CAPTION_MODEL` | web | Optional. Default `anthropic/claude-haiku-4.5`. |
| `ENGINE_DASHBOARD_PASSWORD` | web | Required in production. The same 5-digit PIN managers type today. |
| `EPIDEMIC_SOUND_API_KEY` | web | Optional. Live reels music. This branch's publisher does not call it. |
| `GITHUB_MEDIA_UPLOAD` | web | Optional. Off unless set to `1`. The stored URL stays on the volume either way. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | web | Optional at boot. Service account key JSON. Needed before a real Drive scan. A missing or unusable key logs a warning and the scan skips. |
| `TELEGRAM_BOT_TOKEN` | web | Optional. Unset means notifications are a no-op and the webhook route is 404. |
| `TELEGRAM_CHAT_ID` | web | Optional. Required only if you still send Telegram messages. |
| `TELEGRAM_WEBHOOK_SECRET` | web | Optional. Checked on the webhook only when the bot token is set. |
| `TELEGRAM_WEBHOOK_URL` | web | Optional. `setWebhook` runs only when this, the bot token, and `TELEGRAM_SET_WEBHOOK=1` are all set. |
| `TELEGRAM_SET_WEBHOOK` | web | Optional. Leave unset. Nothing calls `setWebhook` without it. |
| `PUBLIC_APP_URL` | web | Optional origin for new media URLs. Unset uses `https://postengine.thecoopbrla.com`. |
| `GITHUB_TOKEN` | web | Optional. Not read by the live snapshot routes. |
| `FFMPEG_PATH` | web | ffmpeg binary. Image uses `ffmpeg`. Homebrew path is still used on the Mini when that file exists. |
| `FFPROBE_PATH` | web | ffprobe binary. Same rule as ffmpeg. |
| `DRIVE_FOLDERS_JSON` | web | Optional at boot. Folder map as JSON text. Not committed. Either this or `DRIVE_FOLDERS_PATH` is needed before a real Drive scan. |
| `DRIVE_FOLDERS_PATH` | web | Optional at boot. Path to the folder map file. Railway value `/data/.drive-folders.json`. Dev default is `./.drive-folders.json` when this and `DRIVE_FOLDERS_JSON` are unset. |
| `ZERNIO_ACCOUNTS_PATH` | web | Zernio account map. Default `./.zernio-accounts.json`, copied into the image. |
| `POSTENGINE_URL` | cron | Full base URL of the web service. Optional if host and port are set. |
| `POSTENGINE_HOST` | cron | Private hostname. `.railway/railway.ts` references `RAILWAY_PRIVATE_DOMAIN`. |
| `POSTENGINE_PORT` | cron | Web service `PORT`. |
| `POSTENGINE_SCHEME` | cron | `http` on the private network. |

Also set `CRON_SECRET` on the cron service to the same value.

## Mac Mini dependencies

| Dependency | Used for | Railway plan |
|---|---|---|
| Nested checkout that produced `mini/live-snapshot-2026-10-30` @ `0556d952` | The process that is actually live | This branch is that snapshot plus the Railway overlay. |
| `~/.postengine/sqlite.db` | Live posts | Copy this file to `/data/sqlite.db`. Not `./sqlite.db` from the git checkout. |
| launchd `com.postengine` on port 3456 | Keeps the one Node process up. A killed process is restarted. | `launchctl bootout` before Railway's publish loop starts. |
| Cloudflare tunnel `postengine.thecoopbrla.com` | Public hostname to localhost:3456 | Point the hostname at Railway only after the Mini process is stopped. |
| `gog` | Old Drive access | Removed from this app. Service account replaces it. Ada can keep `gog` for mail and calendar. |
| Homebrew ffmpeg | Instagram crop | In the image. |
| `~/.postengine/public-media` (~2 GB, 567 files) | Live `/media/generated/` files | rsync onto `/data/media/generated` before the hostname moves. |
| Ada's Telegram bot | Must not be the PostEngine webhook | Leave the Telegram variables unset. Notifications stay off. |
| Friday 08:00 CT Drive scan | Imports photos | Railway cron `0 13 * * 5`. See the schedule note below. |
| Friday 10:45 CT `friday-queue-reminder.sh` | Reads SQLite and texts the queue | `GET /api/reports/friday-queue` returns queued count, queued by store, and scheduled posts in the next 14 days. Point that script at the API. This PR does not add a second cron for 10:45. |

## Blockers and open questions

1. **This branch is the live snapshot plus Railway.** `0556d952` is the app. Archive and `main` did not replace any snapshot file. Do not merge this PR to `main` until Lance says so.

2. **Manager login is unchanged.** The live PIN gate (`ENGINE_DASHBOARD_PASSWORD`) is still the only dashboard login. There is no separate basic-auth prompt. `GET /api/health` and `/media/generated` stay public, as they are not manager pages. Production refuses to boot if the PIN is unset, so the gate cannot be left off by accident. When the same PIN is set, the screen and the header are the same as today.

3. **Telegram is dropped.** Leave `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`, and `TELEGRAM_WEBHOOK_URL` unset. Do not point a webhook at Ada's bot. Approval stays in the dashboard.

4. **Do not turn publishing on until the Mini process is stopped.** `PUBLISH_ENABLED` defaults off. The 60-second loop and the Friday scan do nothing unless it is exactly `true`. Boot Railway that way, import data, then stop the Mini, then set `PUBLISH_ENABLED=true` and redeploy.

5. **One replica, one volume, web service only.** The cron job uses HTTP. Two web replicas will corrupt SQLite.

6. **Media URLs stay `/media/generated`.** Unset `PUBLIC_APP_URL` keeps `https://postengine.thecoopbrla.com`. The path is not behind the PIN. Copy `~/.postengine/public-media` onto the volume or existing post URLs 404 after the hostname moves.

7. **Every Zernio attachment is still sent as `type: "image"`.** Video posts are not given a video type.

8. **The live specials sync is included.** `server/specials-talking-sync.ts` comes from the snapshot. Older archive-only offer scrapers are not.

9. **Friday scan cron is UTC.** Railway cron has no timezone field. `0 13 * * 5` is 13:00 UTC Friday, which is 08:00 America/Chicago during daylight time (CDT) and 07:00 during standard time (CST). The Friday 10:45 CT reminder is not a Railway cron in this PR. 10:45 CDT is 15:45 UTC (`45 15 * * 5`) and 10:45 CST is 16:45 UTC (`45 16 * * 5`).

10. **Config is not applied.** `.railway/railway.ts` was not planned or applied.

## Cutover

1. This branch already contains snapshot `0556d952` plus the Railway overlay. Do not merge it until Lance asks. Do not deploy from this PR.
2. Merge PR #2 (untrack secrets) before this PR if that branch is still the base. Retarget this PR to `main` only after #2 merges.
3. Create the service account, share the Postengine parent folder, and set the required env vars. Drive credentials can wait until before Friday Nov 6. Review `railway config plan` before apply. That creates the web service, the 8192 MB volume, and the Friday 13:00 UTC scan. It does not create Postgres, Redis, or a bucket. Set `CRON_SECRET` on the cron service to the same value as the web service.
4. Start Railway with `PUBLISH_ENABLED` unset or any value other than `true`. Confirm the log says the publish loop and weekly scan will not run. Set `IMPORT_TOKEN` before the import. Leave it unset again after the import if you do not want the endpoint left open.
5. Stop the Mini publisher. Unload launchd so it does not restart the process: `launchctl bootout gui/$(id -u)/com.postengine`. If the label lives in `~/Library/LaunchAgents/com.postengine.plist`, `launchctl unload` that plist as well. Confirm `launchctl print gui/$(id -u)/com.postengine` does not show a running job. Killing node alone is not enough.
6. On the Mini, after that process is stopped, checkpoint the database so the tar contains one file and not a stale WAL:

```bash
sqlite3 ~/.postengine/sqlite.db 'PRAGMA wal_checkpoint(TRUNCATE);'
tar czf - -C ~/.postengine sqlite.db public-media | curl -H 'Authorization: Bearer …' --data-binary @- https://<railway-host>/api/admin/import
```

`public-media` is `~/.postengine/public-media` (about 2 GB, 567 files). The server streams the archive to disk, writes those files under `/data/media/generated/`, and replaces the volume database. The response includes the media file count and the sha256 of `sqlite.db`. `GET /api/admin/import/status` with the same header returns post counts by status and the media file count. Both calls return 404 when `IMPORT_TOKEN` is unset. A wrong bearer token returns 401. The import is refused while `PUBLISH_ENABLED` is `true`.
7. Leave the Telegram variables unset. Confirm startup logs `Telegram notifications are off` and `POST /api/telegram/webhook` returns 404.
8. Confirm a `/media/generated/` URL returns a file with no PIN. The live snapshot has no GitHub media migration route.
9. Set `PUBLISH_ENABLED=true` only after the Mini process is stopped, then redeploy. Run the Friday scan once by hand. An empty folder is success with zero posts. An auth error is a failure. While the flag is not `true`, the scan returns success with `skipped: true` and does not touch Drive.
10. Point `friday-queue-reminder.sh` (Friday 10:45 America/Chicago) at `GET /api/reports/friday-queue` with `X-Cron-Secret` instead of opening the SQLite file. The endpoint returns queued total, queued by store, and scheduled posts in the next 14 days.
11. Disable the Mini crontab entry for `scripts/weekly-scan.sh`. Leave Ada's other agents on the Mini.
12. Point `postengine.thecoopbrla.com` at Railway and set `PUBLIC_APP_URL` to that origin. Do this only after step 5, or the tunnel and Railway will both be attached to publishers.

The Mini process and the Railway process must not run the publish loop at the same time. They would both send due posts to Zernio.
