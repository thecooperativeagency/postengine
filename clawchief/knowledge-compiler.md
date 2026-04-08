# Knowledge Compiler

Status: v1
Created: 2026-04-04
Purpose: turn messy operational inputs into a small, human-readable, LLM-friendly set of compiled source-of-truth files that can be maintained and linted over time.

This file adds a Karpathy-style pattern to clawchief:
- keep raw inputs separate from canonical operating state
- compile raw inputs into markdown / JSON source-of-truth files
- run small health checks so the system stays coherent instead of rotting

## Core idea

Do not treat memory or workflow state as a hidden prompt blob.
Treat clawchief like a compiled knowledge base.

That means:
- raw signals come in from inbox, calendar, meeting notes, Slack threads, docs, notes, and web research
- R2 compiles them into a few canonical files
- later sweeps lint those files for drift, duplication, stale state, and contradictions

The result should stay:
- human-readable
- easy to audit
- easy to edit manually
- compact enough for LLM context
- grounded in explicit source-of-truth files instead of fuzzy recollection

## Raw inputs vs compiled outputs

Raw inputs are noisy. Compiled outputs are the canonical operating artifacts.

Only compiled outputs should drive recurring behavior.

## Trigger hierarchy

Scheduled crons are the dependable triggers for recurring behavior.

Use this order of trust:
- scheduled crons for required recurring work
- direct user requests for explicit one-off work
- heartbeat / opportunistic runs for bonus maintenance or extra coverage

Rule:
- if a workflow must happen reliably, encode it in `~/.openclaw/cron/jobs.json` and in the owning skill instead of relying on a heartbeat happening at the right moment
- keep cron instructions deterministic, bounded, and tied to one owning skill whenever possible

## Not a general wiki

Karpathy's pattern is right, but clawchief should use an operating-system version of it, not a sprawling personal wiki.

That means:
- prefer a small number of canonical files over lots of topic pages
- create a new canonical file only when a recurring domain truly needs its own durable policy or ledger
- keep exploratory analysis, brainstorms, and one-off writeups out of the canonical layer unless they change future behavior

The goal is not "maximum notes." The goal is "minimum reliable state."

## Memory shape

Treat memory as two different compiled products:

### Durable memory
Stored in `~/.openclaw/workspace/MEMORY.md`

Use for:
- stable personal facts
- durable company facts
- long-lived preferences
- repeated lessons worth preserving across weeks or months

### Dated snapshots
Stored either in daily memory files or in explicitly dated bullets inside canonical files

Use for:
- financial snapshots
- temporary operating assumptions
- current-state facts likely to drift
- anything that should be revisited later

Rule: if a fact has a shelf life, store it with a date or "as of" marker.
Do not let time-sensitive facts masquerade as timeless truths.

## Compilation rule

When a raw input matters, push its durable meaning into the right compiled file in the same turn whenever safe.

Examples:
- email reply changes outreach state -> update outreach sheet
- meeting note creates work -> update Todoist and any other affected live system in the same turn
- repeated new urgency / relationship pattern -> update `clawchief/priority-map.md`
- repeated execution lesson -> update skill instructions or `TOOLS.md`
- important durable personal/work fact -> update `MEMORY.md`
- time-bound operating fact -> store it with an explicit date / as-of marker
- one-off event log -> append to the relevant daily memory file
- a useful synthesis, comparison, or answer from chat -> file the durable takeaway back into the right source-of-truth doc instead of leaving it stranded in thread history

Do not leave important state trapped only in:
- chat history
- an ephemeral tool result
- a long email thread
- an unread meeting doc
- a vague memory note when a more specific canonical file exists

## Lint / health-check loop

Use heartbeats and recurring sweeps for tiny maintenance passes, not just reactive work.

This file defines the maintenance bias, not the full procedures.

Lint should look for:
- drift between raw inputs and canonical files
- duplicate or stale operating state
- repeated rules that belong in one skill or one canonical file
- task / priority / meeting-note inconsistencies
- durable lessons worth promoting into memory

## Compaction bias

Prefer fewer, better canonical files over sprawling note sprawl.

When adding a new file, ask:
- is this genuinely a new source of truth?
- or should this be compiled into an existing file?

Good reasons for a new canonical file:
- a new recurring domain appears
- the workflow needs its own durable policy layer
- a ledger / state file is needed to avoid repeated work

Bad reasons:
- temporary brainstorming
- one-off analysis that belongs in a daily memory note
- duplicating rules already defined elsewhere

## Heartbeat use

When no urgent operational issue needs Ryan, use leftover heartbeat value for exactly one compiler/lint action such as:
- clean task drift
- reconcile a meeting-notes ledger mismatch
- promote durable memory from recent daily files into `MEMORY.md`
- tighten a source-of-truth file when a repeated pattern is obvious

The goal is steady system quality improvement without noisy meta-updates.

Heartbeat work is opportunistic. It should improve the system, not carry the only reliable copy of a recurring workflow.

## New OpenClaw capability bias

When a new platform capability can improve clawchief, compile it into the operating system instead of leaving it as an unused feature.

Keep the procedural details in the relevant skill or system doc.

## Output rule

Only tell Ryan about compiler / lint work when one of these is true:
- it changed what he needs to do
- it fixed a recurring annoyance or failure mode
- it created a new capability or materially improved reliability
- he explicitly asked about system improvement

## External task system mode

When clawchief uses an external task app such as Todoist as canonical task state:
- keep the external task app as the live task database
- keep clawchief files focused on policy, prioritization, ingestion, and automation logic
- do not maintain a second live markdown task mirror unless there is a very explicit archival reason
- write durable workflow rules into skills and source-of-truth docs, not into hidden app assumptions
- keep `~/.openclaw/skills/task-system-contract/SKILL.md` current as the shared Todoist contract, and keep `~/.openclaw/workspace/clawchief/task-system-acceptance.md` as the thin audit index
- when the task-system contract changes, update the task skill, heartbeat instructions, and related source-of-truth docs so the behavior stays explicit and inspectable

## Cron determinism

For recurring clawchief work:
- let the cron be the dependable trigger
- let the owning skill hold the detailed procedure
- keep the cron message short, explicit, and ordered
- prefer deterministic sweeps over open-ended exploration
- define what to do on missing access, delivery failure, or timeout rather than leaving it implicit

Bad pattern:
- a cron quietly depends on a heartbeat, memory, or ad hoc chat context to finish its job

Good pattern:
- a cron says to use the existing owning skill, states the trigger intent, and adds only the minimal trigger-specific constraints that are not already owned by the skill

Otherwise, just improve the system quietly.

## Anti-patterns

Avoid:
- treating raw notes as canonical state
- storing durable operational rules only in chat
- letting good analyses die in chat when they should update a canonical file
- inventing hidden memory structures humans cannot inspect
- duplicating the same rule across multiple prompts when one canonical file would do
- large maintenance sweeps that create churn without improving decisions

## Success criteria

clawchief is working well when:
- R2 does not wake up blank on important ongoing work
- the key files are enough to reconstruct current state quickly
- noisy raw inputs get compiled into clean operating state
- heartbeats catch drift before it becomes a dropped ball
- Ryan sees fewer repeated summaries and more resolved work
