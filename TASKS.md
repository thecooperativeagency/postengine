# TASKS.md — Overnight Build Queue

Tasks here get picked up by the overnight cron and built by Claude Code while Lance sleeps.
Each task gets one coding agent session. Results are committed to GitHub and Lance gets a Telegram summary in the morning.

## Format

```
## [STATUS] Task Title
- **Priority:** high | medium | low
- **Repo:** github.com/thecooperativeagency/reponame (or "new repo")
- **Spec:** Clear description of what to build. Be specific — the agent reads this directly.
- **Done when:** Acceptance criteria. How do we know it's finished?
```

Status options: `QUEUED` → `IN_PROGRESS` → `DONE` | `FAILED`

---

## Queue

_No tasks queued yet. Add tasks below._

---

## Completed

_Nothing completed yet._
