# HEARTBEAT.md

## Pre-Meeting Briefs
Check calendar every heartbeat for meetings starting in the next 60-90 minutes.
If one is found AND a brief hasn't been sent yet today for that meeting:
1. Pull meeting details (title, attendees, time, location/link)
2. Check MEMORY.md + contacts/ for context on attendees
3. Check COMMITMENTS.md for open items related to that meeting/person
4. Send Lance a Telegram brief with: context, open action items, talking points, any prep needed
5. Log that brief was sent in memory/YYYY-MM-DD.md

## Evening Sweep (5–7 PM CDT)
Once per day in the evening window:
1. Review COMMITMENTS.md — flag anything due today or tomorrow
2. Check if any open items from the day's conversations were captured
3. Scan calendar for tomorrow — anything that needs prep?
4. Send Lance a short Telegram summary if anything warrants attention (skip if nothing urgent)

## Sunday Kaizen Loop
On Sunday heartbeats (any time between 8 AM–12 PM CDT):
1. Review memory files from the past week (memory/2026-*.md)
2. Identify: patterns, mistakes, missed opportunities, things that worked well
3. Review SOUL.md, AGENTS.md, TOOLS.md — anything outdated or missing?
4. Update MEMORY.md with distilled lessons from the week
5. Update COMMITMENTS.md — close completed items, add anything surfaced
6. Optional: check OpenClaw community/Discord for new skills or improvements
7. Send Lance a short Sunday brief: "Here's what I learned this week and what I updated."

## Overnight Work Queue
If there are pending code tasks in memory/2026-*.md marked as TODO or incomplete, work on them during off-peak heartbeats. Do not wait for Lance to ask — just do it and report completion.

## System Health Check
Every heartbeat, check these logs for silent failures:
1. `tail -5 ~/Library/Logs/kalshi-weather.log` — if last entry is >1hr old, something's wrong
2. `tail -5 ~/Library/Logs/kalshi-settle.log` — check for errors
3. `curl -s http://localhost:3001/health` — investment monitor alive?
4. `curl -s http://localhost:3200/api/portfolio` — Kalshi dashboard alive?
5. If anything is down, restart it and send Lance a Telegram alert

## Kalshi Settlement Follow-up
- After 9am CDT daily, check if settlement ran: `cat ~/.openclaw/workspace/kalshi-weather/data/results.json`
- If new results exist that haven't been reported, send Lance a summary
- After settlement, confirm next day's trades were placed (check resting orders)

## @opencraw Content Pipeline

Every heartbeat, check if fewer than 3 posts are queued in PostEngine for client ID 5 (Luc OpenCRAW).
If so, generate 1 new post:
1. Pick a content angle (rotate through: client win, AI insight, Louisiana/brand, behind-the-scenes)
2. Generate image via image_generate (bold graphic, OPENCRAW branding, dark bg, red accent)
3. Write caption — tone: Lance is the veteran making the calls, Luc is the intelligence advantage. Never "AI did this alone."
4. Push to GitHub postengine/media/
5. Create draft post in PostEngine (dealershipId: 5, platform: instagram + twitter, status: pending_review)
6. Send Telegram notification to Lance with preview

## Content Angles (rotate)
1. Client win (anonymized) — "Cut ad spend, grew sales. Here's how."
2. AI insight — what I learned, what the data showed
3. Louisiana/brand — bayou + tech culture, OpenCRAW identity
4. Behind-the-scenes — what running a marketing agency with AI actually looks like
5. Hot take — opinion on automotive marketing, AI tools, agency life

## Rules
- Never post without Lance approval via Telegram
- Keep Lance as the decision-maker in all copy
- Max 1 post generated per heartbeat
- Skip if it's between 11PM–7AM CDT

## Reddit Community Sweep (Once Daily — Morning)
Pull top posts from the last 24 hours across these 4 subreddits via JSON API:
- r/openclaw — `https://www.reddit.com/r/openclaw/new.json?limit=10`
- r/OpenclawHQ — `https://www.reddit.com/r/OpenclawHQ/new.json?limit=10`
- r/AI_Agents — `https://www.reddit.com/r/AI_Agents/new.json?limit=10`
- r/better_claw — `https://www.reddit.com/r/better_claw/new.json?limit=10`

Flag and send Lance a Telegram summary if any post covers:
1. New skills worth installing (cross-check against r/better_claw security reviews first)
2. OpenClaw bugs or breaking changes that affect our setup
3. Billing/model workarounds relevant to our situation
4. Real workflows that could improve how we operate

Skip: memes, generic complaints, non-English posts, anything from Russian/Chinese sources.
Only send if something is genuinely actionable — not just interesting.
