# Investment Monitor - Setup Todo List for Lance

**Status:** Prototype delivered. Below is your action checklist to launch.

---

## 🚀 Phase 1: Get It Running Locally (1-2 hours)

### Prerequisites
- [ ] Have Node.js v18+ installed
  ```bash
  node --version
  ```
- [ ] Have PostgreSQL installed locally OR set up free Supabase database
  - **Option A (Local):** `brew install postgresql && brew services start postgresql`
  - **Option B (Cloud - Recommended):** https://supabase.com/ → Create free project → Copy `postgresql://...` connection string

### Backend Setup
- [ ] Copy `backend/.env.example` → `backend/.env`
- [ ] Fill in database credentials in `.env`
  ```bash
  DATABASE_URL=postgresql://user:password@localhost:5432/investment_monitor
  JWT_SECRET=your_secret_here_change_later
  ```
- [ ] Run setup:
  ```bash
  cd backend
  npm install
  npm run db:migrate
  npm run db:seed
  npm run dev
  ```
- [ ] Verify backend running: http://localhost:3001/health

### Frontend Setup
- [ ] In new terminal:
  ```bash
  cd frontend
  npm install
  npm run dev
  ```
- [ ] Open http://localhost:3000
- [ ] You should see the dashboard with 5 investors already loaded

---

## 🔌 Phase 2: Connect Data Sources (2-4 hours)

### API Keys to Get

#### 1. X (Twitter) API
- [ ] Go to https://developer.twitter.com/
- [ ] Sign in with your Twitter account (create if needed)
- [ ] Click "Create an app" → Select "Research/Academic" use case
- [ ] Get **Bearer Token** from "Keys and tokens" tab
- [ ] Add to `backend/.env`:
  ```
  X_BEARER_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxx
  ```
- [ ] Test with:
  ```bash
  curl "https://api.twitter.com/2/tweets/search/recent?query=from:chriscamillo" \
    -H "Authorization: Bearer $X_BEARER_TOKEN"
  ```

#### 2. NewsAPI (Optional but recommended)
- [ ] Go to https://newsapi.org/
- [ ] Sign up → Get free API key (100 requests/day free tier)
- [ ] Add to `backend/.env`:
  ```
  NEWSAPI_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
  ```

#### 3. YouTube API (Optional)
- [ ] Go to https://console.cloud.google.com/
- [ ] Create new project
- [ ] Enable YouTube Data API v3
- [ ] Create API key (restrict to YouTube API)
- [ ] Add to `backend/.env`:
  ```
  YOUTUBE_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
  ```

#### 4. SEC EDGAR
- [ ] ✅ No API key needed (SEC provides free access)
- [ ] Investor CIK numbers already added to database

### Ingest Your First Data
- [ ] Restart backend with new API keys
- [ ] Run manual data fetch:
  ```bash
  node backend/src/tasks/ingestors.js
  ```
- [ ] Check dashboard for new posts and mentions

---

## 📊 Phase 3: Customize for Your Needs (2-3 hours)

### Investor Configuration
- [ ] Decide: Keep the 5 default investors or modify?
  - Current: Chris Camillo, Keith Gill, Cathie Wood, Mark Minervini, Peter Lynch
  - To add investor: Use API or direct database insert
  ```bash
  curl -X POST http://localhost:3001/api/investors \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Your Investor Name",
      "handle_x": "@twitter_handle",
      "handle_tiktok": "tiktok_handle",
      "bio": "Short bio"
    }'
  ```

### Alert Rules
- [ ] Review `backend/src/tasks/alertEngine.js` (currently basic)
- [ ] Customize severity thresholds:
  - CRITICAL: Portfolio position change >10%
  - HIGH: Ticker mentioned 2+ times in 24h
  - MEDIUM: Single mention
- [ ] Set up email alerts (optional):
  - Requires Gmail app password
  - Add to `.env`:
    ```
    SMTP_USER=your_email@gmail.com
    SMTP_PASSWORD=generated_app_password
    ALERT_EMAIL=your_email@gmail.com
    ```

### Dashboard Customization
- [ ] Update colors in `frontend/src/index.css` if needed
- [ ] Modify chart types in `frontend/src/pages/Dashboard.jsx`
- [ ] Add your logo to navbar

---

## ⚡ Phase 4: Set Up Automated Data Fetching (1-2 hours)

### Option A: Simple Cron (Runs on your machine)
- [ ] Create `backend/src/tasks/scheduler.js`
- [ ] Add to `backend/package.json` scripts:
  ```json
  "schedule": "node src/tasks/scheduler.js"
  ```
- [ ] Run: `npm run schedule` (keep it running)
- [ ] Fetches every 15 minutes from configured sources

### Option B: Cloud Scheduler (Production-grade)
- [ ] Use **Trigger.dev** (free tier: 500 runs/month)
  - Recommended for Render deployment
- [ ] Or **n8n** (self-hosted or managed)
- [ ] Or **Make.com** (easy visual workflow builder)

#### Example Trigger.dev Setup:
```bash
# Install CLI
npm install -g @trigger.dev/cli

# Create trigger
trigger.dev init

# Schedule: Every hour fetch X tweets
# Schedule: Every 6 hours fetch SEC filings
# Schedule: Every 30 min check news
```

---

## 🌐 Phase 5: Deploy to Production (2-4 hours)

### Quick Deploy (Render + Vercel)

#### Backend to Render
- [ ] Create GitHub repo with your code
- [ ] Go to https://render.com/
- [ ] New → Web Service → Connect GitHub
- [ ] Settings:
  - **Build:** `npm install`
  - **Start:** `npm start`
  - **Environment:** Copy all from `.env` (use production values!)
- [ ] Deploy
- [ ] Copy backend URL: `https://investment-monitor-xxxxx.onrender.com`

#### Database on Supabase
- [ ] Create project: https://supabase.com/
- [ ] Copy connection string
- [ ] In Render dashboard, set `DATABASE_URL` to Supabase connection
- [ ] Run migrations: `npm run db:migrate` (via Render shell)

#### Frontend to Vercel
- [ ] Go to https://vercel.com/
- [ ] Import GitHub repo (frontend folder)
- [ ] Add environment variable:
  ```
  VITE_API_URL=https://investment-monitor-xxxxx.onrender.com
  ```
- [ ] Deploy
- [ ] Your dashboard is live at `https://investment-monitor-xxxxx.vercel.app`

### Production Checklist
- [ ] Set strong `JWT_SECRET` in production
- [ ] Configure CORS properly (match frontend URL)
- [ ] Set `NODE_ENV=production`
- [ ] Enable database backups (Supabase does this automatically)
- [ ] Set up monitoring (optional: Sentry.io)
- [ ] Configure real alerts (email/Slack)

---

## 📱 Phase 6: Add Real-Time Alerts (1-2 hours)

### WebSocket Testing
- [ ] Open dashboard, open browser dev tools
- [ ] Emit test alert via curl:
  ```bash
  curl -X POST http://localhost:3001/api/alerts \
    -H "Content-Type: application/json" \
    -d '{
      "alert_type": "mention_spike",
      "severity": "high",
      "ticker": "NVDA",
      "message": "NVDA mentioned 3 times in 1 hour by Chris Camillo"
    }'
  ```
- [ ] Should see notification in bottom-right corner of dashboard

### Email Alerts (Optional)
- [ ] Generate Gmail app password:
  - https://myaccount.google.com/apppasswords
- [ ] Add to `.env` and redeploy:
  ```
  SMTP_USER=your_email@gmail.com
  SMTP_PASSWORD=your_app_password
  ALERT_EMAIL=your_email@gmail.com
  ```
- [ ] Test:
  ```bash
  node backend/src/services/mailer.js
  ```

### Slack Integration (Optional)
- [ ] Create Slack webhook: https://api.slack.com/messaging/webhooks
- [ ] Add to `.env`:
  ```
  SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
  ```
- [ ] Critical alerts auto-post to Slack

---

## 🔒 Security Hardening (1 hour)

- [ ] Rotate `JWT_SECRET` (production only)
- [ ] Enable HTTPS (automatic with Render/Vercel)
- [ ] Set `secure` cookie flags
- [ ] Add rate limiting (already included)
- [ ] Review database permissions (Supabase defaults are good)
- [ ] Audit API endpoints (consider adding API key auth if public)
- [ ] Enable CORS only for your domain

---

## 📈 Monitoring & Maintenance (Ongoing)

### Daily
- [ ] Check dashboard for new alerts
- [ ] Monitor investor activity

### Weekly
- [ ] Review trending tickers
- [ ] Check alert performance (any false positives?)
- [ ] Verify data freshness

### Monthly
- [ ] Review and optimize alert rules
- [ ] Check for API rate limit issues
- [ ] Update investor list if needed
- [ ] Review cloud service costs

### Log Files
- Backend logs: Check Render console
- Database logs: Check Supabase admin panel
- Frontend errors: Check Vercel logs

---

## 💰 Cost After Launch

| What | Cost | Notes |
|------|------|-------|
| Supabase Database | Free* | Up to 500MB included |
| Render Backend | $7/month | Always-on, auto-scales |
| Vercel Frontend | Free | Unlimited deployments |
| NewsAPI | $45/month | 1000 req/day (optional) |
| Scheduler (Trigger.dev) | Free | 500 runs/month |
| **Total** | **~$52/month** | Scales up only if needed |

*Upgrade to $25/month when exceeding 500MB storage

---

## 🎯 Success Criteria

You'll know it's working when:
- ✅ Dashboard loads with real investor data
- ✅ New X tweets appear within 1 hour
- ✅ Ticker mentions extracted and displayed
- ✅ Trending tickers update every 24h
- ✅ Alerts trigger on mention spikes
- ✅ WebSocket notifications appear
- ✅ Production URL is live and responsive

---

## 📞 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard shows "no data" | Check API is running: `curl http://localhost:3001/health` |
| WebSocket not connecting | Verify backend URL in frontend env vars |
| Posts not updating | Check X API key is valid, check rate limits |
| Database errors | Verify DATABASE_URL format, test connection |
| Slow page loads | Add Redis caching, optimize database queries |

---

## 🚦 Recommended Launch Timeline

- **Day 1:** Set up locally (Phase 1)
- **Day 2:** Connect X API, verify data flow (Phase 2)
- **Day 3:** Customize investors and alerts (Phase 3)
- **Day 4:** Deploy to production (Phase 5)
- **Day 5+:** Monitor, refine alerts, add features

---

**Questions? Check SYSTEM_DESIGN.md for architecture details or DEPLOYMENT_GUIDE.md for technical setup.**

**Next Level:** Advanced features (technical analysis charts, portfolio correlation, ML anomaly detection) can be added after launch.

---

## ✨ Bonus Ideas (Post-Launch)

1. **Portfolio Heat Map** - Show correlation between investor purchases and stock performance
2. **Sentiment Timeline** - Chart sentiment shifts over time for each investor
3. **Copycat Feature** - Suggest stocks for users to follow based on investor buys
4. **Backtesting** - Show historical performance of investor's picks
5. **Mobile App** - React Native app with push notifications
6. **API for Others** - Monetize by offering investor data via API
7. **Premium Tiers** - Email digests, custom alerts, advanced analytics
8. **Discord Bot** - Get alerts in Discord
9. **Telegram Bot** - Mobile alerts via Telegram
10. **AI Analysis** - Use Claude/ChatGPT to write summaries of investor activity

---

**Status: Ready to go. You've got everything you need. 🚀**
