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

## Client Details

### Brian Harris BMW (Baton Rouge)
- Location: Baton Rouge, LA | DMS: CDK | CRM: VinSolutions | GBP: Managed by Lance
- GA4 Property: 334199347, Account: 74380124
- Sister store: Audi Baton Rouge (NEVER build comps against Audi)

### Audi Baton Rouge
- Location: Baton Rouge, LA | DMS: CDK | CRM: VinSolutions | GBP: Managed by Lance
- GA4 Property: 381984706, Account: 82333601
- Sister store: Brian Harris BMW (NEVER build comps against BMW)

### Harris Porsche
- Location: Baton Rouge, LA | DMS: CDK | CRM: VinSolutions | GBP: Managed by Lance
- GA4: OEM-controlled (awaiting Cody approval, harrisporsche738@gmail.com)

### BMW of Jackson
- Location: Jackson, MS | DMS: Reynolds | CRM: Reynolds | GBP: Managed by Lance
- GA4 Property: 255835161, Account: 118997487
- Part of Herrin-Gear group (also has Chevy, Lexus, INFINITI, Toyota)
- Sister stores: Lexus Jackson, Infiniti (NEVER build comps against Lexus or Infiniti)
- Win: Cut SEM from $16K to $8K/mo, sales up 30% YoY

### SEO Comp Page Matrix
| Comp | BHBMW | BMW Jackson |
|------|-------|-------------|
| vs Mercedes | YES | YES |
| vs Lexus | YES | NO |
| vs Audi | NO | YES |
| vs Infiniti | N/A | NO |

## People
- Christy Faucheux — Lance's wife, christyfaucheux@gmail.com
- Maximus — Lance's son, texts jokes/silly stuff, respond playfully
- Pop Faucheux (father) — 225-445-4274
- Alex (brother) — 225-772-2038
- Ashlyn (associate) — 765-918-1215
- David Villa — +1 (225) 439-8920
- Edwin (Pine Belt Auto Group President) — WARM PROSPECT
- Josh Gwin (Autotrader) — +12259541627, introduced April 9, 2026

## SOPs
- Always respond to GBP reviews within 24 hours
- Never use stock images — all content is custom
- Co-op submissions must match manufacturer guidelines exactly
- Professional but approachable tone for client comms
- Email signature: "Thank you. Lance" + address + contact info + logo

## Active Projects

### GA4 Dashboards (LIVE)
- BMW Jackson: https://thecooperativeagency.github.io/Ga4-dashboards/bmw-jackson-dashboard.html
- Brian Harris BMW: https://thecooperativeagency.github.io/Ga4-dashboards/brian-harris-bmw-dashboard.html
- Audi Baton Rouge: https://thecooperativeagency.github.io/Ga4-dashboards/audi-baton-rouge-dashboard.html
- Update script: ~/.openclaw/workspace/ga4-dashboards/update-dashboards.sh
- Weekly auto-update cron: Monday 6AM CDT
- Next: Harris Porsche dashboard (pending GA4 access), VinSolutions lead integration

### PostEngine — Social Media Pipeline (LIVE)
- Local: http://localhost:3456 | Tailscale: http://100.83.146.27:3456
- GitHub: https://github.com/thecooperativeagency/postengine
- Location: ~/.openclaw/workspace/postengine/social-post-manager
- Start: cd .../social-post-manager && bash start.sh
- 4 dealerships loaded, Zernio API connected (IG + FB + GMB)
- Drive scanner + auto-archive + Claude caption writer + Telegram approval flow
- Weekly scan cron: Sunday 2 AM CDT
- File naming: 2026-BMW-M3-Competition-Alpine-White.jpg

### Mission Control Dashboard
- Vercel: https://mission-control-kvhd0duxe-thecooperativeagencys-projects.vercel.app/tasks
- Tailscale: http://100.102.212.22:3000 | LAN: http://192.168.0.14:3000
- GitHub: https://github.com/thecooperativeagency/mission-control

### Kalshi Trading System (ACTIVE)
- Location: ~/.openclaw/workspace/kalshi-weather
- Weather: 3-model consensus (NOAA + GFS + ECMWF), 7 cities
- Arb: Polymarket vs Kalshi scanner
- Paper mode active, balance ~$40 cash
- Commands: npx ts-node src/index.ts --scan-once | --arb | --check-settle | --results

### Dealer Intel Analytics Platform (PLANNED)
- Export-based: VinSolutions + Vauto + GA4 + Google Ads -> weekly email digest to GMs
- Brief: https://drive.google.com/file/d/1ZIY-CQBwxkup_emrKd3acuB3zxG6ByZw

### Demo Vendor Brief
- Live: https://thecooperativeagency.github.io/vendor-briefs/demo-prestige-bmw.html
- Fake dealership (Prestige BMW of Nashville) for prospect pitches

## Growth Opportunities

### Herrin-Gear Automotive Group (Jackson, MS)
- BMW Jackson is current client, group has Chevy, Lexus, INFINITI, Toyota
- Strategy: BMW GM introduces to Lexus GM -> proof point -> pitch to group

### Pine Belt Auto Group (Hattiesburg, MS)
- Edwin (President) interested in vendor consolidation
- Last contact: Feb 24, 2026 — needs re-engagement

## Luc Social Handles
- X/Twitter: @lucopencraw | Instagram: @opencraw | Display: Luc Fasho

## Billing Notes
- $600+ spent on Anthropic API to date
- Current setup: Sonnet for Luc, Grok for research subs, Gemini Flash for coding subs
- Claude Max proxy is DEAD (Anthropic killed subscription billing April 4, 2026)

## Harris Porsche Van Livery
- Concept: classic heritage livery, red/cream
- Drive: https://drive.google.com/drive/folders/1J8Wr7lTVqnLnuUctk_YxONx7lMYuNDag
