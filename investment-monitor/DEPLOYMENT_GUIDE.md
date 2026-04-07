# Investment Monitor - Deployment Guide

**Status:** Working prototype ready for Lance
**Build Date:** April 3, 2026
**Architecture:** Full-stack React + Node.js + PostgreSQL

---

## Quick Start (Local Development)

### Prerequisites
- Node.js v18+
- PostgreSQL 14+ (local or remote)
- API keys for data sources (see below)

### 1. Clone & Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your database credentials and API keys

npm install
npm run db:migrate    # Create tables
npm run db:seed       # Add default investors
npm run dev           # Start server on port 3001
```

### 2. Setup Frontend

```bash
cd ../frontend
npm install
npm run dev           # Start on port 3000
```

### 3. Access Dashboard
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **WebSocket:** ws://localhost:3001

---

## API Keys Setup

### 1. X (Twitter) API v2
1. Go to https://developer.twitter.com/
2. Create an app with "Research" access
3. Generate Bearer Token
4. Add to `.env`: `X_BEARER_TOKEN=...`

### 2. NewsAPI (Optional but Recommended)
1. Go to https://newsapi.org/
2. Free tier: 100 requests/day
3. Sign up and get API key
4. Add to `.env`: `NEWSAPI_KEY=...`

### 3. TikTok API (Manual Data Collection Initially)
- TikTok API is heavily restricted
- **Workaround:** Manually add TikTok content via API endpoints or use web scraping (with rate limits)
- Alternative: Track via web scraping + scheduler

### 4. Instagram Graph API (Optional)
- Requires business account
- Add business access token to `.env`: `INSTAGRAM_ACCESS_TOKEN=...`

### 5. YouTube API
1. Go to Google Cloud Console
2. Enable YouTube Data API v3
3. Create API key
4. Add to `.env`: `YOUTUBE_API_KEY=...`

---

## Production Deployment

### Option A: Render (Recommended - Easiest)

#### 1. Database Setup
- Use Supabase PostgreSQL (free tier: 500MB)
  - Go to https://supabase.com/
  - Create new project
  - Copy database URL → `DATABASE_URL` in production `.env`

#### 2. Backend Deployment (Render)
```bash
# Push code to GitHub
git add .
git commit -m "Initial deployment"
git push origin main

# On render.com:
# 1. New → Web Service
# 2. Connect GitHub repo
# 3. Set environment variables (copy from .env)
# 4. Build command: npm install
# 5. Start command: npm start
# 6. Auto-deploys on git push
```

**Backend URL:** `https://investment-monitor.onrender.com` (example)

#### 3. Frontend Deployment (Vercel)
```bash
cd frontend
npm install -g vercel
vercel

# Follow prompts
# Set environment variable:
# VITE_API_URL=https://investment-monitor.onrender.com
```

**Frontend URL:** `https://investment-monitor.vercel.app` (example)

### Option B: Docker Deployment (More Control)

#### 1. Create Dockerfile (backend)
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/index.js"]
```

#### 2. Deploy to Railway or Fly.io
```bash
# Railway.app
railway up

# Fly.io
fly launch
fly deploy
```

---

## Database Setup (Production)

### Using Supabase
1. Create project: https://supabase.com/
2. Copy connection string
3. Run migrations:
   ```bash
   PGPASSWORD=your_password psql -h host.supabase.co -U postgres -d postgres < migrations.sql
   ```

### Using AWS RDS
1. Create PostgreSQL instance
2. Security group: Allow inbound on port 5432
3. Copy endpoint to `DATABASE_URL`
4. Run migrations via psql or Node.js

---

## Scheduled Tasks (Data Ingestion)

### Option A: Node Cron (Simple)
```javascript
// In backend/src/tasks/scheduler.js
import cron from 'node-cron'
import { fetchXTweets, processPosts } from './ingestors.js'

// Every hour, fetch tweets
cron.schedule('0 * * * *', async () => {
  const investors = await pool.query('SELECT * FROM investors WHERE status = $1', ['active'])
  
  for (const investor of investors.rows) {
    if (investor.handle_x) {
      const tweets = await fetchXTweets(investor.handle_x)
      await processPosts(investor.id, tweets, 'x')
    }
  }
})
```

### Option B: External Scheduler (Production)
Use a service like Trigger.dev, n8n, or Make for robust scheduling:

```
Trigger.dev Example:
- Every 15 minutes: Fetch X tweets
- Every hour: Fetch news articles
- Every 6 hours: Fetch SEC 13F filings
- Every 24 hours: Refresh investor data
```

---

## Real-time Alerts Configuration

### Email Alerts (Optional)
```javascript
// Add to backend/src/services/mailer.js
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
})

export async function sendAlert(investor, ticker, message) {
  await transporter.sendMail({
    to: process.env.ALERT_EMAIL,
    subject: `⚠️ ${investor} mentioned $${ticker}`,
    html: `<h2>${investor}</h2><p>${message}</p>`,
  })
}
```

### Slack Integration (Optional)
```javascript
// In alert engine
if (alert.severity === 'critical') {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify({
      text: `🚨 CRITICAL: ${alert.message}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${alert.ticker}*\n${alert.message}` } }
      ]
    })
  })
}
```

---

## Monitoring & Logging

### Application Monitoring
- **Option 1:** Sentry.io (error tracking)
  ```bash
  npm install @sentry/node
  # Configure in server startup
  ```

- **Option 2:** DataDog (full observability)
  - Instrument backend with APM agent
  - Track API response times, database queries

### Database Monitoring
- Supabase dashboard shows query performance
- AWS RDS CloudWatch for custom metrics
- Set up alerts for slow queries

### Health Checks
```bash
# Monitor uptime
curl https://investment-monitor.onrender.com/health

# Should return: { "status": "ok", "timestamp": "..." }
```

---

## Performance Optimization

### Caching Strategy
```javascript
// Add Redis caching
import redis from 'redis'
const redisClient = redis.createClient({ url: process.env.REDIS_URL })

// Cache trending tickers for 5 minutes
router.get('/dashboard/trending', async (req, res) => {
  const cached = await redisClient.get('trending_tickers')
  if (cached) return res.json(JSON.parse(cached))
  
  const data = await pool.query(...)
  await redisClient.setex('trending_tickers', 300, JSON.stringify(data.rows))
  res.json(data.rows)
})
```

### Database Indexing
```sql
-- Add these indexes for faster queries
CREATE INDEX idx_mentions_ticker ON mentions(ticker);
CREATE INDEX idx_posts_investor_date ON posts(investor_id, posted_at DESC);
CREATE INDEX idx_posts_source ON posts(source);
CREATE INDEX idx_alerts_unread ON alerts(read_at) WHERE read_at IS NULL;
```

---

## Cost Estimates (Monthly)

| Service | Free Tier | Paid Tier | Cost |
|---------|-----------|-----------|------|
| Supabase DB | 500MB | - | Free* |
| Render Backend | - | - | $7/month |
| Vercel Frontend | - | - | Free |
| NewsAPI | 100/day | 1000/day | $45 |
| Upstash Redis | - | - | $0-5 |
| **Total** | - | - | **~$52/month** |

*Upgrade to $25/month when exceeding limits

---

## Troubleshooting

### WebSocket Connection Issues
```bash
# Check backend is running
curl http://localhost:3001/health

# Check CORS in .env
# CORS_ORIGIN should match frontend URL
```

### Database Connection Errors
```bash
# Test connection
psql "postgresql://user:password@host:5432/investment_monitor"

# Check .env DATABASE_URL format
postgresql://user:password@host:5432/dbname
```

### API Rate Limiting
- X API: 300 requests per 15 minutes
- NewsAPI: 100 requests per day (free)
- YouTube: 10k quota per day
- **Solution:** Implement request queuing with Bull

### Missing Investor Data
```bash
# Reseed database
node backend/src/db/seed.js

# Or add manually via API
curl -X POST http://localhost:3001/api/investors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Chris Camillo",
    "handle_x": "chriscamillo",
    "bio": "..."
  }'
```

---

## Next Steps for Production

1. **✅ Phase 1 (MVP):** Complete
   - Backend API running
   - Database with investors
   - Basic dashboard

2. **📋 Phase 2:** Add more data sources
   - Integrate X API with scheduled fetching
   - Add SEC EDGAR 13F parser
   - Implement trending tickers

3. **🔔 Phase 3:** Alert engine
   - Implement alert rules
   - Add email/Slack notifications
   - Create alert preferences UI

4. **🚀 Phase 4:** Production hardening
   - Security audit
   - Load testing
   - Documentation
   - Full deployment to production

---

## Support & Resources

- **Backend API Docs:** `POST /api/investors`, `GET /api/alerts`, etc.
- **X API:** https://developer.twitter.com/en/docs/twitter-api
- **SEC EDGAR:** https://www.sec.gov/cgi-bin/browse-edgar
- **React Hooks:** https://react.dev/reference/react
- **Socket.io:** https://socket.io/docs/

---

## Quick Commands Reference

```bash
# Backend
npm run dev                    # Start dev server
npm run db:migrate            # Run migrations
npm run db:seed              # Seed database
curl http://localhost:3001/health  # Health check

# Frontend
npm run dev                    # Start dev server
npm run build                 # Build for production

# Database
psql $DATABASE_URL            # Connect to database
\dt                          # List tables
SELECT * FROM investors;     # Query investors
```

---

**Ready to deploy? Follow the Render/Vercel path above. Questions? Check the system design doc.**
