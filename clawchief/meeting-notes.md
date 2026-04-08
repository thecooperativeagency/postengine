# Meeting Notes Ingestion

Status: v1
Created: 2026-04-03
Purpose: make Gemini-generated meeting notes part of the always-on chief-of-staff loop so that decisions, tasks, follow-ups, and auto-resolve opportunities do not die in meeting docs.

## Source

Ryan wants `r2@untangle.us` invited to all Ryan meetings by default so Gemini meeting notes are shared to that account.

When creating, updating, or rescheduling a Ryan meeting, preserve or add `r2@untangle.us` as an attendee unless Ryan explicitly says otherwise.

Treat those notes as a live operational signal source.

## Canonical state files

- Policy: `~/.openclaw/workspace/clawchief/meeting-notes.md`
- Processed-doc ledger: `~/.openclaw/workspace/memory/meeting-notes-state.json`
- Task sink: Todoist
- Priority / urgency: `~/.openclaw/workspace/clawchief/priority-map.md`
- Auto-resolution policy: `~/.openclaw/workspace/clawchief/auto-resolver.md`

## Ownership boundary

This file owns:
- the meeting-note ingestion contract
- success criteria for considering a note handled
- the ledger requirement that prevents repeated processing

This file does not own:
- general inbox triage
- general task-system schema
- broad priority policy
- cron implementation details beyond which trigger is canonical

## Core rule

The recurring executive-assistant sweep cron is the canonical dependable trigger for meeting-note ingestion.

Heartbeat-driven EA runs may also check for notes when they are already touching the same operational surface, but reliability must not depend on heartbeats.

The scheduling side and the ingestion side are linked: if R2 is not on the meeting, the meeting-notes pipeline is more likely to break. Default to keeping `r2@untangle.us` on Ryan meetings.

If a note is new and relevant:
- read it
- extract decisions, commitments, open questions, and action items
- add Ryan tasks to Todoist
- add R2 tasks to Todoist or auto-resolve them when allowed
- update the relevant live source of truth (calendar, outreach sheet / CRM, etc.)
- record the note as processed in the meeting-notes ledger

## What counts as successful ingestion

A meeting note is not "handled" just because it was read.

It is only handled when the important outputs have been pushed into the system:
- Todoist tasks added or updated
- follow-ups created
- tracker / CRM row, calendar, and inbox state updated when appropriate
- auto-resolved actions completed when safe
- processed-doc ledger updated

## Processing rule

The `executive-assistant` skill owns the detailed ingestion workflow.

This file defines the contract:
- check for new meeting notes during the recurring EA sweep, and optionally during other EA runs when practical
- turn notes into source-of-truth updates, not just summaries
- update Todoist, the outreach tracker, calendar/inbox state, and `memory/meeting-notes-state.json` as needed

## Extraction rule

The skill should extract whatever changes live operating state:
- tasks
- follow-ups
- decisions
- commitments
- scheduling next steps
- outreach / partnership next steps
- legal or policy blockers needing Ryan or Linda

## Auto-resolution rule

Use `clawchief/auto-resolver.md` for action-mode decisions.

Use structured plans or sub-agents only when they help the skill complete a larger ingestion batch, but keep final authority in the canonical source-of-truth updates.

## Ledger format

Use `~/.openclaw/workspace/memory/meeting-notes-state.json` to avoid reprocessing the same doc repeatedly.

Each processed record should include, when known:
- `docId`
- `title`
- `processedAt`
- `meetingDate`
- `status`
- `summary`

## Trigger rule

Primary trigger:
- the executive-assistant sweep cron in `~/.openclaw/cron/jobs.json`

Secondary / opportunistic triggers:
- heartbeat-driven EA runs
- direct user asks that touch meeting follow-up or inbox/calendar cleanup

Rule:
- if cron coverage is healthy, meeting-note ingestion should still happen reliably even when no heartbeat fires
