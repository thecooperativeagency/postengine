# Engine Remote Access

ENGINE now supports the same basic access pattern as CoopTag:

- remotely reachable over HTTPS
- shared password gate in front of the dashboard UI
- backend API enforcement via `X-Dashboard-Password`
- env-based configuration

## Required environment variables

### `ENGINE_DASHBOARD_PASSWORD`
Shared password required for dashboard access. If this env var is blank or unset, the password gate is disabled.

Example:

```bash
ENGINE_DASHBOARD_PASSWORD=replace-with-a-strong-shared-password
```

### `POSTENGINE_DB_PATH`
Strongly recommended in remote deployments so SQLite lives on a persistent volume rather than an ephemeral app filesystem.

Example:

```bash
POSTENGINE_DB_PATH=/var/data/postengine/sqlite.db
```

## App behavior

When `ENGINE_DASHBOARD_PASSWORD` is set:

1. The React app shows a password screen before loading ENGINE.
2. The password is stored in `sessionStorage` for the current browser tab.
3. Protected API requests send `X-Dashboard-Password`.
4. The backend rejects protected API requests with `401` if the password is missing or wrong.

Public API exceptions kept open intentionally:

- `/api/auth/config`
- `/api/auth/check`
- `/api/telegram/webhook`

`/api/telegram/webhook` remains public so Telegram approval callbacks keep working.

## Deployment requirements

For a real remote deployment, the host must provide:

- HTTPS termination
- a stable hostname/subdomain
- a persistent disk or volume for SQLite
- env var injection for secrets
- a process manager or app host running `npm run start`

## Recommended production shape

- reverse proxy / host HTTPS at the edge
- app process runs `npm run build && npm run start`
- set `NODE_ENV=production`
- set `ENGINE_DASHBOARD_PASSWORD`
- set `POSTENGINE_DB_PATH` to persistent storage

## Verification

Without a password header, protected API routes should return `401`.

With the correct password header, protected API routes should return normal data.

Example header:

```http
X-Dashboard-Password: your-shared-password
```
