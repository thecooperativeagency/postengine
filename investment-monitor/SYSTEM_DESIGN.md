# Investment Monitoring System - System Design

## Overview
Real-time intelligence hub tracking high-conviction public investors (Chris Camillo + 4 others) across multiple social platforms, SEC filings, and news sources. Aggregates signals, generates alerts, and surfaces actionable intelligence through a unified dashboard.

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│         Frontend: React Web Dashboard (Vite)             │
│  - Real-time alerts, investor tracking, signal timeline  │
│  - Price correlation charts, portfolio monitoring         │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│      API Gateway & Backend (Node.js/Express)             │
│  - WebSocket for real-time alerts                        │
│  - REST endpoints for dashboard data                     │
└──────────────────────┬──────────────────────────────────┘
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
┌────▼──────┐  ┌──────▼──────┐  ┌───────▼────┐
│  Ingestion │  │  Processing  │  │  Storage   │
│  Pipeline  │  │  & Analysis  │  │  (DB)      │
└────┬──────┘  └──────┬──────┘  └───────┬────┘
     │                │                 │
     └────────────────┼─────────────────┘
                      │
     ┌────────────────┴────────────────┐
     │                                 │
┌────▼─────────────────┐  ┌──────────▼────────┐
│  Data Sources:       │  │ Alert Engine      │
│ - TikTok API         │  │ - Rules-based     │
│ - Instagram API      │  │ - ML anomalies    │
│ - X/Twitter API      │  │ - Push notifs     │
│ - YouTube API        │  │                   │
│ - SEC EDGAR API      │  └───────────────────┘
│ - NewsAPI            │
│ - StockTwits API     │
└──────────────────────┘
```

---

## Data Sources & Integration Points

| Source | API | Key Data | Polling | Priority |
|--------|-----|----------|---------|----------|
| **TikTok** | TikTok API v1 | Videos, captions, mentions | 1h | High |
| **Instagram** | Instagram Graph API | Posts, captions, hashtags | 1h | High |
| **X (Twitter)** | X API v2 | Tweets, threads, engagement | 15m | Critical |
| **YouTube** | YouTube Data API v3 | Videos, titles, descriptions | 2h | Medium |
| **SEC** | EDGAR REST API | 13F, 4, 8-K filings | Daily | High |
| **NewsAPI** | NewsAPI.org | Articles mentioning investors | 30m | Medium |
| **StockTwits** | Public endpoints | Sentiment, mentions | 30m | Medium |
| **Alpha Vantage** | Stock API | Price data, technical | 5m | High |

---

## Tracked Investors (Default)

### 1. **Chris Camillo** (Primary)
- **Strategy:** Social arbitrage, consumer trend spotting
- **Platforms:** TikTok, Instagram, X
- **Focus:** Micro-cap, momentum, sentiment plays
- **Track:** Mentions, portfolio moves, content themes

### 2-5. Suggested Additional Investors
- **Keith Gill (Roaring Kitty)** - GME, retail sentiment, X
- **Cathie Wood (ARK Invest)** - Disruptive tech, 13F filings
- **Paul Ryan (hedge fund)** - Value plays, SEC filings
- **Mark Minervini** - Technical analysis, trend trading

---

## Data Processing Pipeline

### 1. Ingestion Layer
```javascript
// Fetch from each source concurrently
- getXTweets(username, since=24h)
- getTikTokVideos(handle)
- getInstagramPosts(handle)
- getYouTubeVideos(channelId)
- getSEC13F(cikNumber)
- getNewsArticles(keywords)
```

### 2. Parsing & Extraction
- Extract ticker mentions (regex: $AAPL, AAPL)
- Extract sentiment (positive/negative/neutral)
- Extract themes (growth, value, momentum, dividend)
- Extract price targets (if mentioned)
- Extract timestamps and engagement metrics

### 3. Enrichment
- Cross-reference tickers with stock data
- Calculate price change correlation
- Map SEC 13F holdings to mentions
- Link related content across platforms
- Flag first mentions vs repeated themes

### 4. Alerting
- **Threshold-based:** Ticker mention frequency spike
- **Pattern-based:** New position signaling, exit signaling
- **Sentiment-based:** Bullish/bearish shifts
- **News-based:** External catalysts aligning with mentions
- **Technical-based:** Price action correlation with content

---

## Database Schema

### Core Tables

#### `investors`
```sql
id, name, handle_x, handle_tiktok, handle_instagram, 
channel_youtube, cik_sec, status, created_at
```

#### `posts`
```sql
id, investor_id, source (x/tiktok/instagram/youtube), 
source_id, content, posted_at, fetched_at,
engagement_likes, engagement_comments, engagement_shares
```

#### `mentions`
```sql
id, post_id, ticker, context, sentiment, 
extraction_confidence, mentioned_at
```

#### `prices`
```sql
id, ticker, date, open, high, low, close, volume
```

#### `alerts`
```sql
id, investor_id, ticker, alert_type (mention_spike/new_position/sentiment_shift), 
severity (critical/high/medium/low), message, created_at, acknowledged_at
```

#### `thirteen_f`
```sql
id, investor_id, filing_date, ticker, shares_count, 
shares_value, position_change_pct
```

---

## Alert Logic

### Alert Types

1. **New Mention Alert**
   - Investor mentions ticker for first time in 90 days
   - Severity: MEDIUM

2. **Mention Spike Alert**
   - Same ticker mentioned >2x in 24h
   - Severity: HIGH

3. **Sentiment Reversal Alert**
   - Bullish → Bearish shift on same ticker
   - Severity: HIGH

4. **Portfolio Move Alert**
   - SEC 13F shows significant position change (±10%)
   - Severity: CRITICAL

5. **Price Correlation Alert**
   - Stock price +5% within 48h of positive mention
   - Severity: MEDIUM

6. **Multi-Platform Alignment Alert**
   - Same ticker mentioned across 3+ platforms in 48h
   - Severity: HIGH

---

## Real-time Features

### WebSocket Events
```javascript
// Server → Client
- new_alert: { investor, ticker, type, severity }
- price_update: { ticker, price, change_pct }
- post_published: { investor, platform, content }
- sentiment_shift: { ticker, old_sentiment, new_sentiment }
```

### Live Dashboard Features
- Investor activity feed (latest posts across platforms)
- Ticker heatmap (mentions, sentiment, price correlation)
- Alert queue (real-time, chronological)
- Portfolio tracking (linked 13F positions)
- Technical charts (price vs mention timeline)

---

## Tech Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Build:** Vite
- **UI:** TailwindCSS + shadcn/ui
- **Charts:** Recharts or Plotly
- **Real-time:** Socket.io client
- **State:** Zustand or TanStack Query
- **Notifications:** Browser Push API + custom toast

### Backend
- **Runtime:** Node.js (v18+)
- **Framework:** Express.js
- **Database:** PostgreSQL (Supabase or self-hosted)
- **Real-time:** Socket.io
- **Task Queue:** Bull (Redis-backed job processing)
- **Caching:** Redis
- **Auth:** JWT + refresh tokens

### Deployment
- **Backend:** Docker → Render, Railway, or Fly.io
- **Frontend:** Vercel or Netlify
- **Database:** Supabase or AWS RDS
- **Cache:** Redis Cloud or Upstash
- **Queue:** Bull in same Node process or separate Redis instance

---

## API Rate Limits & Costs

| Source | Free Tier | Cost/month | Limits |
|--------|-----------|------------|--------|
| X API v2 | No (Academic only) | $100 | 300 requests/15min |
| TikTok | Limited | TBD | 50 requests/hour |
| Instagram Graph | Free | - | 200 calls/user/hour |
| YouTube API | 10k quota/day | Free | 10k quota/24h |
| SEC EDGAR | Free | - | No strict limit |
| NewsAPI | 100/day | $45 | 100 requests/day |
| Alpha Vantage | Free | - | 5 requests/min |

**Recommendation:** Start free tier, add paid as system grows.

---

## Phases

### Phase 1: MVP (Week 1)
- [ ] Basic dashboard (React)
- [ ] X API integration + tweet scraping
- [ ] SEC 13F filing parser
- [ ] Simple mention alerts
- [ ] PostgreSQL database
- [ ] Deploy backend (Render)

### Phase 2: Multi-Platform (Week 2)
- [ ] TikTok integration
- [ ] Instagram Graph API
- [ ] Real-time WebSocket
- [ ] Sentiment analysis
- [ ] Price correlation

### Phase 3: Intelligence (Week 3)
- [ ] Alert rules engine
- [ ] Portfolio tracking
- [ ] Technical analysis overlay
- [ ] News correlation
- [ ] Email/push notifications

### Phase 4: Polish & Deploy (Week 4)
- [ ] Frontend polish
- [ ] Mobile responsive
- [ ] Performance optimization
- [ ] Monitoring & logging
- [ ] Production deployment

---

## Security Considerations

- ✅ API keys in `.env` (never commit)
- ✅ Rate limiting on backend endpoints
- ✅ JWT authentication
- ✅ CORS configuration
- ✅ Input validation & sanitization
- ✅ Database encryption at rest
- ✅ HTTPS only
- ✅ WebSocket authentication

---

## Next Steps

1. Confirm investor list (5 total)
2. Prioritize platforms (X + TikTok + SEC first)
3. Set up PostgreSQL database
4. Create API keys for each source
5. Begin backend scaffolding
