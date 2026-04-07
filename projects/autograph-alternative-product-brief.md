# Product Brief: Dealership Analytics Platform
**The Cooperative Agency - Data Intelligence Tool**

---

## Executive Summary

Build an in-house unified data analytics platform to serve The Cooperative's 4 dealership clients (and scale to 10+ stores). Inspired by Autograph Analytics but built as a proprietary competitive advantage.

**Why now:** Lance identified critical pain points during the Autograph call — fragmented data sources, delayed reporting (mid-month is fastest), GMs asking "what did you do?" without clear visibility. The market is ripe for an agency-built solution that agencies themselves control.

**Market Opportunity:** Automotive dealership groups lack transparent, real-time data aggregation. $289-$549/mo per rooftop is the going rate (Autograph). At 4 stores → $1,200-2,196/mo baseline revenue. At 10 stores → $2,900-5,500/mo.

**Competitive Edge:** Owned by the marketing agency managing the stores → zero data silos, real-time optimization, and direct integration into deal decision-making. GMs see Lance as the guy who fixes things; this tool proves it.

---

## Problem Statement

**Lance's Current State:**
- Data arrives in **separate silos**: web metrics (web dev), SEM reports (J&L partner), email/SMS (AMP via VinSolutions), GBP reviews, phone transcripts, inventory
- **Mid-month is fastest** to know if things are breaking
- GMs don't trust summaries — they want proof ("What did you do to turn leads off?")
- Spends **1-2 hours/week** in calls reviewing fragmented reports with 3-4 different partners
- As he scales (Jackson store + new groups), **managing 10 rooftops' worth of data becomes impossible**

**Autograph's Answer:**
- Single dashboard pulling DMS, CRM, marketing, GBP, inventory
- AI analyst ("Ada") answers questions in plain language
- Email digests to GMs (customizable)
- $289-$549/mo per rooftop (+ integration fees)

**Why Build vs. Buy:**
1. **Control** — Autograph is Canada-based, API integrations may lag or break
2. **Pricing** — At 10 stores, you're paying $2,890-5,490/mo for a tool you could build cheaper
3. **Ownership** — This becomes a product to sell to other agencies managing dealer groups
4. **Speed** — You iterate within a week using AI + Claude; Autograph takes sprints

---

## Solution Overview

**Platform Name (draft):** Dealer Intel / Coop Analytics / Red Compass (your choice)

**Three Core Layers:**
1. **Data Pipeline** — Ingest from DMS, CRM, ad platforms, GBP, inventory
2. **Dashboard Layer** — Executive view of KPIs, drill-down by dealership
3. **AI Assistant** — Natural language queries powered by Claude API

**Target Users:**
- Lance (decision maker, optimization)
- GMs (weekly digest via email, understand their performance)
- Desk managers (daily lead summary — who worked what, conversion status)

---

## MVP Feature Scope (Phase 1 - 3 months)

### 1. Data Integrations
**Must-have for MVP:**
- **CDK (DMS)** — vehicle inventory, sales data (RESTful API available)
- **VinSolutions (CRM/AMP)** — leads, campaigns, text/email sends
- **Google Ads API** — spend, impressions, clicks by campaign
- **Google Analytics 4** — traffic, conversions, bounce rate by source
- **Google Business Profile API** — review sentiment, response rates

**Nice-to-have (Phase 2):**
- **Meta Ads API** — Facebook/Instagram spend
- **CallRail / CallReview API** — inbound call transcripts + AI summaries
- **Reynolds CRM** — manual export workflow (Jackson store constraint)

### 2. Dashboard Layer
**Build on:** Looker Studio (free, integrates with GCP) OR Metabase (open-source, PostgreSQL backend)

**Dashboards to launch with:**
1. **GM Executive Overview** — 4 KPI cards
   - YTD sales count
   - Leads generated (this month vs. last month)
   - Cost per lead (by channel)
   - Gross profit to ad spend ratio
2. **Marketing Performance** — drill-down by dealership
   - Web traffic (source attribution)
   - Lead gen by channel (SEM, organics, paid social, GBP, referral)
   - CPL by campaign
   - Campaigns trending down (anomaly detection)
3. **Inventory Health**
   - Aging distribution (30/60/90+ days)
   - VDP views per vehicle vs. peer average
   - Price changes, days on market
4. **Daily Digest (email template)**
   - Previous day: leads, sales, spend summary
   - Alerts: CPL up 20%? Traffic down 15%? Flag it.

### 3. AI Assistant ("Compass" / "Scout")
**Powered by:** Claude API (gpt-4o or Haiku for cost)

**Example queries it should handle:**
- "How much did I spend on SEM last month vs. this month?"
- "Which campaign has the worst CPL right now?"
- "What vehicles are over 60 days and not getting enough traffic?"
- "Which dealership is underperforming on leads this week?"

**Implementation:**
- Context: Feed the AI data dictionary (what fields mean what)
- Prompt template: "You are an automotive data analyst for a dealer group. Answer this business question based on the data."
- Response: Clean, conversational summary with follow-up actions

---

## Go-to-Market Strategy

### Phase 1: Internal Validation (Month 1-2)
- Deploy for **Brian Harris BMW Group** (CDK + VinSolutions)
- Get feedback from Lance + the GM (he's "super into AI" — this guy will use it daily)
- Iterate on dashboard layout, report frequency

### Phase 2: Expand to Existing Clients (Month 2-3)
- **Audi Baton Rouge** — same CDK/AMP setup
- **Lexus** — confirm their tech stack, adapt integrations
- Gather case studies: "Audi Baton Rouge cut CPL by 12% in Q2 after identifying underperforming campaigns"

### Phase 3: New Revenue Stream (Month 4+)
- Pitch Autograph-killer as an add-on service
- "Your agency fee now includes weekly performance reporting + real-time alerts. No more waiting for J&L's mid-month email."
- Sell at **$399-499/mo per rooftop** (undercut Autograph, keep margin)
- Positioning: "The only reporting tool built by a dealership agency, for agencies."

---

## Pricing Model Options

**Option A: Per-Rooftop SaaS** (Autograph-style)
- $399/mo for marketing + web data
- $549/mo + DMS/CRM integration
- +$50-100/mo per additional integration (CallRail, Meta, etc.)

**Option B: Bundled into Agency Fee**
- Include Dealer Intel as part of The Cooperative's management package
- Free to current 4 clients, position as competitive advantage
- Sell to new prospect groups as part of the pitch

**Option C: Hybrid**
- Free for Lance's 4 stores (competitive moat)
- Sell to other agencies/dealer groups at $499/mo

**Recommendation:** Start with Option B (bundled), then launch Option C as a side product once it's proven.

---

## MVP Timeline & Budget

**Phase 1: Data Pipeline + Basic Dashboards (2 months)**
| Task | Effort | Cost |
|------|--------|------|
| Data engineer (CDK, VinSolutions, GA4, GBP APIs) | 2-3 weeks | $8K-12K |
| Backend (Python + PostgreSQL data warehouse) | 3 weeks | $12K-15K |
| Dashboard templates (Looker Studio or Metabase) | 1 week | $3K-5K |
| Testing + iteration | 1 week | $2K-3K |
| **Subtotal** | **7 weeks** | **$25K-35K** |

**Phase 2: AI Assistant (1 month)**
| Task | Effort | Cost |
|------|--------|------|
| Claude API integration + prompt tuning | 1 week | $3K-5K |
| QA + edge case handling | 1 week | $2K-3K |
| **Subtotal** | **2 weeks** | **$5K-8K** |

**Phase 3: Email Automation + Alerts (1 month)**
| Task | Effort | Cost |
|------|--------|------|
| Email template builder + scheduler | 1 week | $3K-5K |
| Threshold-based alerting (CPL up, traffic down, etc.) | 1 week | $2K-3K |
| **Subtotal** | **2 weeks** | **$5K-8K** |

**Total MVP Cost: $35K-51K**
**Ongoing (monthly):**
- Cloud infrastructure (PostgreSQL, API quotas): $500-1K/mo
- Claude API usage ($0.03/1K input tokens, ~$2-5/mo per rooftop)
- Developer maintenance (10 hrs/month): $800-1K/mo

**Breakeven:** At $499/mo per rooftop, breakeven at 7 stores (~$3,500/mo revenue covers cloud + dev).

---

## Technical Architecture

```
┌─────────────────────────────┐
│  Data Sources               │
├─────────────────────────────┤
│ CDK (DMS)                   │
│ VinSolutions (CRM/AMP)      │
│ Google Ads API              │
│ GA4                         │
│ GBP API                     │
│ CallRail (phase 2)          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  ETL Layer (Python)         │
│  - API connectors           │
│  - Data cleansing           │
│  - Normalization            │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Data Warehouse (PostgreSQL)│
│  - Normalized schemas       │
│  - Historical snapshots     │
│  - Aggregated metrics       │
└──────────┬──────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
   ┌──────────────────┐   ┌──────────────────┐
   │  Dashboard Layer │   │  Claude API      │
   │  (Looker Studio/ │   │  (AI Assistant)  │
   │   Metabase)      │   │                  │
   └──────────────────┘   └──────────────────┘
      │                      │
      └──────────┬───────────┘
                 ▼
         ┌──────────────────┐
         │  Frontend        │
         │  - Web UI        │
         │  - Email digests │
         │  - Alerts        │
         └──────────────────┘
```

---

## Competitive Advantage vs. Autograph

| Feature | Autograph | Dealer Intel (Ours) |
|---------|-----------|---------------------|
| **Built by** | Data analytics firm | Dealership agency (Lance) |
| **Integration speed** | 2-4 weeks (they handle it) | 1-2 weeks (Lance controls it) |
| **Cost** | $289-$549/mo per rooftop | $399-$499/mo (or bundled) |
| **Customization** | Limited (their roadmap) | Fast iteration (your roadmap) |
| **Ownership** | SaaS dependency | Own the data, own the tool |
| **AI assistant** | Ada (limited context) | Claude (context-aware, smarter) |
| **Alerts** | Planned feature | MVP feature |
| **Deal-specific insights** | Generic reports | Tailored to Lance's strategy |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **API changes** | DMS/CRM breaks integration | Versioning, automated tests, 48h notification protocol |
| **Data quality** | Bad data → bad insights | Data validation layer, flagging/alerts, manual audit |
| **Developer dependency** | Can't scale without hiring | Well-documented codebase, modular design, hire Jr. dev by month 6 |
| **Reynolds CRM wall** | Jackson store stuck on manual | Export workflow is "good enough" for now; pressure Reynolds for API access |
| **Feature creep** | Scope expands, delays ship date | MVP locked to 3 core dashboards + AI assistant; features after launch |

---

## Next Steps (This Week)

1. **Validate with GMs** — Show 2-3 GMs a rough mockup of the dashboard. Do they care? Will they use it?
2. **Map integrations** — Confirm CDK, VinSolutions, GA4, GBP API access for all 4 stores
3. **Get quotes** — Approach 2-3 dev shops (or contractors) for Phase 1 cost estimate
4. **Pick stack** — Commit to tech choices (Looker Studio vs. Metabase, Python vs. Node, PostgreSQL vs. BigQuery)
5. **Naming** — Workshop product name + positioning (internal tool vs. future product line?)

---

## Success Metrics

- **Month 1:** Launch for Brian Harris BMW, 70%+ dashboard adoption (opens 3x/week)
- **Month 2:** Expand to Audi + Lexus, zero broken integrations
- **Month 3:** GM feedback scores 4.5+/5, Lance saves 3+ hours/week on reporting
- **Month 6:** Revenue from other agencies (if selling externally): $1K/mo
- **Year 1:** 10+ rooftops, $50K ARR, can justify hiring dedicated dev

---

**Approved for:** Lance Faucheux, The Cooperative Agency
**Status:** Ready for team review + GM validation
**Next review:** 1 week (post-validation interviews)
