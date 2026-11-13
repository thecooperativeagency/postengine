# Publish approval gate

Publishing stays off unless `PUBLISH_ENABLED` is exactly `true`. The automatic 60-second poller never starts unless that flag is on.

`POST /api/posts/:id/publish` (and `publishPost` on that path) may publish **one** already-approved post even when the flag is off: `status=approved` plus `approved_at` and `approved_by`. Held, scheduled, queued, and draft rows are rejected. If the row is already published, already has a Zernio post id, or a publish is in flight, the request is refused and any known Zernio ids are returned. Successful Zernio ids are saved on the row before the handler returns.

Set `captionExact` (`caption_exact`, default `false`) to send Instagram, Facebook, and Google Business captions verbatim, with no CTA, link, hashtag bank, or Google Business CTA appended. If `caption_gmb` is empty, the main caption is used so Google Business is not blank. Do not change dealership CTA records to achieve this.

If `scheduled_for` is more than two hours in the past, measured from the later of `scheduled_for` and `approved_at`, the gate will not publish until the slot is inside the window. `POST /api/posts/approve-publish` refuses that overdue slot. It does not publish by itself. A slot still inside the two-hour window can be marked `approved` and the gate publishes it only once it is due.

Drive ingest uses `DRIVE_SCAN_ENABLED=true`, independent of publishing. The dashboard Approve button and batch approve call `POST /api/posts/approve-publish` (status `approved`, plus `approved_at` and `approved_by`). That call refuses held rows, rows that already have a Zernio post id, same-vehicle posts inside the 21-day block, and slots past the two-hour window. `POST /api/posts/bulk-approve` still only moves a post to `scheduled` and is not a publish approval.

Missed posts are never expired and are not left overdue. Any still-unpublished `scheduled` or `approved` post more than two hours past its slot is moved to the next open future slot for that same store: the same time of day (America/Chicago), at least two days out, and no more than one post per store per day. Held, rejected, and published rows are left untouched, and approval status is kept. The move is logged with the old and new times, and the new date is shown in the dashboard. This runs once at startup, on the publish poller, and when the queue or posts list is loaded. `POST /api/posts/:id/restore-expired` remains for any already-expired row.

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

Do not use nonce `nov6-2026-one` for later posts such as Road Home. Do not set `PUBLISH_ENABLED=true` unless that is separately approved.
