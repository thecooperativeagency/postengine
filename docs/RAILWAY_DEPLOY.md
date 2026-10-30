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
| `server/drive-scanner.ts` | Sunday import. Shells out to the `gog` CLI for Google Drive. |
| `server/media-host.ts` | Downloads a Drive file with `gog` and commits it to GitHub so Zernio has a public URL. |
| `server/caption-writer.ts` | Writes captions with the Anthropic API. Template fallback if the key is absent. |
| `server/telegram-notify.ts` | Approval cards and the weekly summary. |
| `shared/schema.ts` | Drizzle table definitions. |
| `script/build.ts` | Vite client build + esbuild server bundle to `dist/index.cjs`. |
| `start.sh` | Mac Mini dev start. Loads `.env` and runs `PORT=3456 npm run dev`. |
| `.drive-folders.json` | Drive folder ids per client and post type. |
| `.zernio-accounts.json` | Zernio account ids per client and platform. Not an API key. |
| `media/`, `postengine/media/` | Image files already pushed to GitHub for public URLs. The server does not serve them. |

Local commands:

- Dev: `bash start.sh` (port 3456) or `npm run dev` (port 5000 unless `PORT` is set).
- Production: `npm run build` then `npm start`. Listens on `PORT` or 5000, host `0.0.0.0`.

External APIs the server calls:

- Zernio `https://zernio.com/api/v1` for Instagram, Facebook, and Google Business posts.
- GitHub Contents API to upload media.
- Anthropic Messages API for captions.
- Telegram Bot API for approval buttons and the weekly summary.

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

## Environment variables

Set these on the **web** service unless noted. Values stay out of git.

| Name | Service | What it is for |
|---|---|---|
| `PORT` | web | Listen port. Railway sets this. Local `start.sh` uses 3456. Code default is 5000. |
| `NODE_ENV` | web | `production` in the image and in `.railway/railway.ts`. Selects the static build instead of Vite. |
| `SQLITE_PATH` | web | SQLite file. Railway value `/data/sqlite.db`. If unset, uses `$RAILWAY_VOLUME_MOUNT_PATH/sqlite.db` when that variable exists, otherwise `./sqlite.db`. |
| `RAILWAY_VOLUME_MOUNT_PATH` | web | Injected by Railway when a volume is mounted. Do not set by hand if `SQLITE_PATH` is set. |
| `BASIC_AUTH_USER` | web | HTTP basic auth username. Required before any public domain. Unset on the Mac Mini, so local behavior stays open. |
| `BASIC_AUTH_PASSWORD` | web | HTTP basic auth password. Pair with the username. |
| `CRON_SECRET` | web and cron | Shared secret. Cron sends header `X-Cron-Secret`. When set, `/api/drive/scan` and `/api/notify/weekly` reject calls without it. The same header also bypasses basic auth. |
| `ZERNIO_API_KEY` | web | Bearer token for the Zernio API. |
| `GITHUB_TOKEN` | web | GitHub token with contents write on the media repo. Used to upload images. |
| `GITHUB_REPO` | web | `owner/repo` for media uploads. Default `thecooperativeagency/postengine`. |
| `GITHUB_MEDIA_BRANCH` | web | Branch that receives uploaded images. Default `main` (current Mac behavior). Railway config sets `media` so uploads do not redeploy the app. Create that branch first. |
| `ANTHROPIC_API_KEY` | web | Caption generation. If empty, captions fall back to templates. |
| `TELEGRAM_BOT_TOKEN` | web | Bot that sends approval cards and accepts button callbacks. Use a new bot. Do not reuse Ada's OpenClaw bot. |
| `TELEGRAM_CHAT_ID` | web | Destination chat for those messages. |
| `TELEGRAM_WEBHOOK_SECRET` | web | Checked against header `X-Telegram-Bot-Api-Secret-Token` on `POST /api/telegram/webhook`. Set this before the webhook is public. |
| `TELEGRAM_WEBHOOK_URL` | web | Public `https` URL of `/api/telegram/webhook`. |
| `TELEGRAM_SET_WEBHOOK` | web | Set to `1` to call Telegram `setWebhook` on boot. Leave unset until the URL and secret exist. |
| `PUBLIC_APP_URL` | web | Origin used in the weekly Telegram summary (`/#/queue`). Default `http://localhost:3456`. |
| `FFMPEG_PATH` | web | ffmpeg binary. Railway image uses `ffmpeg`. On the Mac Mini the Homebrew path is still chosen when that file exists. |
| `FFPROBE_PATH` | web | ffprobe binary. Same rule as ffmpeg. |
| `GOG_BIN` | web | `gog` binary. Same Homebrew-then-PATH rule. The Railway image does not install `gog`. |
| `GOOGLE_WORKSPACE_ACCOUNT` | web | Account flag passed to `gog`. Default `lance@thecoopbrla.com`. |
| `DRIVE_FOLDERS_PATH` | web | Path to the folder map. Default `./.drive-folders.json`, which is copied into the image. |
| `ZERNIO_ACCOUNTS_PATH` | web | Path to the Zernio account map. Default `./.zernio-accounts.json`, copied into the image. |
| `POSTENGINE_URL` | cron | Full base URL of the web service. Optional if host and port are set. |
| `POSTENGINE_HOST` | cron | Private hostname of the web service. `.railway/railway.ts` references `RAILWAY_PRIVATE_DOMAIN`. |
| `POSTENGINE_PORT` | cron | Port the web service listens on. The config references the web service `PORT`. |
| `POSTENGINE_SCHEME` | cron | `http` on the private network. |

Also set `CRON_SECRET` and, if you want the cron to send basic auth as well, `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` on the cron service. The cron header alone is enough when `CRON_SECRET` matches.

Railway also injects `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_ENVIRONMENT`, and similar. The app does not require those names except for the volume path fallback.

## Mac Mini dependencies

| Dependency | Used for | Railway plan |
|---|---|---|
| `/Users/lucfaucheux/.openclaw/workspace/...` | Old start path and `scripts/weekly-scan.sh` | Replaced by the container workdir and the cron script. The shell script is left in place for the Mac crontab until cutover. |
| Homebrew `gog` plus its local login | List, download, and archive Drive files | **Blocker.** See below. |
| Homebrew `ffmpeg` and `ffprobe` at `/opt/homebrew/bin` | Crop images to Instagram's ratio | Installed in the image. Mac path is still used when the file exists. |
| `sqlite.db` on the Mac disk | All posts, cadence, activity | Copy onto the Railway volume. The disk is ephemeral without the volume. |
| Tailscale `localhost:3456` and a planned Cloudflare tunnel | How Lance opens the app | Railway private network, then a public domain only after basic auth is set. |
| Ada / OpenClaw Telegram bot | Approval buttons | **Blocker** if the same bot token is reused. |
| Mac crontab and launchd | Sunday scan, Ada heartbeats, other apps | Only the Sunday PostEngine scan moves. LaunchAgent auto-start for PostEngine was still an open note, not a checked-in plist. |
| GitHub `main` as the image CDN | Public media URLs for Zernio | Keep the mechanism. Point uploads at a `media` branch so a publish does not rebuild Railway. |
| `/tmp/postengine-notify.txt` | Ada notices a finished scan | Replaced by `POST /api/notify/weekly`, which sends Telegram directly. |

`gog` is not installed in the image on purpose. The binary without the Mac login cannot read Drive. Installing it would look like the scan still worked.

## Blockers and open questions

1. **Google Drive (`gog`) cannot move as-is.** Scan, download, and archive shell out to `gog`, and the login lives on the Mac Mini. When a cadence rule needs images, `POST /api/drive/scan` returns an error if `gog` is missing. It does not report an empty folder. Posts that are already in SQLite with public image URLs can still publish. New weekly drafts cannot be imported until Drive access is replaced with something the container can hold (Google Drive API with a refresh token or a service account that can read those folders). Do not turn off the Mac Mini scanner until that exists, or accept a pause in new drafts.

2. **The dashboard has no accounts of its own.** Basic auth is off unless `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are both set. Do not attach a public hostname before that. `GET /api/health` and the Telegram webhook stay reachable. The webhook should have `TELEGRAM_WEBHOOK_SECRET` set.

3. **Telegram is shared with Ada today.** The code comment says it uses OpenClaw's bot. A webhook on that bot takes updates away from Ada on the Mac Mini. Create a separate bot, set `TELEGRAM_BOT_TOKEN` to that bot, and only then set `TELEGRAM_SET_WEBHOOK=1`. This repo does not register a webhook unless that flag is `1`.

4. **SQLite must be copied before the first real boot.** An empty database seeds demo dealerships and sample posts. One sample post is `scheduled`. With a live `ZERNIO_API_KEY`, the poller will publish it when `scheduledFor` is reached. Restore the Mac Mini file first. On the Mac, checkpoint so one file is enough: `sqlite3 sqlite.db "PRAGMA wal_checkpoint(TRUNCATE);"`. Copy `sqlite.db` to `/data/sqlite.db`. If a seeded file was already created, stop the service and replace `sqlite.db`, `sqlite.db-wal`, and `sqlite.db-shm`.

5. **One replica, one volume, web service only.** The cron job must keep using HTTP. Two web replicas will corrupt SQLite.

6. **Media commits can redeploy the app.** Uploads go to `GITHUB_MEDIA_BRANCH`, default `main`. The Railway config sets `media`. Create that branch before the first upload. Watch patterns are a second guard, and they apply only after `railway config apply`. A Railway bucket would be a better store later. The app does not speak S3 yet, so a bucket is not provisioned here. Zernio still needs a public HTTPS URL for each image.

7. **Every Zernio attachment is sent as `type: "image"`.** Video posts are not given a video type. That matches current behavior. GMB video failures seen in old notes are not fixed by this move.

8. **No offers engine to deploy.** If "offers engine" means a catalog of lease and service offers separate from social posts, it is not in this codebase. Say if that should be a new service.

9. **Sunday time shifts with daylight saving.** `0 7 * * 0` is 2:00 AM CDT and 1:00 AM CST. Railway cron is UTC and does not follow America/Chicago.

10. **Public hostname.** Memory mentioned `postengine.thecoopbrla.com` via a Cloudflare tunnel. That tunnel is not in this repo. Decide whether the Railway domain is enough or that hostname should be a custom domain after basic auth exists.

11. **Config is not applied.** `.railway/railway.ts` is the desired project. Review it with `railway config plan` when you are ready. This work did not run plan or apply, and it did not create a Railway project.

## Cutover

Do this only after blockers 1 and 3 have a decision. A Railway URL with no Drive client and Ada's bot token will either pause imports or steal Ada's Telegram updates.

1. Merge the secrets-untracking PR (#2) and this PR. The Railway file tracks branch `main`.
2. Create a Git branch named `media` if uploads should stay off `main`.
3. Create the Railway project from `.railway/railway.ts` after reviewing `railway config plan`. That creates the web service, the volume, and the cron service. It does not create Postgres, Redis, or a bucket.
4. Set the web and cron variables listed above. Use a new Telegram bot. Set basic auth and `CRON_SECRET` before generating a public domain.
5. On the Mac Mini, stop PostEngine. Checkpoint SQLite and copy `sqlite.db` to `/data/sqlite.db` on the volume before the first production boot.
6. Deploy the web service. Confirm `GET /api/health` and that the dashboard shows the real posts, not the seed data.
7. Leave `TELEGRAM_SET_WEBHOOK` unset until `TELEGRAM_WEBHOOK_URL` and `TELEGRAM_WEBHOOK_SECRET` are set on the new bot. Confirm an approval button updates a post.
8. Run the cron command once by hand (`node scripts/railway-weekly-scan.mjs` against the private URL). Expect Drive scan to fail until `gog` is replaced. Publishing of already-imported due posts does not depend on that scan.
9. When Drive access works from the container, disable the Mac crontab entry that runs `scripts/weekly-scan.sh`. Leave Ada's other crons and launch agents on the Mini.
10. Point `PUBLIC_APP_URL` at the Railway origin and update the Command Center link that still says port 3456 on Tailscale.

Until step 8 succeeds, the Mac Mini remains the system that can import new Drive photos. The web process and the poller should not both run against two copies of the database.
