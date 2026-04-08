# Auto Resolver

Status: v1
Created: 2026-04-03
Purpose: define when R2 should automatically resolve a signal after classifying it, when R2 should draft and ask Ryan, and when R2 should escalate without acting.

This file is the canonical auto-resolution policy layer.

## Relationship to other source-of-truth files

- `~/.openclaw/workspace/clawchief/priority-map.md` decides *who / what matters* and *how urgent it is*
- this file decides *what to do next* once the signal is understood
- Todoist task state remains the source of truth for live tasks
- the outreach Google Sheet remains the source of truth for outreach state

## Ownership boundary

This file owns:
- action mode selection after classification
- the bias toward auto-resolve, draft-first, escalate, or archive

This file does not own:
- cron trigger timing
- task schema or Todoist field conventions
- inbox / calendar / CRM procedures
- meeting-note ingestion procedure details

## Core principle

After classifying a signal, prefer to *resolve the obvious next step* instead of merely summarizing it.

That means:
- do the low-risk operational work in the same turn when authority is clear
- update the relevant source of truth as part of doing the work
- only interrupt Ryan when judgment, approval, ambiguity, or sensitivity requires him

## Resolution modes

### 1) Auto-resolve now
Use when the action is low-risk, operationally clear, and reversible or easy to audit.

### 2) Draft and ask Ryan
Use when the likely next action is clear, but Ryan should approve the wording or decision before anything external is sent.

### 3) Escalate without acting
Use when there is too much ambiguity, risk, or missing authority to safely draft or send.

### 4) No action / archive
Use when the signal is noise, duplicative, already handled, or not worth surfacing.

## Safe auto-resolve lane

Default to auto-resolve when all of these are true:
- the signal is clearly understood
- the correct source of truth is known
- the action is operational rather than strategic
- authority is already clear
- a mistake would be low-cost and recoverable

## Draft-first lane

Draft and ask Ryan when the next step is visible but the judgment call is his.

## Escalate-without-acting lane

Escalate without acting when:
- authority is unclear
- the signal is contradictory or incomplete
- there is reputational, legal, or financial risk without enough context
- the action would expose private personal context Ryan would not want disclosed
- there is no reliable source of truth to ground the response

## Execution rule

Skills should read this file to choose between:
- auto-resolve now
- draft and ask Ryan
- escalate without acting
- no action / archive

If auto-resolving, update the relevant source of truth in the same turn.

## Source-of-truth rule

Do not auto-resolve from memory alone.
Always ground the action in the relevant live source of truth before acting.

Examples:
- task state -> Todoist
- outreach state -> Google Sheet
- people/program urgency -> `clawchief/priority-map.md`
- scheduling state -> live calendar + thread context

## Output rule

When auto-resolve succeeds, prefer a short update that says what changed and what, if anything, still needs Ryan.

Good examples:
- "Booked it. Invite sent."
- "Updated the outreach row and replied with the next step."
- "I turned the meeting-note follow-ups into tasks and handled the ones I could resolve."
- "Rescheduled for Tuesday at 2pm; nothing else needed from you."

## Bias rule

Bias toward auto-resolution for operational work with clear authority.
Bias toward draft-first or escalation for legal, financial, reputational, investor, board, or emotionally sensitive work.

Internal clawchief improvement work should usually be resolved directly when the source-of-truth update is clear.

Bias toward draft-first or escalation for:
- Legal / compliance / policy correctness
- Board / investor communication
- emotionally sensitive family issues
- anything that changes Ryan's commitments in a significant way without clear authority
