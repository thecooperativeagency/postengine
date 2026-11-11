# Publish approval gate

Publishing stays off unless `PUBLISH_ENABLED` is exactly `true`. The automatic 60-second poller never starts unless that flag is on.

`POST /api/posts/:id/publish` (and `publishPost` on that path) may publish **one** already-approved post even when the flag is off: `status=approved` plus `approved_at` and `approved_by`. Held, scheduled, queued, and draft rows are rejected. If the row is already published, already has a Zernio post id, or a publish is in flight, the request is refused and any known Zernio ids are returned. Successful Zernio ids are saved on the row before the handler returns.

Set `captionExact` (`caption_exact`, default `false`) to send Instagram, Facebook, and Google Business captions verbatim, with no CTA, link, hashtag bank, or Google Business CTA appended. If `caption_gmb` is empty, the main caption is used so Google Business is not blank. Do not change dealership CTA records to achieve this.

If `scheduled_for` is more than two hours in the past, measured from the later of `scheduled_for` and `approved_at`, the gate will not publish until the slot is inside the window. `POST /api/posts/approve-publish` refuses that overdue slot. It does not publish by itself. A slot still inside the two-hour window can be marked `approved` and the gate publishes it only once it is due.

Drive ingest uses `DRIVE_SCAN_ENABLED=true`, independent of publishing. The dashboard Approve button and batch approve call `POST /api/posts/approve-publish` (status `approved`, plus `approved_at` and `approved_by`). That call refuses held rows, rows that already have a Zernio post id, same-vehicle posts inside the 21-day block, and slots past the two-hour window. `POST /api/posts/bulk-approve` still only moves a post to `scheduled` and is not a publish approval.

Scheduled posts past that same window are marked `expired` and leave the active queue. The sweep does not delete rows, does not reject them, and does not touch held rows. Restore (`POST /api/posts/:id/restore-expired`) puts a row back to `scheduled` and exempts it from being expired again until its slot changes. These ids are excluded from the sweep: 450, 459, 473, 485, 486, 489, 490, 495, 498, 500, 43, 451, 496.

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
