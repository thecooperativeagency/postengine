# Session Notes — April 9, 2026

## Billing / Model Situation
- Anthropic blocked third-party tools (OpenClaw) from Claude Max subscriptions on April 4, 2026
- Our claude-max-api-proxy was never actually working — CLI wasn't authenticated until today
- After auth fix, all calls still billing as "Extra Usage" — not covered by Max plan
- On pace for $1K+/month at current usage
- $100 one-time credit from Anthropic (expires April 17) — likely already claimed to Extra Usage
- Decision deferred: options are Gemini free tier, hard cap, or bypass proxy (ToS risk, skipping)
- Gemini Flash Lite recommended by community for heartbeats — could significantly cut cost
- cliBackends config is MISSING from openclaw.json — not a cost fix, just a config cleanup item
- OpenClaw updated tonight — was a security patch (CVE-2026-33579 privilege escalation)

## Pipeboard — RECONNECTED
- Token: pk_d19a7271170d4ca5b966a6bd5b4765de
- Meta endpoint: https://meta-ads.mcp.pipeboard.co/ (jsonrpc 2.0)
- Google Ads endpoint: https://google-ads.mcp.pipeboard.co/ (jsonrpc 2.0)
- Auth: Authorization: Bearer header
- Meta accounts connected:
  - Audi Baton Rouge: act_657762306677073 (NO active campaigns)
  - Brian Harris BMW: act_2251928511489565
  - Lance personal: act_888583291328048 ($1,706 spent total)
- Google Ads: bhbmwecommerce@gmail.com — quota exhausted today, resets ~7AM April 10
- Full Google Ads capabilities confirmed: campaigns, keywords, search terms, auction insights, GAQL, negative keywords, etc.
- Saved to TOOLS.md

## ABR Meta Ads — New Project Started
- No active Meta campaigns on Audi Baton Rouge
- Plan: build new car buyer audiences, then campaign + messaging
- Geo strategy: 100-mile radius from ABR store
  - Baton Rouge (40mi radius) — key: 2452520
  - New Orleans (30mi radius) — key: 2454320
  - Lafayette (25mi radius) — key: 2453875
  - Metairie (20mi radius) — key: 2454179
  - Covington (20mi radius) — key: 2453025
  - Mandeville (20mi radius) — key: 2454092
  - Houma (20mi radius) — key: 2453701
  - Hammond (20mi radius) — key: 2453581
- Interest IDs confirmed:
  - Luxury vehicle: 6004048615096
  - Audi: 6003397432935
  - Car dealership: 6003284404179
  - Audi Q5: 6003280496610
  - BMW: 6003257785488
  - Mercedes-Benz: 6003293721530
- Meta audience estimate API returning empty (audience too small for privacy threshold) — build directly in platform
- Lookalike audience from customer list = next step (need email list from CRM)
- 4 tasks added to Todoist as P4 (Client Work)

## GA4 Bounce Rate Analysis — COMPLETED
- Added bounce rate by URL + traffic source breakdown to all 3 GA4 dashboards
- Brian Harris BMW: /service-specials (83%), /oil-change (80%) — both driven by Google CPC
- Audi BR: /en/inventory/new at 98.8% — OEM/paid social ads routing to wrong domain (audibatonrouge.com vs audibatonrougela.com)
- BMW Jackson: /cars/new-x3 (79%), /cars/new-x5 (78%) — Google + Facebook CPC both bouncing at 82%
- Pattern: organic traffic 1-9% bounce on same pages, paid traffic 70-85% bounce — intent mismatch

## Issue Briefs Built — SENT READY
- Vania (Audi OEM): https://thecooperativeagency.github.io/Ga4-dashboards/audi-br-vania-brief.html
- J&L (Brian Harris BMW): https://thecooperativeagency.github.io/Ga4-dashboards/brian-harris-bmw-jl-brief.html
- J&L (BMW Jackson): https://thecooperativeagency.github.io/Ga4-dashboards/bmw-jackson-jl-brief.html

## GA4 Analytics Auth — FIXED
- bhbmwecommerce@gmail.com re-authed with Analytics scope
- Token stored: `security find-generic-password -a "token:analytics:bhbmwecommerce@gmail.com" -s "gogcli"`
- BMW Jackson: `security find-generic-password -a "token:analytics:bmwofjackson@thecoopbrla.com" -s "gogcli"`
- ga4-query.sh updated to use analytics-scoped token first

## Vendor Briefs — Updates
- Demo Prestige BMW brief live: https://thecooperativeagency.github.io/vendor-briefs/demo-prestige-bmw.html
- Brian Harris BMW brief updated: Mon/Fri mgmt meetings + monthly photo shoot added
- April 9 meeting notes added for Brian Harris BMW
- Layout standard: Meetings & Events + Meeting Notes go ABOVE vendor tables

## SEO Comparison Pages — In Progress
- BMW X5 vs Lexus GX: https://thecooperativeagency.github.io/Ga4-dashboards/bmw-x5-vs-lexus-gx.html
- Content solid, look/vibe needs work to match BMW dealer style
- Plan: nail the design, build a library for all stores
- Specs confirmed: X5 xDrive40i — 375hp, 398 lb-ft, 5.1s 0-60, 23/27 MPG, 72.3 cu ft cargo, $67,300
- Lexus GX 550 — 349hp, 479 lb-ft, 6.5s 0-60, 17/22 MPG, 49.3 cu ft cargo, $67,735

## Dark/Light Mode — Added
- All GA4 dashboards and vendor briefs now have ☀️/🌙 toggle
- Fixed: header stays dark in light mode so logo is always visible

## ClawhHub / Skills Research
- Reddit accessible via JSON API: reddit.com/r/subreddit.json
- ClawhHub accessible via: npx clawhub@latest inspect/search/install
- Rules: no Chinese or Russian sourced tools near client data
- daily-brief: Security: SUSPICIOUS + calls Baidu API — SKIP
- note-taker: Security: CLEAN but Chinese, not needed — SKIP
- memory-search: redundant (built into OpenClaw) — SKIP
- openclaw-google-ads: Security: SUSPICIOUS, VirusTotal flagged — SKIP
- Reddit sweep added to heartbeat (daily, morning): r/openclaw, r/OpenclawHQ, r/AI_Agents, r/better_claw

## Josh Gwin — iMessage
- Approved on iMessage (pairing: DAW62VUX)
- Introduced to Luc — sent intro text + X/IG profile links
- NOTE: Always intro as "Luc here" not "Lance here" when texting as Luc

## Key Contacts / Context
- Michael Dorsey (J&L) = primary Google/Meta ads contact for BH BMW, BMW Jackson, Harris Porsche
- Gabriel = Lance's paid media analyst, in accounts daily
- Vania = Audi OEM rep, adding GA4 tag to audibatonrougela.com — watch for meeting summary email
- Dwayne (vAuto) — support case opened under wrong account (Herrin Gear) — email sent to fix
- vAuto API access form submitted to Todoist (P3)

## Luc Social
- X: @lucopencraw → https://x.com/lucopencraw
- IG: @opencraw → https://www.instagram.com/opencraw
- Both in PostEngine/Zernio (client ID 5)
