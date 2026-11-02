# Post Engine usage audit

Evidence is the activity log (`shared/schema.ts`, `storage.logActivity` callers), `memory/*.md`, `COMMITMENTS.md`, `REELS-PIPELINE.md`, `build-instructions.md`, and git history. The live client is the Mini snapshot on `cursor/railway-postengine-6876` (not the older `main` client). Server routes were not removed.

Activity log actions actually written: `created`, `edited`, status changes (`queued`, `scheduled`, `published`, `rejected`), `deleted`, `partial_publish`. Cadence edits, theme, and calendar views are not recorded.

The Operator Hub names the daily job as “Queue · approve · publish.” `build-instructions.md` is the original spec, not proof Lance uses every control.

| Control | Decision | Evidence |
| --- | --- | --- |
| PIN gate | Keep | `ec1e66a1` gives each manager a PIN. `/api/auth/check` and `/api/auth/config` stay. |
| Stores, with queue count and days behind | Keep | Hub daily rail. Drive scanner files posts as `queued` (`server/drive-scanner.ts`). Days behind is the latest scheduled or published coverage, so a store with nothing ahead of today reads as behind. |
| From Drive | Keep | Imports set `folderSource` and `queued`. Friday scan is `POST /api/drive/scan` plus `GET /api/reports/friday-queue`. The list shows title, store, and status. Folder ids stay off the screen. |
| Review, Approve, Edit, Reject | Keep | Log actions `scheduled`, `edited`, `rejected`. Hub: approve then publish. |
| Instagram caption on the review card | Keep | Caption columns were extended in the live snapshot (`56ddc8a4`). This is the line he reads. |
| Bulk select and bulk approve | Keep | Same approve action as the log’s `scheduled` entries. `POST /api/posts/bulk-approve` stays. |
| Facebook and Google captions | Shrink, closed | Separate fields exist for publishing. They are not the first thing on the card. |
| Rewrite prompt | Shrink, closed | Added on the live queue. Useful when a line is wrong, not on every post. |
| Scan, talking points, Generate, pause, refresh, new post | Shrink, closed | Friday intake is the cron scan, not a button. Talking points were iterated on the live dashboard, so they stay one pull-up away. Pause is `imports_paused`. Hand-built posts are the exception. Drive is the intake. |
| Total / draft / scheduled / published counts | Shrink, closed | Asked for in `build-instructions.md`. The log and the hub describe the queue, not a KPI row. |
| Activity feed | Shrink, closed | The log is real. It is a record, not the daily action. |
| Posts list and status tabs | More | The full list has been there since `8d0caf74`. Daily work is the queued review, not the archive. |
| Post type filter | Shrink, closed | Secondary filter on the list. Status tabs stay visible once you are on that page. |
| Calendar | More | Shipped in the first build. No later client iteration. Not on the hub’s daily line. |
| New post, in the nav | More | Same as Generate. `POST /api/posts` stays. |
| Post specs: cadence, reels floor, store records | Settings, each block closed | `COMMITMENTS.md` and `memory/2026-04-08.md`: cadence gets turned back on when a token breaks, not every morning. `REELS-PIPELINE.md`: add a Reels rule when auto-queue from `_ready` is wanted. |
| Drive library and Zernio card | Settings, closed | Publishing is Zernio plus `PUBLISH_ENABLED` (`server/publish-switch.ts`). The key is an environment variable. The screen no longer shows a fake key or a folder id. |
| Theme | More, remembers the choice | Was a header icon. The page now opens on the paper look from thecoopbrla.com. |
| Store filter | More | A store card opens Review for that store. Per-PIN scope already limits a manager. The select remains for an admin who wants the old filter. |
| Operator Hub link | More | The old “Command Hub” link pointed at GA4 pages. The hub treats those as tabled and Post Engine as a daily rail. |
| Content Engine tab | Remove from the nav | Added once (`0bd7948f`). The live router does not mount it. Creators use the separate content-engine site (`memory/2026-04-16.md`). The page file is still in the repo. |
| Folder id line and the hardcoded mailbox fallback | Remove from the UI | Public repo. Drive config is still served to the signed-in app. The screen shows the library name only. |
| Teal sidebar, five KPI tiles, header theme icon | Remove from the first screen | That chrome was the original spec’s “automotive luxury” look. It is not how thecoopbrla.com or the Operator Hub are set. |

Open or closed is stored in this browser under `pe-sections:<manager name>`. Closed is the default. On a phone the section pulls up as a bottom sheet. On a wide screen it drops open under the button.

These endpoints are unchanged: `/api/drive/scan`, `/api/reports/friday-queue`, `/api/admin/import`, `/api/admin/import/status`, Zernio `POST /api/posts/:id/publish` and the publish poller, `PUBLISH_ENABLED`, and the PIN routes.
