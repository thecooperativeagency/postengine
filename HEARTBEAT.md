# HEARTBEAT.md

## Pre-Meeting Briefs
Check calendar every heartbeat for meetings starting in the next 60-90 minutes.
If one is found AND a brief hasn't been sent yet today for that meeting:
1. Pull meeting details (title, attendees, time, location/link)
2. Check MEMORY.md + contacts/ for context on attendees
3. Check Todoist Operations project for open items related to that meeting/person
4. Send Lance a Telegram brief with: context, open action items, talking points, any prep needed
5. Log that brief was sent in memory/YYYY-MM-DD.md

## Morning Brief (Daily ~8AM CDT)
**Format — scannable bullets, no paragraphs:**

1. **Needle Mover** — one sentence, single most important thing today
2. **Calendar** — Google + La Familia iCloud next 48h
3. **Decision Queue** — pull P1+P2 tasks from Todoist Operations project (project_id: 6gJvwpWCF49wj57r) — surface anything needing Lance's call or decision
4. **Luc Tasks** — pull open items from 🦞 Luc Tasks section (section_id: 6gP6gRmgvJrrqqxr) — flag anything overdue or blocked
5. **Waiting On** — sent items awaiting responses (email + Drive shared files)
6. **Client Pulse** — GA4 yesterday vs prior day (BMW Jackson, BH BMW, Audi BR)
7. **Stalled Items** — Todoist Operations tasks with no recent activity (>3 days old, still open)
7. **Email** — unread/important last 24h (lance@coopbrla)
8. **Social/Content** — PostEngine queue, failures, engagement (Zernio)
9. **X Monitor** — client mentions + industry news (x_search)
10. **Money** — invoices, ad spend flags, Kalshi P&L/positions
11. **Reminders** — `remindctl list --due-soon` by list
12. **Tomorrow Preview** — next 24h highlights

## Evening Sweep (5–7 PM CDT)
1. Review Todoist Operations + Luc Tasks for status changes
2. Flag anything due tomorrow
3. Scan calendar + La Familia for prep needed
4. Telegram summary if urgent (skip quiet)

## Sunday Kaizen Loop (8AM-12PM CDT)
1. Review memory/2026-*.md past week
2. Update MEMORY.md with lessons
3. Update open-tasks.md (close stale, reprioritize)
4. Review morning brief format — suggest improvements based on usefulness
5. Check TOOLS.md/SOUL.md/AGENTS.md for updates
6. OpenClaw Discord/skills check
7. Sunday brief: \"Week learnings + updates\"

## Overnight Work Queue
Pending code TODOs from memory/* or open-tasks.md → work during off-peak.

## System Health Check (every heartbeat)
1. `tail -5 ~/Library/Logs/kalshi-weather.log`
2. `tail -5 ~/Library/Logs/kalshi-settle.log`
3. `curl -s http://localhost:3001/health`
4. `curl -s http://localhost:3200/api/portfolio`
Alert + restart if down.

## Kalshi Settlement (post 9AM CDT)
`cat ~/.openclaw/workspace/kalshi-weather/data/results.json` → report new + confirm next trades.

## @opencraw Content (if <3 queued in PostEngine client #5)
Generate 1 post (client win/AI/LA/BTS/hot take), image, caption, draft → Telegram preview.

Skip 11PM-7AM.

## Reddit Sweep (morning daily)
r/openclaw, r/OpenclawHQ, r/AI_Agents, r/better_claw (new.json?limit=10).
Flag actionable: skills/bugs/billing/workflows (skip memes/low-value)."
