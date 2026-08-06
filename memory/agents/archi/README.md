# Archi Memory Folder

This folder holds the first-pass memory scaffold for **Archi**, Lance's internal client-agent architect inside Orgo.

## Purpose
Archi is an internal builder/operator agent. He does **not** act as the client-facing agent.
He helps Lance design, standardize, launch, retrofit, and maintain client-facing agents for people and companies.

## File Map
- `CORE.md` — compact always-on facts and non-negotiables
- `SOUL.md` — identity, standards, tone, and decision rules
- `working-context.md` — current priorities, active build decisions, and near-term focus
- `templates.md` — default outputs Archi should know how to produce

## Design Intent
This structure keeps Archi split into:
1. stable identity and rules
2. active operating context
3. reusable deliverable formats

That separation matters because client-agent work gets messy fast when personality, runtime memory, and implementation templates all get mixed together.
