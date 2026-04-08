# HEARTBEAT.md

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
