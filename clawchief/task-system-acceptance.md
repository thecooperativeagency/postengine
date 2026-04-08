# Task System Acceptance

Status: audit index
Created: 2026-04-07
Purpose: keep the Todoist-backed task system easy to audit without duplicating the runtime policy across random markdown files.

## Canonical rule

Todoist is the only live task system for clawchief.

Archived markdown task files may exist for history or migration reference, but no active workflow should depend on `clawchief/tasks.md` or recreate it.

## Canonical files

- Shared task contract:
  - `~/.openclaw/skills/task-system-contract/SKILL.md`

- Role extensions:
  - `~/.openclaw/skills/executive-assistant/SKILL.md`
  - `~/.openclaw/skills/business-development/SKILL.md`
  - `~/.openclaw/skills/daily-task-manager/SKILL.md`
  - `~/.openclaw/skills/daily-task-prep/SKILL.md`

- Runtime triggers:
  - `~/.openclaw/cron/jobs.json`

- Verification:
  - `~/.openclaw/workspace/clawchief/tests/test_task_system_contract.py`

## Audit expectations

- Put shared Todoist behavior in `SKILL.md` files, not in duplicate free-floating markdown policies.
- Keep this file as an index and audit map, not a second runtime policy document.
- When the contract changes, update the shared task skill first, then the role skills, crons, and tests.

## Minimum invariants

- Todoist remains the only live task system.
- No local OpenClaw skill or cron writes live task state into `clawchief/tasks.md`.
- The shared task contract stays inspectable through skills plus automated tests.
- Scheduled crons in `~/.openclaw/cron/jobs.json` remain the dependable triggers for recurring task workflows.
