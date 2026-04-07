# Dealer Intel — Simplified Version
**Export-Based Data Aggregation & Reporting Platform**

---

## Core Concept

No APIs. No integrations. No BS.

**Weekly workflow:**
1. Export CSVs from GA4, Google Ads, GBP, DMS, CRM, AMP, CallRail
2. Drop them in a shared folder
3. System normalizes + merges them
4. Dashboard refreshes
5. Email digest goes to GMs every Monday morning

Done.

---

## Data Sources & Export Schedule

| Platform | Data | Export Format | Frequency |
|----------|------|---------------|-----------|
| **GA4** | Traffic by source, conversions, bounceRate | CSV (standard report export) | Weekly |
| **Google Ads** | Spend, clicks, impressions by campaign | CSV (standard export) | Weekly |
| **GBP** | Reviews, ratings, question responses | CSV (via API or manual export) | Weekly |
| **CDK/DMS** | Vehicle inventory, sales data, aging | CSV export from admin panel | Weekly |
| **VinSolutions/AMP** | Leads, email/text sends, conversions | CSV export from dashboard | Weekly |
| **CallRail** | Call volume, transcripts, AI summary | CSV export from admin | Weekly |

**Upload location:** Google Drive shared folder (Cooperative Agency > Data > Weekly Exports)

---

## Processing Pipeline

**What happens automatically (Python script, runs every Sunday night):**

```
1. Read all CSVs from upload folder
2. Normalize columns:
   - Standardize date formats (YYYY-MM-DD)
   - Standardize dealership IDs
   - Map platform names to your internal names
3. Merge datasets on dealership + date
4. Calculate KPIs:
   - Cost per lead = ad spend / leads
   - ROAS = revenue / ad spend
   - Conversion rate = sales / leads
   - Lead volume by source
   - Cost per sale = ad spend / sales
5. Write clean dataset to PostgreSQL or Google Sheets
6. Trigger email report generation
7. Send HTML email to GMs every Monday 8 AM
```

**No manual work.** Just drop the exports in the folder on Friday. Script runs Sunday. Reports land Monday morning.

---

## Dashboards (Phase 1)

**Primary dashboard (Lance's view):**
- All 4 dealerships on one page
- KPI cards: Total leads, total spend, avg CPL, total sales, ROAS
- Trend lines: Leads by week, spend by week, CPL trending
- Breakdown by dealership (sortable table)

**Secondary dashboard (GM view):**
- Single dealership only
- Previous week summary: leads, sales, spend
- Breakdown by channel (SEM, organic, paid social, GBP, referral)
- Comparison: this week vs. last week vs. 4-week average
- Alerts: CPL up more than 15%? Red highlight.

**Inventory dashboard (optional, Phase 2):**
- Aging distribution (30/60/90+ days)
- VDP views per vehicle
- Days on market by model

---

## Weekly Email Digest (What GMs Get)

**Subject:** "[BMW Jackson] Weekly Performance — Week of Mar 31"

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
       WEEK OF MARCH 31, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 KEY METRICS
├─ Leads Generated: 42 (↓8% vs last week)
├─ Website Traffic: 1,240 sessions (↑3%)
├─ Cost Per Lead: $127 (↑12% — watch this)
├─ Sales (Sales Desk): 8 vehicles
└─ Gross Profit to Ad Spend: 3.2x

💰 SPEND BREAKDOWN
├─ Google SEM: $3,240
├─ Google Organic: $0 (unpaid)
├─ Paid Social (Meta): $1,800
├─ GBP: $0 (managed, no paid)
└─ Total: $5,040

🎯 LEADS BY SOURCE
├─ SEM: 24 leads ($135 CPL)
├─ Organic Search: 8 leads ($0 CPL)
├─ Paid Social: 6 leads ($300 CPL) ← expensive
├─ GBP: 3 leads ($0 CPL)
├─ Referral: 1 lead
└─ Other: 0

⚠️  WHAT STANDS OUT
✓ Traffic is up — good momentum on organic
✓ Sales are solid — 8 units this week is healthy
✗ Paid social CPL is spiking ($300) — recommend pausing low-performing campaigns
✗ Leads are down 8% week-over-week — might be seasonal noise

📞 NEXT STEPS (For Lance & Your Team)
- Audit Meta campaigns for low-converting audiences
- Check if inventory dip caused lead quality issues
- Plan Q2 budget reallocation (SEM is outperforming)

Questions? Slack me. — Lance
```

---

## AI Assistant (Optional, Phase 2)

Instead of dashboard clicks, GMs can ask:
- "Why are my leads down this week?"
- "Which campaign is costing me the most per lead?"
- "Show me inventory that's aging over 60 days and not getting traffic"

Claude API processes the cleaned data + email digest context, returns natural language answers.

Cost: ~$50/mo in API tokens for all 4 dealerships.

---

## Tech Stack

| Component | Choice | Cost |
|-----------|--------|------|
| **Data processing** | Python (pandas, scheduling via cron or GitHub Actions) | Free (your Mac Mini) |
| **Database** | Google Sheets (simple) or PostgreSQL (scalable) | Free (Sheets) / $20/mo (Postgres) |
| **Dashboards** | Looker Studio (Google) | Free |
| **Email delivery** | Gmail API or SendGrid | Free (Gmail) / $20/mo (SendGrid) |
| **AI queries** | Claude API (optional, Phase 2) | $50/mo (at scale) |
| **Hosting** | Your Mac Mini or lightweight VPS | $0 (Mac) / $5-10/mo (VPS) |

---

## Build Timeline

**Phase 1: Core System (3-4 weeks)**
- Week 1: Data engineer maps exports, builds normalization logic
- Week 2: Dashboard templates in Looker Studio
- Week 3: Email template + scheduling
- Week 4: Testing, iterate based on feedback

**Phase 2: AI Assistant (2 weeks, post-launch)**
- Claude API integration
- Natural language query handlers
- Testing

---

## Budget (Realistic)

| Item | Cost |
|------|------|
| Data engineer (part-time, 3-4 weeks) | $5K-8K |
| Dashboard design + customization | $1K-2K |
| Email setup + scheduling | Included in eng. |
| Claude API integration (Phase 2) | $1K |
| **Total** | **$7K-11K** |

**Monthly operating cost:**
- Google Cloud / storage: $20-50
- Claude API (if Phase 2): $50-100
- **Total: $70-150/mo**

---

## Why This Works

✅ **No API dependency** — if GA4 changes their API, you're not affected
✅ **You control the data** — exports live in your Drive
✅ **Cheap to build & maintain** — half the cost of API approach
✅ **Fast to launch** — 4 weeks vs. 3 months
✅ **Easy to iterate** — modify the Python script, re-run, data refreshes
✅ **GMs get what they need** — weekly digest + dashboard, nothing fancy
✅ **Scales easily** — add a new dealership = add one more CSV export

---

## What You're NOT Getting

❌ Real-time alerts (but you don't need them)
❌ Live dashboards (weekly refresh is fine)
❌ Complex predictive models (start with descriptive analytics)
❌ Mobile app (web dashboard works)
❌ Integration with every platform (export-based is simpler)

---

## Implementation Path

**Week 1: Validation**
- Show this brief to 1-2 GMs: "Would you use a Monday morning email like this?"
- Confirm export capability for each platform (GA4, Ads, GBP, DMS, etc.)

**Week 2-5: Build**
- Hire contractor (or junior dev) to build the pipeline
- Start with one dealership (Brian Harris BMW)
- Get feedback, iterate

**Week 6: Expand**
- Add remaining 3 dealerships
- Fine-tune dashboards
- Document the weekly export process for your team

**Week 8+: Optional Phase 2**
- Add Claude AI assistant
- Package it as a feature to pitch to new clients

---

## Success Looks Like

- GMs open the email every Monday (90%+ open rate)
- Lance saves 3+ hours/week not manually compiling reports
- You spot trends faster (CPL spikes, lead drop-offs) and adjust budget mid-week
- New prospect pitch: "We give you weekly data dashboards + real insights. Nobody else does that."

---

## Pitching to GMs

*"Here's what I'm doing: Every Monday morning, you get a 2-minute email showing exactly what happened last week with your leads, spend, and sales. No logins required. If something's off, I already know about it and we're fixing it. Most agencies? You wait for monthly reports. We're doing weekly."*

That's it. Simple. Valuable. No BS.

---

## Immediate Action Items (This Week)

| Task | Owner | Due | Notes |
|------|-------|-----|-------|
| Send VinSolutions data request to Royce | Lance | Today | Email in inbox, ready to send |
| Send Vauto data request to Dwayne | Lance | Today | Email in inbox, ready to send |
| Show brief + email mockup to one GM | Lance | Thu 4/3 | Get feedback: "Would you actually use this?" |
| Confirm GA4 + Google Ads export capability | You | Fri 4/4 | Check if auto-export is possible, or manual weekly |
| Get 2-3 dev quotes for Phase 1 build | You | Fri 4/4 | Share this brief with devs, ask for cost/timeline estimate |

## Success Metrics (Post-Launch)

- **Week 1:** First email sent to test group, zero errors
- **Month 1:** Rolled out to all 3 VIN dealerships, 80%+ GM adoption
- **Month 2:** Lance saving 2-3 hours/week on reporting
- **Month 3:** CPL spike caught early, budget reallocated, results improve
- **Month 6:** Pitch to new prospect as competitive feature

---

**Status:** Waiting on data export confirmations from Royce + Dwayne
**Owner:** Lance (send data requests), Me (build pipeline once exports confirmed)
**Timeline:** Data requests → 4-week build → launch mid-April
