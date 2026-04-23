# MEMORY.md - Long-Term Memory

## Recurring Tasks

### Daily
- Check lance@thecoopbrla.com inbox for urgent emails
- Check calendar for upcoming meetings/deadlines
- **MORNING:** Review Dealer Intel brief, add actionable items, have ready by 8 AM

### Weekly
- Review GBP insights/analytics for each dealership client
- Check social media engagement across client accounts
- Review upcoming co-op deadlines or submissions
- **Once data pipeline launches:** Monitor VinSolutions + Vauto exports, Claude-generated insights

## Client Details

### Brian Harris BMW (Baton Rouge)
- Location: Baton Rouge, LA
- Status: Active
- DMS: CDK
- CRM: VinSolutions
- GBP: Managed by Lance
- Key contact: GM (loves AI, into optimization)

### Audi Baton Rouge
- Location: Baton Rouge, LA
- Status: Active
- DMS: CDK
- CRM: VinSolutions
- GBP: Managed by Lance

### Harris Porsche
- Location: TBD
- Status: New client (kick-off 3/30/2026)
- DMS: CDK
- CRM: VinSolutions
- GBP: To be managed by Lance

### BMW of Jackson
- Location: Jackson, MS
- Status: New client (kick-off 3/30/2026)
- DMS: Reynolds (tough integration)
- CRM: Reynolds
- GBP: Managed by Lance
- Pain point: Spending $16K/mo on SEM for 30-car store — Lance cut by $8K, sales up 30%

## Key Dates & Events
- 3/31/2026 2:00 PM  Meet Autograph (DONE)
- 4/1/2026  Stroll ad due
- 4/4/2026  First data exports due from Royce (VinSolutions) + Dwayne (Vauto)
- 4/10/2026 1:00 PM Central  Autograph Analytics Follow-up Call

## New Project: Dealer Intel Analytics Platform

### What It Is
Export-based data aggregation + reporting system. Pulls weekly exports from:
- **VinSolutions** (leads, sales, conversions) — export via Royce
- **Vauto** (inventory, aging, pricing) — export via Dwayne
- **GA4 + Google Ads** (traffic, spend, conversions) — direct login
- Merges data, feeds to Claude API, generates weekly email digest to GMs

### Why
- Autograph Analytics charges $289-$549/rooftop + integration fees
- Lance can build this for $2-4K, $50/mo ongoing
- GMs get Monday morning email showing exactly what happened last week
- Lance spots trends faster, adjusts budgets mid-week
- Competitive advantage: "Weekly reporting, nobody else does that"

### Status
- **Draft emails to Royce + Dwayne** — ready in inbox, awaiting Lance signature + send
- **Brief (simplified version)** — uploaded to Drive: https://drive.google.com/file/d/1ZIY-CQBwxkup_emrKd3acuB3zxG6ByZw
- **Next:** Get confirmations on data exports → build pipeline

### Key Contacts for Data Exports
- **Royce** (VinSolutions rep) — send VIN data request
- **Dwayne** (Vauto rep) — send Vauto inventory data request

## Autograph Analytics Call Insights
- Pricing: $389/mo (marketing data) or $549/mo (+ DMS/CRM)
- Features: Unified dashboard, AI assistant (Ada), email digests, GBP review aggregation
- Lance's feedback: Good product, but over-engineered. Simpler export-based approach works better.
- Follow-up: April 10, 1:00 PM Central (to get BMW store references, discuss pricing for multiple rooftops)

## SOPs
- Always respond to GBP reviews within 24 hours
- Never use stock images — all content is custom
- Co-op submissions must match manufacturer guidelines exactly
- When drafting client communications, maintain professional but approachable tone
- Email signature: Include "Thank you. Lance" + address + contact info + logo

## Claude Max Proxy Setup (April 5, 2026 — ACTIVE)

### What's Running
- `claude-max-api-proxy` routes OpenClaw through Claude Code CLI → Claude Max subscription (free compute)
- Proxy runs on **port 3100** (not 3456 — PostEngine owns that)
- OpenClaw primary model: `openai/claude-sonnet-4` → proxy → Claude Max
- Fallback: `anthropic/claude-sonnet-4-6` (API billing) if proxy goes down

### Auto-Start
- LaunchAgent: `~/Library/LaunchAgents/com.claude-max-api.plist`
- Logs: `~/Library/Logs/claude-max-api.log`
- Starts on boot, stays alive (KeepAlive: true)

### Config
- `~/.openclaw/openclaw.json` — has `env.OPENAI_BASE_URL: http://localhost:3100/v1`
- Rollback backup: `~/.openclaw/openclaw.json.bak.pre-claude-max`

### If It Breaks
1. Check proxy: `curl http://localhost:3100/health`
2. Restart proxy: `launchctl kickstart -k gui/$(id -u)/com.claude-max-api`
3. Rollback config: `cp ~/.openclaw/openclaw.json.bak.pre-claude-max ~/.openclaw/openclaw.json && openclaw gateway restart`

## Luc Social Handles
- X/Twitter: @lucopencraw → https://x.com/lucopencraw
- Instagram: @opencraw → https://www.instagram.com/opencraw
- Display name: Luc Fasho
- Both connected to PostEngine/Zernio for posting
- Josh Gwin (Autotrader) approved on iMessage (+12259541627) — introduced to Luc April 9, 2026

## Model Switch — April 9, 2026 (ACTIVE)
- Switched primary model from anthropic/claude-sonnet-4-6 to **xai/grok-4.1-fast**
- xAI API key configured: xai-7pmnZpKvhfAGfYS0Zw81X75XKBq3P361RrnUlJ0c9l0Xt2pOTsbixloXPW5A73NiW2e2kRt63jsPsXGv
- Fallbacks: xai/grok-4.20 → anthropic/claude-sonnet-4-6
- Pricing: Grok 4.1 Fast = $0.20/$0.50 per million tokens (vs $3/$15 for Claude Sonnet)
- Grok has real-time X search built in via xai/grok-4 models
- Config: ~/.openclaw/openclaw.json + ~/.openclaw/agents/main/agent/models.json
- Gateway restarted April 9 ~9:55 PM CDT — confirmed loading grok-4.1-fast

## Claude Max / Billing Status (April 9, 2026)
- Anthropic killed subscription billing for third-party tools on April 4, 2026
- Our claude-max-api-proxy NO LONGER routes through Max subscription — now hits Extra Usage billing
- $600+ spent on Anthropic API to date
- Options discussed: bypass proxy (ToS risk), Gemini free tier, hard cap
- Decision: no change for now, revisit soon
- Action: set hard spending cap in Anthropic settings to limit bleeding

## Demo Prestige BMW Vendor Brief
- Live at: https://thecooperativeagency.github.io/vendor-briefs/demo-prestige-bmw.html
- Fake dealership for prospect pitches — Prestige BMW of Nashville, GM: Michael Hartley
- Includes: vendor stack, spend summary, meetings & events, meeting notes with linked summaries
- Two meeting note pages: Apr 2 (onboarding kickoff) + Apr 9 (zone manager prep)
- No links back to real client pages — safe to send to prospects

## Lessons Learned
- Christy Faucheux is Lance's wife — email: christyfaucheux@gmail.com
- Model switching works: Haiku for daily work, escalate to Sonnet/Opus when needed (complex analysis, creative direction)
- Avoid over-engineering: Export-based reporting beats API complexity every time
- GMs don't want fancy dashboards; they want a Monday morning email that tells them what matters

## GA4 Dashboard Project (April 3-4, 2026 - ACTIVE)

### Status
- ✅ All 3 dashboards live on GitHub Pages
- ✅ Dark mode, Cooperative Agency branding, logo in header
- ✅ Date range filters (30/60/90 days)
- ✅ YoY + sequential period comparison
- ✅ Top 20 traffic sources (real GA4 data) with doughnut chart
- ✅ Market-adjusted benchmarks by brand and market size
- ✅ Metrics grid: Pages/Session, Bounce Rate, Avg Duration, New User Rate, Page Views, Mobile %
- ✅ Weekly auto-update cron job (every Monday 6AM CDT)
- ✅ Update script: `/Users/lucfaucheux/.openclaw/workspace/ga4-dashboards/update-dashboards.sh`

### Live URLs
- BMW Jackson: https://thecooperativeagency.github.io/Ga4-dashboards/bmw-jackson-dashboard.html
- Brian Harris BMW: https://thecooperativeagency.github.io/Ga4-dashboards/brian-harris-bmw-dashboard.html
- Audi Baton Rouge: https://thecooperativeagency.github.io/Ga4-dashboards/audi-baton-rouge-dashboard.html

### Next Steps
- Add VinSolutions lead data (email reports to lucfasho@gmail.com, parse CSV, add to dashboards)
- Add Audi OEM site data once Cody grants access (harrisporsche738@gmail.com)
- Add note to Audi BR dashboard: "dealer site only, OEM data pending"
- Harris Porsche dashboard (once GA4 access granted)

### VinSolutions Integration Plan
- Lance sets up scheduled report in VinSolutions → emails to lucfasho@gmail.com
- I check inbox, download CSV, parse lead data
- Add metrics: total leads, lead sources, conversion rate, response time, leads by model
- Brian Harris BMW first as test
- Requires: fresh eyes on VinSolutions tomorrow to set up report

## Dashboard Revision Project (April 3, 2026 - COMPLETED)

### What Lance Asked For
1. Date range filters (30/60/90 days + custom)
2. YoY comparison (current vs same period last year)
3. Sequential comparison (current vs previous period)
4. Logo integration (white PNG provided)
5. "Custom Developed by The Cooperative Agency" branding in header
6. Footer with contact info
7. Keep existing color schemes for each dealership

### Status
- Started with Haiku (had issues)
- Switched to Sonnet (better but complexity with date logic taking longer)
- **PAUSED** — too many false starts, better to build fresh tomorrow
- Logo file ready: white PNG
- Original dashboards still live at GitHub Pages (working fine)

### Next Steps (Tomorrow)
1. Fresh approach with Sonnet
2. Build one dashboard completely + test locally
3. Deploy to GitHub
4. Replicate to other two
5. No promises on timeline — just actual delivery

---

## GA4 Analytics Project (April 2, 2026)

### Status
- ✅ GA4 data pulled for all 3 dealerships (March 2 - April 1, 2026)
- ✅ 10-metric dashboard created (Traffic & Engagement + Inventory & Search)
- ✅ Interactive web dashboards built (HTML/CSS/JS + Chart.js)
- ✅ GitHub repo created: thecooperativeagency/Ga4-dashboards
- ⏳ GitHub Pages setup needed (awaiting user to enable in repo Settings)
- 📊 Test dashboard: BMW of Jackson (live once Pages enabled)

### GA4 Properties & Accounts
- **Brian Harris BMW:** Property 334199347, Account 74380124 (26K sessions, 3.29 pages/session)
- **Audi Baton Rouge:** Property 381984706, Account 82333601 (15.5K sessions, 79% new users)
- **BMW of Jackson:** Property 255835161, Account 118997487 (27.6K sessions, highest traffic)
- **Harris Porsche:** OEM-controlled GA4 (awaiting Cody approval for access)

### Next Steps
1. Enable GitHub Pages in repo Settings (user: Lance)
2. Verify dashboards live at https://thecooperativeagency.github.io/Ga4-dashboards/
3. Create matching dashboards for Audi BR + Brian Harris BMW
4. Add Q1 2025 vs Q1 2026 comparison analysis (if GA4 historical data available)
5. Add device/mobile breakdown (requires GA4 event tracking setup)

### Deliverables Created
- 3 interactive HTML dashboards (BMW Jackson, Brian Harris BMW, Audi BR)
- Google Sheets summaries for each dealership
- README.md with documentation
- GitHub repo ready for GitHub Pages deployment

### iMessage Setup
- ✅ Test message sent successfully to Lance (+12254398920)
- ⏳ Pairing approval needed: `openclaw pairing approve message NC979F6J`
- Once approved: Full iMessage capability without pairing prompts

## Harris Porsche Parts Meeting Brief (April 2, 2026)

### Action Items
**Immediate (This Week):**
1. Photography/Video Shoot (Rexy + 1948 models, 2-3 hours same day)
2. Website Updates (remove troll photo, add staff members)

**Short-term (2 Weeks):**
3. eBay Store Setup (BH Porsche or German-adjacent account name)
4. Pricing Strategy Review (Rexy Lego positioning, Design watches promotion)

**Ongoing:**
5. Social Media Content (parts advertising historically underrepresented)

### Key Insights
- Non-returnable Porsche inventory needs clearing
- Design watches have margin but zero manufacturer support — opportunity
- Collections/bundles outperform single items
- Parts marketing gap on social

### Deliverable
- Google Sheet brief: https://docs.google.com/spreadsheets/d/1q7ALUjzm5GAjsnftKB8jCZRF7V08DLfarYGCXw8AIy4

## Harris Porsche Van Livery Project

### Status
- ✅ Concept mockup generated (heritage-inspired, red/cream color scheme)
- ✅ Saved to workspace: `/Users/lucfaucheux/.openclaw/workspace/Harris Porsche Van Livery/`
- ✅ Drive folder created: https://drive.google.com/drive/folders/1J8Wr7lTVqnLnuUctk_YxONx7lMYuNDag

### Design Direction
- Classic Porsche heritage livery (inspired by vintage Porsche vans)
- Clean, modern aesthetic (NOT 90s/2000s dated look)
- Bold white "HARRIS PORSCHE" typography on red
- Porsche crest subtly placed
- Thin white accent stripe
- QR code discretely positioned

### Next Steps
1. Review concept mockup
2. Iterate on color split (all red vs red/cream)
3. Get final approval from Porsche
4. Create professional Illustrator files (SVG/EPS) for vinyl wrap shop

## Growth Strategy & Group Expansion (April 2, 2026)

### Active Opportunities

**1. Herrin-Gear Automotive Group (Jackson, MS)**
- Portfolio: BMW Jackson (current client), Chevy, Lexus, INFINITI, Toyota
- Forbes "Best-in-State Company" (2026)
- Contact: BMW GM (friend/ally) + Lexus GM
- Strategy: BMW GM introduces you to Lexus GM → proof point → pitch to group
- Current wins: BMW Jackson up 30% YoY (market down YoY), cut SEM from $16K to $8K/mo
- Next: Get BMW GM to make warm intro to Lexus GM

**2. Pine Belt Auto Group (Hattiesburg, MS) — HOT LEAD**
- Portfolio: Chevy, Buick, Chrysler, Dodge, Jeep, RAM (multiple locations)
- Contact: Edwin (President)
- Last conversation: Feb 24, 2026 (over month old — needs re-engagement)
- His message: Interested in vendor consolidation, closing on 2 new stores, wants to "clean up the whole system"
- Status: WARM PROSPECT — not cold
- Next: Text Edwin today: "Hey Edwin, checking back in. We've had great wins with BMW Jackson (30% YoY growth). Would love to show you what we could do for Pine Belt. 30 mins next week?"

### Growth Play
- Close Herrin-Gear via warm intro (peer credibility)
- Activate Pine Belt via Edwin re-engagement
- Target result: 10-12+ rooftops under 2-3 group contracts (vs current 4 individual stores)
- Timeline: Q2 2026 for first group contract

### Key Success Factors
- **Proof points:** BMW Jackson case study (30% growth, $8K/mo savings)
- **Peer selling:** Let BMW GM sell to Lexus GM
- **Re-engagement urgency:** Edwin conversation is dated; fresh contact needed ASAP

## Kalshi Multi-Vertical Trading System (Built April 7, 2026 — ACTIVE)

### Location
`/Users/lucfaucheux/.openclaw/workspace/kalshi-weather`

### Architecture
- **Weather:** 3-model consensus (NOAA + GFS + ECMWF), skips low confidence (>4°F spread)
- **Arb:** Polymarket vs Kalshi price discovery scanner (NBA, NHL, MLB, Fed, Crypto)
- **Auto-trading:** Live mode places limit orders automatically on high-confidence signals
- **Settlement:** Auto-checks positions at 9am + 3pm CDT, fires Telegram report, triggers next scan
- **Dashboard:** React UI at http://localhost:3200

### Cities (weather)
NYC, CHI, MIA, DAL, ATL, NOLA, LA

### Crons
- `*/30 6-22` — weather scan
- `*/15 6-23` — arb scan
- `0 14,20` — settlement check + auto next-day scan

### Open Positions (Apr 7, 2026)
- NYC B46.5 YES 5 contracts @ $0.15 (filled)
- NYC B48.5 YES 1 contract @ $0.28 (resting)
- ATL B67.5 YES 5 contracts @ $0.25 (filled)
- MIA B78.5 YES 5 contracts @ $0.20 (resting)
- NOLA B75.5 YES 5 contracts @ $0.27 (resting)
- MLB Dodgers NO 10 contracts @ $0.68 (resting)
- All settle Apr 8 (weather) or October (Dodgers)

### Kalshi API
- Key ID: e62f1ce7-b0ae-405d-8ce1-5e75064f9e08 (in .env — ROTATE THIS KEY)
- Balance: ~$40 cash + $8.49 portfolio
- Trading mode: paper (flip to live in .env TRADING_MODE=live)
- Max trade: $25/position

### Signal Logic
- Target bracket contracts $0.20-$0.60 YES only
- High confidence = all 3 models within 2°F → lower threshold (2°F gap triggers)
- Medium confidence = models within 4°F → standard threshold (3°F gap)
- Low confidence = spread >4°F → SKIP entirely

### Commands
```bash
cd ~/.openclaw/workspace/kalshi-weather
npx ts-node src/index.ts --scan-once      # weather scan
npx ts-node src/index.ts --arb            # arb scan
npx ts-node src/index.ts --check-settle  # check + settle positions
npx ts-node src/index.ts --results       # all-time P&L
npx ts-node src/index.ts --paper         # paper trade summary
npx ts-node src/backtest.ts              # full backtest
```

### Scale-up Plan
- Phase 1 (now-April): small live + paper, build 20+ settled trades
- Phase 2 (May, if >55% win rate): $10-25/position
- Phase 3 (Summer, if profitable): $50-100/position, add economics vertical

### Next improvements
- Rotate Kalshi API key (sent over Telegram — potentially exposed)
- Add BOS, PHX, SEA to weather cities
- Build economics vertical (CPI, Fed same-day contracts when available)

## Investment Monitoring Project (Started April 2, 2026)

### Vision
Personal portfolio tool that monitors public investors' moves + strategies, alerts you to their activity, tracks correlation with your portfolio performance. Minimal manual intervention, fully automated.

### Primary Subject
**Chris Camillo** — Public investment educator/strategist with strong track record and YouTube presence

### Additional Subjects to Identify
Find 3-4 other high-conviction public investors with:
- Strong track records
- Great public sentiment toward their strategies
- Transparent public activity (YouTube, social, interviews)

### System Architecture (To Build)
1. **Data aggregation agent** — Monitor Chris + others across:
   - YouTube transcripts (API)
   - Twitter/X public feed
   - SEC filings (if applicable)
   - News mentions

2. **Signal extraction** — NLP to identify:
   - Investment positions (buys/sells)
   - Investment thesis/reasoning
   - Timing of announcements
   - Sector/stock mentions

3. **Automated tracking dashboard** — Show:
   - What each investor is doing
   - Performance of their positions
   - Correlation with your portfolio
   - Weekly summaries

4. **Alert system** — Notify you when:
   - New position mentioned
   - Significant move (big buy/sell)
   - Thesis change
   - Performance milestones

### Philosophy
- **You own all decisions** (don't blindly follow)
- **I own the data pipeline** (clean, accurate signal extraction)
- **Goal:** "Here's what Chris is doing. Here's the data. YOU decide."

### Lance's Tomorrow
- Account setup (brokerage, data APIs)
- Funding (if needed for premium data sources)
- Infrastructure decisions (where to host the dashboard)

### Next Steps
1. Send caption formats + CTAs for each store → I'll bake them into caption writer
2. Set up auto-scan cron (scan Drive folders every X hours)
3. Wire up Zernio publishing (approval → publish)
4. Add The Cooperative Agency as 5th client in PostEngine
5. VinSolutions lead data integration (email CSV to lucfasho@gmail.com)

## PostEngine — Social Media Pipeline (Built April 4, 2026)

### Status
- ✅ Running locally on Mac Mini at http://localhost:3456
- ✅ 4 dealerships loaded (BMW Jackson, Brian Harris BMW, Audi BR, Harris Porsche)
- ✅ Zernio API connected (sk_a2ea86b0...) — 12 accounts (IG + FB + GMB per dealership)
- ✅ Google Drive folders created per dealership (New Cars, Pre-Owned, Service, Parts & Accessories, _Archive)
- ✅ Drive scanner built (POST /api/drive/scan)
- ✅ Auto-archive on approval (image moves to _Archive when post scheduled)
- ✅ Cadence settings built in Settings UI
- ✅ Nav routing fixed (hash-based)
- ✅ PostEngine set to auto-start via LaunchAgent (or run manually)

### Tech Stack
- Backend: Express + TypeScript + SQLite (via Drizzle ORM)
- Frontend: React + Vite + Tailwind + shadcn/ui
- Location: `/Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager`
- Port: 3456
- Start command: `cd .../postengine/social-post-manager && PORT=3456 npm run dev`

### Drive Folder IDs
- Config: `.drive-folders.json` in PostEngine root
- Brian Harris BMW root: 1lYpn2ha-9NfB2DPE-c8iRETZyTo8QB_n
- BMW of Jackson root: 1VrvSBEZ6ch0QgQTtNzzh-xYgxRPWpXqC
- Audi Baton Rouge root: 1qA3juHq72ezNotu3NaOukfg9E-K5YKzd
- Harris Porsche root: 1vWOiInvpN6HJX-NU9Iwy1Pm-s20x85Ya

### Zernio Account IDs
- Config: `.zernio-accounts.json` in PostEngine root
- Base URL: https://zernio.com/api/v1
- All 4 dealerships connected (IG + FB + GMB)

### File Naming Convention
`2026-BMW-M3-Competition-Alpine-White.jpg`
- Year-Make-Model-Trim-Color
- Drop in correct subfolder → scanner auto-creates draft post

### Next Steps
1. Caption formats + CTAs from Lance → bake into caption writer
2. Auto-scan cron (every few hours)
3. Zernio publish integration (approval → live post)
4. Add The Cooperative Agency as 5th client

## People
- Pop Faucheux (father) — 225-445-4274
- Alex (brother) — 225-772-2038
- Ashlyn (associate) — 765-918-1215
- Maximus (Lance's son) — texts jokes/silly stuff; respond playfully
- David Villa — +1 (225) 439-8920 (intro text sent)
- Edwin (Pine Belt Auto Group President) — WARM PROSPECT, needs re-engagement

## PostEngine — Zernio Status (April 4-5, 2026)

### What's Working
- ✅ Drive scanner (picks up images from subfolder)
- ✅ Cadence-based scheduling
- ✅ Claude caption writer (IG, FB, GMB versions)
- ✅ Zernio API connected — posts being created
- ✅ Drive folders public (drive.usercontent.google.com URL format works)
- ✅ PostEngine UI — nav, cadence settings, review queue all working

### Zernio Issue
- Posts created via API but showing "No posts" in Zernio dashboard
- Red X failures in Zernio logs — cause unknown
- All platform tokens show connected/green
- Need to debug tomorrow — likely caption format or media URL issue

### PostEngine TODO (Tomorrow)
- Full code review + cleanup (originally Perplexity-built)
- Add The Cooperative Agency branding throughout the UI
- Fix Zernio publish failures
- Add GMB caption visible in post review/editor UI
- Test full pipeline with properly renamed photos
- Set up auto-start on Mac boot (LaunchAgent)
- Remove PerplexityAttribution component

## PostEngine — Social Media Pipeline (Built April 4, 2026)

### Status
- ✅ Running locally on Mac Mini at http://localhost:3456
- ✅ Accessible remotely via Tailscale at http://100.83.146.27:3456
- ✅ Saved as web app on Lance's iPhone home screen
- ✅ 4 dealerships loaded (BMW Jackson, Brian Harris BMW, Audi BR, Harris Porsche)
- ✅ Zernio API connected (sk_a2ea86b0...) — 12 accounts (IG + FB + GMB per dealership)
- ✅ Google Drive folders created per dealership (New Cars, Pre-Owned, Service, Parts & Accessories, _Archive)
- ✅ Drive scanner built (POST /api/drive/scan)
- ✅ Auto-archive on approval (image moves to _Archive when post scheduled)
- ✅ Cadence settings built in Settings UI with media requirements calculator
- ✅ Nav routing fixed (hash-based)
- ✅ Auto media hosting: Drive → GitHub postengine/media/ → Zernio
- ✅ Telegram approval flow (photo preview + approve/reject buttons)
- ✅ Cooperative Agency branding (logo, footer, page title)
- ✅ Perplexity attribution removed
- ✅ Weekly scan cron: Sunday 2 AM CDT
- ✅ Instagram ✅ GMB publishing confirmed live
- ✅ Facebook publishing working

### Tech Stack
- Backend: Express + TypeScript + SQLite (via Drizzle ORM)
- Frontend: React + Vite + Tailwind + shadcn/ui
- Location: `/Users/lucfaucheux/.openclaw/workspace/postengine/social-post-manager`
- Port: 3456 (all interfaces — Tailscale accessible)
- Start command: `cd .../postengine/social-post-manager && bash start.sh`
- GitHub: https://github.com/thecooperativeagency/postengine

### Drive Folder IDs
- Config: `.drive-folders.json` in PostEngine root
- Brian Harris BMW root: 1lYpn2ha-9NfB2DPE-c8iRETZyTo8QB_n
- BMW of Jackson root: 1VrvSBEZ6ch0QgQTtNzzh-xYgxRPWpXqC
- Audi Baton Rouge root: 1qA3juHq72ezNotu3NaOukfg9E-K5YKzd
- Harris Porsche root: 1vWOiInvpN6HJX-NU9Iwy1Pm-s20x85Ya

### Zernio Account IDs
- Config: `.zernio-accounts.json` in PostEngine root
- Base URL: https://zernio.com/api/v1
- All 4 dealerships connected (IG + FB + GMB)

### File Naming Convention
`2026-BMW-M3-Competition-Alpine-White.jpg`
- Year-Make-Model-Trim-Color
- Drop in correct subfolder → scanner auto-creates draft post

### Next Steps
1. Caption formats + CTAs from Lance → bake into caption writer
2. Set up auto-start on Mac boot (LaunchAgent)
3. Add The Cooperative Agency as 5th client in PostEngine
4. VinSolutions lead data integration (email CSV to lucfasho@gmail.com)

## Growth Strategy & Group Expansion (April 2, 2026)

### Active Opportunities

**1. Herrin-Gear Automotive Group (Jackson, MS)**
- Portfolio: BMW Jackson (current client), Chevy, Lexus, INFINITI, Toyota
- Forbes "Best-in-State Company" (2026)
- Contact: BMW GM (friend/ally) + Lexus GM
- Strategy: BMW GM introduces you to Lexus GM → proof point → pitch to group
- Current wins: BMW Jackson up 30% YoY (market down YoY), cut SEM from $16K to $8K/mo
- Next: Get BMW GM to make warm intro to Lexus GM

**2. Pine Belt Auto Group (Hattiesburg, MS) — HOT LEAD**
- Portfolio: Chevy, Buick, Chrysler, Dodge, Jeep, RAM (multiple locations)
- Contact: Edwin (President)
- Last conversation: Feb 24, 2026 (over month old — needs re-engagement)
- His message: Interested in vendor consolidation, closing on 2 new stores, wants to "clean up the whole system"
- Status: WARM PROSPECT — not cold
- Next: Text Edwin today: "Hey Edwin, checking back in. We've had great wins with BMW Jackson (30% YoY growth). Would love to show you what we could do for Pine Belt. 30 mins next week?"

### Growth Play
- Close Herrin-Gear via warm intro (peer credibility)
- Activate Pine Belt via Edwin re-engagement
- Target result: 10-12+ rooftops under 2-3 group contracts (vs current 4 individual stores)
- Timeline: Q2 2026 for first group contract

### Key Success Factors
- **Proof points:** BMW Jackson case study (30% growth, $8K/mo savings)
- **Peer selling:** Let BMW GM sell to Lexus GM
- **Re-engagement urgency:** Edwin conversation is dated; fresh contact needed ASAP

## Audi BR Google Ads — Action Items (Week of April 6, 2026)
- ✅ Competitor negative keywords added (Lincoln, Lexus, Cadillac, etc.)
- ⏳ Review full optimization brief with SEM guy this week
- ⏳ Verify/fix conversion tracking (form fills, phone calls, VDP views)
- ⏳ Pause generic luxury keywords (2026 luxury suv, new luxury suv, etc.)
- ⏳ Double Brand campaign budget ($5 → $15/day)
- ⏳ Double Service campaign budget ($10 → $20/day)
- Brief: https://docs.google.com/document/d/17qcSjmjsuQQnrUiN5At6c9yQdUBO-8KQ/edit
- Data: https://docs.google.com/spreadsheets/d/15xl3whvuaUnGkwPBEy3Mz_xeYM6DMkFHtv4rh1GHnRs/edit

## Mission Control Dashboard
- **Live URL (Vercel):** https://mission-control-kvhd0duxe-thecooperativeagencys-projects.vercel.app/tasks
- **Local (Tailscale):** http://100.102.212.22:3000
- **Local (LAN):** http://192.168.0.14:3000
- **GitHub:** https://github.com/thecooperativeagency/mission-control
- Auth removed for now — add back once stable
- Todoist live (62 tasks), Memory, Projects, Office all wired
- Next: point hub.thecoopbrla.com at Vercel, add auth back

## SEO Comp Page Rules — Sister Store Logic

### Core 4 BMW Competitors
BMW, Lexus, Mercedes-Benz, Audi

### Sister Store Matrix (NEVER build comps against sister brands)
- **Brian Harris BMW (Baton Rouge)** — sister: Audi Baton Rouge → skip all Audi comps
- **BMW of Jackson** — sister: Lexus Jackson (Herrin-Gear group also has Chevy + Infiniti) → skip Lexus + Infiniti comps

### Comp pages per store
| Comp | BHBMW | BMW Jackson |
|------|-------|-------------|
| vs Mercedes | ✅ | ✅ |
| vs Lexus | ✅ | ❌ |
| vs Audi | ❌ | ✅ |
| vs Infiniti | N/A | ❌ |

Always check dealer group before building comp pages.
