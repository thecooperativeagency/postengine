# Publish approval gate

Publishing stays off unless `PUBLISH_ENABLED` is exactly `true`. The poller and `POST /api/posts/:id/publish` also require an explicit publish approval: `status=approved` plus `approved_at` and `approved_by`. A due `scheduled` or `queued` row never goes out on its own.

If `scheduled_for` is more than two hours in the past, measured from the later of `scheduled_for` and `approved_at`, the post needs a fresh approval. Approving an already-overdue post sets a new `approved_at` and opens a new window. Re-approve shortly before turning publishing on.

Drive ingest uses `DRIVE_SCAN_ENABLED=true`, independent of publishing. Dashboard "Approve & schedule" (`POST /api/posts/bulk-approve`) still only moves a post to `scheduled`. It is not a publish approval.

Hold is reversible. `POST /api/posts/hold-backlog` marks due `scheduled`/`approved` rows as `held` and stores `status_before_hold`. It does not delete rows or edit captions or media. `POST /api/posts/:id/release-hold` restores the previous status.

Read-only preview: `GET /api/posts/preview-due?date=YYYY-MM-DD` (America/Chicago).

## Nov 6, 2026 one-at-a-time path

Nonce `nov6-2026-one` accepts **exactly one** ready ID per request on `2026-11-06`: `498` or `450`. Approving one never approves another.

- Ready after the model-level availability check (no publish all-clear yet): `498` (BMWJ X3), `450` (ABR RS Q8).
- Held with the backlog pending a new review: `486` (BHBMW 2026 M4 Competition — year/availability fail), `473` (HP GT3 RS — listing not confirmed).

Prepared HTTP steps:

```
npx tsx script/nov6-2026-approve-ready.ts
```

Do not run the hold/approve calls against production until the PR is deployed and Lance OKs those live steps. Do not set `PUBLISH_ENABLED=true` in the same breath as deploy.
