# Investment Monitor 📊

**Real-Time Intelligence Hub for High-Conviction Investors**

Track Chris Camillo and 4 other top public investors across TikTok, Instagram, X, YouTube, SEC filings, and news sources. Get instant alerts when they move, sell analysis in real-time.

---

## 🎯 What This Does

- **Real-time Tracking:** Monitor 5+ high-conviction investors across all platforms
- **Ticker Extraction:** Automatically pull $TICKER mentions from posts
- **Sentiment Analysis:** Bullish/bearish/neutral classification of content
- **Smart Alerts:** Notify you of mention spikes, portfolio moves, sentiment shifts
- **Trending Dashboard:** See which stocks are getting the most attention
- **SEC Integration:** Track 13F filings and portfolio changes
- **WebSocket Updates:** Live notifications as data comes in

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (React/Vite)                 │
│    Dashboard | Investor Profiles | Alerts | Settings    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP + WebSocket
┌──────────────────────▼──────────────────────────────────┐
│               Backend (Node.js/Express)                 │
│  REST API | WebSocket Server | Auth | Rate Limiting    │
└──────────────────────┬──────────────────────────────────┘
                       │ SQL Queries
┌──────────────────────▼──────────────────────────────────┐
│            PostgreSQL Database (Supabase)               │
│  Investors | Posts | Mentions | Alerts | 13F Filings  │
└──────────────────────────────────────────────────────────┘
                       │
     ┌─────────────────┼─────────────────┐
     │                 │                 │
  ┌──▼──┐  ┌────────┐ ┌──▼──┐  ┌──────▼────┐
  │  X  │  │ TikTok │ │ News│  │  YouTube  │
  │ API │  │ API    │ │ API │  │   API     │
  └─────┘  └────────┘ └─────┘  └───────────┘
```

### Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | Dashboard UI |
| **Styling** | TailwindCSS | Modern, responsive design |
| **Charts** | Recharts | Trending tickers visualization |
| **State** | Zustand | Lightweight state management |
| **Real-time** | Socket.io | WebSocket connection |
| **API Client** | Axios | HTTP requests |
| **Backend** | Express.js | REST API server |
| **Real-time** | Socket.io | WebSocket server |
| **Database** | PostgreSQL | Data persistence |
| **Auth** | JWT | Token-based auth |
| **Hosting** | Render (backend), Vercel (frontend) | Production deployment |

---

## 🚀 Quick Start

### Local Development (5 minutes)

```bash
# Backend
cd backend
npm install
cp .env.example .env
# Edit .env with database credentials
npm run db:migrate
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### Production Deployment

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for step-by-step Render + Vercel setup.

---

## 📋 Key Features

### 1. Dashboard
- Real-time stats (investors, posts, mentions, alerts)
- Trending tickers with sentiment
- Recent activity feed
- Investor spotlight

### 2. Investor Tracking
- View all tracked investors
- See recent posts from each
- Track portfolio holdings
- Compare investor activity

### 3. Alert Engine
- **Mention Spike:** Same ticker 2+ times in 24h
- **Sentiment Shift:** Bullish → Bearish on same stock
- **Portfolio Move:** 13F shows ±10% position change
- **Multi-Platform:** Same ticker across 3+ platforms
- **Price Correlation:** Stock +5% within 48h of mention

### 4. Real-Time Notifications
- WebSocket push to dashboard
- Browser notifications (optional)
- Email alerts (optional)
- Slack/Discord integration (optional)

### 5. Data Sources
- **X (Twitter):** Latest tweets from tracked handles
- **TikTok:** Video content and captions (via API or scraping)
- **Instagram:** Posts and Stories (via Graph API)
- **YouTube:** Video titles and descriptions
- **SEC EDGAR:** 13F portfolio filings
- **NewsAPI:** News articles mentioning tickers
- **StockTwits:** Sentiment and retail discussion

---

## 📊 Data Models

### Investors
```javascript
{
  id, name, handle_x, handle_tiktok, handle_instagram,
  channel_youtube, cik_sec, website_url, status
}
```

### Posts
```javascript
{
  id, investor_id, source (x/tiktok/instagram/youtube),
  content, posted_at, engagement_likes/comments/shares
}
```

### Mentions
```javascript
{
  id, post_id, ticker, sentiment (positive/negative/neutral),
  extraction_confidence, mentioned_at
}
```

### Alerts
```javascript
{
  id, investor_id, ticker, alert_type, severity,
  message, created_at, read_at, acknowledged_at
}
```

---

## 🔑 API Endpoints

### Investors
```
GET    /api/investors              # List all
GET    /api/investors/:id          # Get one with recent posts
POST   /api/investors              # Create new
PUT    /api/investors/:id          # Update
```

### Posts
```
GET    /api/posts                  # Recent posts (24h)
GET    /api/posts/investor/:id     # Posts by investor
GET    /api/posts/source/:source   # Posts by platform
POST   /api/posts                  # Create post
```

### Mentions
```
GET    /api/mentions/ticker/:ticker     # Mentions of ticker
GET    /api/mentions/investor/:id       # Investor mentions
GET    /api/mentions/trending/top       # Top mentioned tickers
```

### Alerts
```
GET    /api/alerts                 # Unread alerts
GET    /api/alerts/:id             # Single alert
POST   /api/alerts                 # Create alert
PUT    /api/alerts/:id/read        # Mark read
PUT    /api/alerts/:id/acknowledge # Mark acknowledged
```

### Dashboard
```
GET    /api/dashboard/stats        # Overview stats
GET    /api/dashboard/activity     # Activity feed
GET    /api/dashboard/trending     # Top tickers
GET    /api/dashboard/investors/spotlight  # Investor activity
```

---

## 🔧 Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/investment_monitor

# Server
PORT=3001
JWT_SECRET=your_secret_here

# X API
X_BEARER_TOKEN=your_token_here

# Optional APIs
NEWSAPI_KEY=your_key_here
YOUTUBE_API_KEY=your_key_here
TIKTOK_API_KEY=your_key_here
INSTAGRAM_ACCESS_TOKEN=your_token_here

# Email Alerts
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Webhooks
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Frontend
CORS_ORIGIN=http://localhost:3000
```

---

## 📈 Usage Examples

### Track a New Investor
```bash
curl -X POST http://localhost:3001/api/investors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Michael Burry",
    "handle_x": "@michaeljburry",
    "bio": "Value investor, contrarian"
  }'
```

### Get Trending Tickers
```bash
curl http://localhost:3001/api/dashboard/trending | jq .
```

### Create Alert
```bash
curl -X POST http://localhost:3001/api/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "alert_type": "mention_spike",
    "severity": "high",
    "ticker": "NVDA",
    "message": "NVDA mentioned 3 times in 24h"
  }'
```

---

## 🚨 Current Limitations & Roadmap

### Currently:
- ✅ X/Twitter integration (tweets)
- ✅ SEC EDGAR filings (13F)
- ✅ NewsAPI articles
- ✅ Basic sentiment analysis
- ✅ WebSocket alerts
- ✅ PostgreSQL storage

### Coming Soon:
- 🔄 TikTok integration (API or web scraping)
- 🔄 Real-time price correlation with mentions
- 🔄 Machine learning anomaly detection
- 🔄 Portfolio backtesting
- 🔄 Mobile app (React Native)
- 🔄 Advanced charting (candlesticks, technical indicators)
- 🔄 Copycat trading (suggest stocks to buy)
- 🔄 API for external use (monetization)

---

## 📦 Project Structure

```
investment-monitor/
├── backend/
│   ├── src/
│   │   ├── index.js              # Server entry point
│   │   ├── db/
│   │   │   ├── connection.js      # Database setup
│   │   │   ├── migrate.js         # Migrations
│   │   │   └── seed.js            # Initial data
│   │   ├── routes/
│   │   │   ├── investors.js       # /api/investors
│   │   │   ├── posts.js           # /api/posts
│   │   │   ├── mentions.js        # /api/mentions
│   │   │   ├── alerts.js          # /api/alerts
│   │   │   ├── dashboard.js       # /api/dashboard
│   │   │   └── auth.js            # /api/auth
│   │   └── tasks/
│   │       ├── ingestors.js       # Data fetching
│   │       ├── alertEngine.js     # Alert logic
│   │       └── scheduler.js       # Cron jobs
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx               # Entry point
│   │   ├── App.jsx                # Root layout
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # Main dashboard
│   │   │   ├── InvestorDetail.jsx # Investor page
│   │   │   ├── Alerts.jsx         # Alerts page
│   │   │   └── TickerDetail.jsx   # Ticker page
│   │   ├── components/
│   │   │   ├── Navbar.jsx         # Top nav
│   │   │   └── RealtimeAlerts.jsx # Alert notifications
│   │   ├── store/
│   │   │   └── appStore.js        # Zustand state
│   │   ├── lib/
│   │   │   └── api.js             # Axios config
│   │   └── index.css              # Tailwind styles
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── SYSTEM_DESIGN.md               # Architecture & design
├── DEPLOYMENT_GUIDE.md            # Step-by-step deployment
├── SETUP_TODO.md                  # Action checklist for Lance
└── README.md                       # This file
```

---

## 🔐 Security

- ✅ JWT authentication
- ✅ Rate limiting (100 req/15min per IP)
- ✅ CORS configured
- ✅ HTTPS enforced (production)
- ✅ Environment variables for secrets
- ✅ SQL injection prevention (parameterized queries)
- ✅ Input validation & sanitization

---

## 🧪 Testing

```bash
# Backend tests
npm test

# Frontend tests
npm test

# E2E tests (Playwright)
npm run test:e2e
```

---

## 📚 Documentation

- [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) - Full architecture & data models
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Production deployment steps
- [SETUP_TODO.md](./SETUP_TODO.md) - Action checklist for Lance

---

## 💡 Key Insights

### Why This Matters
Most retail investors follow "finfluencers" but lack **real-time, multi-source intelligence**. This system gives you:
- One dashboard for all major investors
- Instant alerts when they move
- Historical data for backtesting
- Sentiment analysis to avoid false signals

### Competitive Advantages
1. **Multi-source:** Track same investor across all platforms
2. **Real-time:** WebSocket alerts within minutes
3. **Customizable:** Set your own alert thresholds
4. **Free/Cheap:** Mostly free APIs, $50/month to run
5. **Open:** Can be extended with custom features

### Use Cases
- **Retail investors:** Copy trades from pros
- **Analysts:** Track influencer credibility
- **Researchers:** Study retail sentiment
- **Hedge funds:** Monitor competitor moves
- **Traders:** Arb social signals vs price action

---

## 🤝 Contributing

Want to add features? See [ROADMAP.md](./ROADMAP.md) for planned features.

Common contributions:
- New data sources (Instagram, TikTok)
- Better sentiment analysis (ML models)
- Technical indicators (RSI, MACD)
- Mobile app (React Native)
- Trading automation (execute alerts)

---

## 📄 License

MIT - Feel free to use, modify, distribute.

---

## 🙋 Support

**Questions?**
- Check SYSTEM_DESIGN.md for architecture
- Check DEPLOYMENT_GUIDE.md for setup issues
- Check SETUP_TODO.md for next steps

**Issues?**
- GitHub Issues (if public)
- Email: lance@thecoopbrla.com

---

## 🎉 Getting Started

1. **Clone the repo**
   ```bash
   git clone <repo-url>
   cd investment-monitor
   ```

2. **Set up locally** (see Quick Start above)

3. **Get API keys** (see SETUP_TODO.md)

4. **Deploy** (see DEPLOYMENT_GUIDE.md)

5. **Start monitoring** 🚀

---

**Built with 💡 for Lance. Ready to launch.**

**Questions? Check the docs. Issues? DM me. Good luck! 🚀**
