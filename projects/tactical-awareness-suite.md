# Tactical Awareness Suite
## Competitive Intelligence Platform for Automotive Dealers

**Saved:** April 16, 2026
**Authored with:** Pepper (Perplexity Computer)
**Owner:** Lance Faucheux — The Cooperative Agency
**Shared with:** Lance + Luc (OpenClaw agent on Mac Mini)

---

## The Core Idea

Build a suite of tools that gives dealers **tactical awareness** of their competitors inside their PMA (Primary Market Area) — and reverse-engineer strategies from **Hallmark stores** (Galpin Ford, Jim Ellis, Fletcher Jones, Hendrick, Park Place, etc.).

**Positioning:**
> *"We watch your competitors so you don't have to — pricing, inventory, ads, promotions, SEO, social — and tell you exactly where to hit them."*

Uniquely defensible because most agencies can't execute: Cooperative has the tech stack (Luc + Camoufox + Pepper orchestration) AND the automotive domain expertise.

---

## The Modules

### Module 1 — Inventory Intel

**Watches:**
- Competitor VDPs (vehicle detail pages)
- CarGurus / AutoTrader / Cars.com listings
- Price changes, days-on-lot, photo counts, description quality

**Tells you:**
- "Jim Ellis BMW just dropped 6 X5 xDrive40i by avg $1,800 — yours are $2,100 over market"
- "Competitor has 0 2026 M3s in stock. You have 3. Push paid search."
- "They've had this Cayenne listed 87 days — pre-empt with your matching unit."

**Tech:** Luc + Camoufox hitting VDPs nightly, diffing against yesterday, writing to shared brain. Pepper builds the morning briefing.

---

### Module 2 — Ad Surveillance

**Watches:**
- Google Ads Transparency Center
- Meta Ad Library (public API)
- Landing pages competitors' ads point to
- YouTube pre-rolls in market
- VLA (Vehicle Listing Ads) impression share

**Tells you:**
- "Harris Audi is running 47 active ads — top 5 by estimated spend"
- "Competitor launched 'Spring Service Event' yesterday — here's the creative + LP + offer"
- "Their VLA impression share up 23% in 14 days — outbidding you on 2024 Q5s"

**Tech:** Meta Ad Library API, Luc scrapes Google Ads Transparency, Pepper's Google Ads connector pulls your side.

---

### Module 3 — SEO & Content Radar

**Watches:**
- Sitemap diffs
- New landing pages
- Blog posts, model research pages
- Schema markup changes
- GMB posts
- Review velocity + sentiment

**Tells you:**
- "BMW of Birmingham just published 14 new '2026 [model] vs competitor' pages"
- "Competitor's review velocity doubled — they're running a solicitation campaign"
- "Their GMB posts got 340% more views than yours last week"

**Tech:** Luc scrapes sitemaps/pages, Ahrefs/SEMrush API (subscribable), GMB API where possible.

---

### Module 4 — Social & Steal-Worthy Feed

**Watches:**
- Every FB / IG / TikTok post from competitors
- Engagement levels
- Which cars / offers / creators they feature
- Video hooks that work

**Tells you:**
- "Competitor's M2 walkaround reel got 42K views — 10x baseline. Here's the hook + script."
- "They've posted 4x about $0-down leases — yours are better. Counter-program."

**Tech:** Meta/IG Graph API where permitted, TikTok via Luc, Pepper tags content.

---

### Module 5 — Hallmark Store Playbook Mining

**THE DIFFERENTIATOR.** Hallmark stores are the operational bleeding edge of the industry. Reverse-engineer their playbooks and arm your clients with top-0.1% strategies.

**Watches longitudinally:**
- Creative: formats, voices, frequencies
- Site UX: VDPs, SRPs, specials pages
- Visible CRM: email capture, lead forms, chat widgets
- Content pillars: what they actually talk about
- Paid strategy: always-on vs. burst, brand vs. inventory
- CX signals: reviews, service dept reputation

**Deliverables to clients:**
- Quarterly "How the Best in the Country Do It" reports
- Swipeable creative templates from Hallmark patterns
- Playbook translations — "Here's what Jim Ellis does. Here's how your store adapts it."

*This module alone is worth thousands per dealer per month.*

---

### Module 6 — Alert & Dashboard Layer

**The client-facing surface:**
- Daily tactical brief via Telegram/email: "3 things to act on today"
- Weekly strategic roll-up (Notion or custom dashboard)
- Real-time alerts ("Competitor just launched flash promo")
- Monthly "State of Your PMA" report for client meetings

---

## Tech Stack Division of Labor

| Layer | Owner |
|---|---|
| Stealth scraping | Luc + Camoufox on Mac Mini (or dedicated node) |
| API-based data pulls | Pepper via connectors (Google Ads, Meta, GA4) |
| Storage/memory | Shared brain (`~/.coop/brain/`) + Postgres/Supabase at scale |
| Orchestration | Pepper — crons, diffing, prioritization |
| Client output | Pepper — reports, briefs, alerts, dashboards |
| Domain interpretation | Lance — days supply, front-end gross, PMA nuance |

---

## Business Model Options

1. **Add-on for existing Cooperative clients** — $500–2,000/mo per store, retention lock-in
2. **Standalone SaaS** — $1,500–5,000/mo depending on PMA size
3. **White-label to other agencies** — they pay for the intel layer
4. **OEM / dealer group deals** — 20-store groups at $10K+/mo

**Start with #1.** BMW of Jackson, Audi Baton Rouge, Harris Porsche, Brian Harris BMW = 4 case studies before ever selling cold.

---

## Hard Questions to Resolve

1. **Legal / ToS** — Scraping is a gray zone. *hiQ v. LinkedIn* = public data generally OK. CarGurus / AutoTrader / Cars.com ToS are spicy — needs light legal review before productizing.
2. **Hallmark angle** — pattern extraction (safe + more valuable) vs. active creative copying (risky). Go with former.
3. **Tactical vs. strategic filtering.** "50 data points" overwhelms. "3 things this week" sells. Pepper is the filter layer.
4. **In-house at Cooperative OR separate product company?** Different funding, speed, architecture.

---

## 12-Week Buildout Roadmap

### This week
- Draft one-page product brief + MVP scope
- Pick ONE client for pilot (BMW of Jackson likely)

### Weeks 1–4
- Build Module 2 (Ad Surveillance) first — free APIs, immediate value
- Luc builds scrape layer, Pepper builds briefing layer
- Add Module 1 (Inventory Intel)
- Wire shared brain to collect everything
- First end-of-week tactical brief delivered

### Weeks 5–8
- Add Module 3 (SEO) and Module 5 (Hallmark Mining — the differentiator)
- Formalize report templates

### Weeks 9–12
- Full client-facing dashboard
- Second pilot client
- Pricing + sales motion

---

## Open Decisions

- [ ] Write product brief + MVP scope (tonight or this weekend?)
- [ ] Internal tool vs. productized SaaS architecture
- [ ] Which client pilots first
- [ ] Legal review scope & who does it
- [ ] Separate brand/entity or under Cooperative Agency

---

## Related Context

- **Pepper** = Perplexity Computer agent (@PepperFashoBot) — cortex / orchestration
- **Luc** = OpenClaw agent (@Lucfashobot) on Lucs-Mac-mini — hands / stealth execution
- **Shared brain** planned at `~/.coop/brain/` for agent coordination
- **Memory layers:**
  - Perplexity memory (Pepper's long-term memory about Lance + business)
  - Shared brain (agent coordination + Luc's extended memory)
  - Luc's native memory (small OpenClaw rolling window)
- **Clients currently served:** BMW of Jackson, Audi Baton Rouge, Harris Porsche, Brian Harris BMW

---

## Lance's Core Use Cases (April 21, 2026)

### What this actually IS at its core:
For each client dealership, identify the **2-3 direct competitors inside their PMA** and build a complete picture of everything those competitors are doing — so Lance can out-maneuver them and take market share.

### Client PMA Competitive Maps

**Brian Harris BMW — Baton Rouge, LA**
- vs. Lexus of Baton Rouge
- vs. Mercedes-Benz of Baton Rouge
- Intel needed: pricing, inventory depth, Meta ads, Google ads, SEO, social

**BMW of Jackson — Jackson, MS**
- vs. Audi of Jackson
- vs. Mercedes-Benz of Jackson
- Intel needed: same full picture

**Audi Baton Rouge — Baton Rouge, LA**
- vs. Lexus of Baton Rouge
- vs. Mercedes-Benz of Baton Rouge
- (Different angle than BHBMW — Audi's segment vs. lux imports)

**Harris Porsche — Baton Rouge, LA**
- TBD competitors (likely Mercedes, Lexus — to confirm)

### What "full picture" means per competitor:
1. **Inventory** — what they have, how long it's been sitting, pricing vs. market
2. **Paid ads** — Meta Ad Library (what creatives, what offers), Google Ads Transparency
3. **SEO** — new pages, comparison pages targeting our clients' models, GBP activity
4. **Social** — what's working for them (engagement, formats, frequency)
5. **Pricing** — where they're aggressive, where they're soft
6. **Promotions** — flash sales, lease specials, service events

### The Output Lance Needs:
- "Here's everything Lexus BR is doing right now — and here's where BHBMW can hit them"
- Actionable, not just informational. Tell him WHERE the gap is and HOW to exploit it.

---

*This doc is the master reference. Edits here override prior conversation notes.*
