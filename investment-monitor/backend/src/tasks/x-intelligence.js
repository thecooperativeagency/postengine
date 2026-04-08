/**
 * X Intelligence Engine
 * 
 * 1. Sentiment momentum — detect ticker spikes across tracked investors
 * 2. Kalshi cross-reference — when ticker trends, check for Kalshi contracts
 * 3. Extended account tracking — more smart money accounts
 * 4. Search API — broad sentiment scan for any ticker
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import axios from 'axios';
import { pool, initializeDatabase } from '../db/connection.js';

const BEARER = process.env.X_BEARER_TOKEN;
const HEADERS = { Authorization: `Bearer ${BEARER}` };
const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const TELEGRAM_BOT = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID;

// ── 3. Extended account list ─────────────────────────────────────────────────
export const TRACKED_ACCOUNTS = [
  // Core investors
  { name: 'Chris Camillo',      handle: 'ChrisCamillo',       userId: '14983508',  category: 'investor' },
  { name: 'Keith Gill',         handle: 'TheRoaringKitty',    userId: null,        category: 'investor' },
  { name: 'Cathie Wood',        handle: 'CathieDWood',        userId: null,        category: 'investor' },
  { name: 'Mark Minervini',     handle: 'MarkMinervini',      userId: null,        category: 'investor' },
  // Macro / hedge fund
  { name: 'Michael Burry',      handle: 'michaeljburry',      userId: null,        category: 'macro' },
  { name: 'Bill Ackman',        handle: 'BillAckman',         userId: null,        category: 'macro' },
  { name: 'Chamath',            handle: 'chamath',            userId: null,        category: 'macro' },
  { name: 'Unusual Whales',     handle: 'unusual_whales',     userId: null,        category: 'flow' },
  { name: 'Congress Trades',    handle: 'quiverquant',        userId: null,        category: 'congress' },
];

// ── Telegram alert ───────────────────────────────────────────────────────────
async function sendTelegram(msg) {
  if (!TELEGRAM_BOT || !TELEGRAM_CHAT) return;
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage`, {
    chat_id: TELEGRAM_CHAT, text: msg, parse_mode: 'Markdown'
  }).catch(() => {});
}

// ── 1. Sentiment Momentum ────────────────────────────────────────────────────
export async function detectSentimentSpikes() {
  console.log('\n📊 Checking sentiment momentum...');

  // Find tickers that jumped from low to high mentions in last 24h vs previous 24h
  const result = await pool.query(`
    SELECT 
      ticker,
      COUNT(CASE WHEN mentioned_at > NOW() - INTERVAL '24 hours' THEN 1 END) as recent,
      COUNT(CASE WHEN mentioned_at BETWEEN NOW() - INTERVAL '48 hours' AND NOW() - INTERVAL '24 hours' THEN 1 END) as previous,
      SUM(CASE WHEN mentioned_at > NOW() - INTERVAL '24 hours' AND sentiment = 'positive' THEN 1 ELSE 0 END) as bullish_24h,
      SUM(CASE WHEN mentioned_at > NOW() - INTERVAL '24 hours' AND sentiment = 'negative' THEN 1 ELSE 0 END) as bearish_24h
    FROM mentions
    WHERE mentioned_at > NOW() - INTERVAL '48 hours'
    GROUP BY ticker
    HAVING COUNT(CASE WHEN mentioned_at > NOW() - INTERVAL '24 hours' THEN 1 END) >= 2
    ORDER BY recent DESC
  `);

  const spikes = [];
  for (const row of result.rows) {
    const recent = parseInt(row.recent);
    const previous = parseInt(row.previous);
    const multiplier = previous === 0 ? recent : recent / previous;
    
    if (multiplier >= 2 && recent >= 2) {
      spikes.push({
        ticker: row.ticker,
        recent,
        previous,
        multiplier: multiplier.toFixed(1),
        bullish: parseInt(row.bullish_24h),
        bearish: parseInt(row.bearish_24h),
      });
      console.log(`  🔥 $${row.ticker}: ${recent} mentions (${multiplier.toFixed(1)}x spike) | ${row.bullish_24h}🟢 ${row.bearish_24h}🔴`);
    }
  }

  if (spikes.length === 0) {
    console.log('  No momentum spikes detected.');
  }

  return spikes;
}

// ── 2. Kalshi Cross-Reference ────────────────────────────────────────────────
export async function crossReferenceKalshi(tickers) {
  if (tickers.length === 0) return [];
  console.log('\n🎯 Cross-referencing with Kalshi...');

  const hits = [];
  for (const ticker of tickers.slice(0, 10)) {
    try {
      // Search Kalshi for markets mentioning this ticker
      const res = await axios.get(`${KALSHI_BASE}/markets`, {
        params: { status: 'open', limit: 20 },
        timeout: 8000,
      });
      
      const markets = res.data.markets || [];
      const matches = markets.filter(m => 
        m.title?.toLowerCase().includes(ticker.toLowerCase()) ||
        m.ticker?.includes(ticker)
      );

      if (matches.length > 0) {
        console.log(`  ✅ $${ticker} → ${matches.length} Kalshi market(s):`);
        for (const m of matches.slice(0, 2)) {
          console.log(`     ${m.ticker} | YES: $${m.yes_bid_dollars} | ${m.title?.substring(0,50)}`);
          hits.push({ ticker, market: m });
        }
      }
    } catch (err) {
      // silent fail per ticker
    }
  }

  return hits;
}

// ── 4. Search API — Broad Ticker Sentiment ───────────────────────────────────
export async function searchTickerSentiment(ticker, maxResults = 20) {
  console.log(`\n🔍 Searching X for $${ticker}...`);

  try {
    const res = await axios.get('https://api.twitter.com/2/tweets/search/recent', {
      headers: HEADERS,
      timeout: 10000,
      params: {
        query: `$${ticker} -is:retweet lang:en`,
        max_results: maxResults,
        'tweet.fields': 'created_at,public_metrics,author_id',
      }
    });

    const tweets = res.data.data || [];
    if (tweets.length === 0) {
      console.log(`  No recent tweets found for $${ticker}`);
      return null;
    }

    // Analyze sentiment
    const bullish = ['buy','long','bullish','calls','moon','up','breakout','squeeze'];
    const bearish = ['sell','short','bearish','puts','crash','down','dump','overvalued'];
    
    let bullCount = 0, bearCount = 0, totalEngagement = 0;
    for (const t of tweets) {
      const lower = t.text.toLowerCase();
      if (bullish.some(w => lower.includes(w))) bullCount++;
      if (bearish.some(w => lower.includes(w))) bearCount++;
      totalEngagement += (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0);
    }

    const sentiment = bullCount > bearCount ? '🟢 Bullish' : bearCount > bullCount ? '🔴 Bearish' : '⚪ Neutral';
    const avgEngagement = Math.round(totalEngagement / tweets.length);

    console.log(`  $${ticker}: ${tweets.length} tweets | ${sentiment} | Avg engagement: ${avgEngagement}`);
    console.log(`  Bullish signals: ${bullCount} | Bearish signals: ${bearCount}`);

    return { ticker, tweets: tweets.length, bullCount, bearCount, sentiment, avgEngagement };
  } catch (err) {
    console.error(`  Search failed for $${ticker}:`, err.response?.data?.detail || err.message);
    return null;
  }
}

// ── Main: Run full intelligence sweep ────────────────────────────────────────
export async function runIntelligenceSweep() {
  console.log('🧠 X Intelligence Sweep');
  console.log('=======================');
  await initializeDatabase();

  // 1. Detect momentum spikes
  const spikes = await detectSentimentSpikes();

  // 2. Cross-reference spikes with Kalshi
  const spikedTickers = spikes.map(s => s.ticker);
  const kalshiHits = await crossReferenceKalshi(spikedTickers);

  // 4. Search broad sentiment for top spiked tickers
  const searchResults = [];
  for (const spike of spikes.slice(0, 3)) {
    const result = await searchTickerSentiment(spike.ticker, 10);
    if (result) searchResults.push(result);
    await new Promise(r => setTimeout(r, 1000));
  }

  // Build alert if anything notable found
  if (spikes.length > 0 || kalshiHits.length > 0) {
    let msg = '🧠 *X Intelligence Alert*\n\n';

    if (spikes.length > 0) {
      msg += '📈 *Momentum Spikes:*\n';
      for (const s of spikes) {
        msg += `$${s.ticker}: ${s.recent} mentions (${s.multiplier}x) | ${s.bullish}🟢 ${s.bearish}🔴\n`;
      }
    }

    if (kalshiHits.length > 0) {
      msg += '\n🎯 *Kalshi Markets Found:*\n';
      for (const h of kalshiHits) {
        msg += `$${h.ticker} → \`${h.market.ticker}\` YES: $${h.market.yes_bid_dollars}\n`;
      }
    }

    if (searchResults.length > 0) {
      msg += '\n🔍 *Broad Sentiment:*\n';
      for (const r of searchResults) {
        msg += `$${r.ticker}: ${r.sentiment} (${r.tweets} tweets, avg ${r.avgEngagement} engagement)\n`;
      }
    }

    await sendTelegram(msg);
  }

  // Save intelligence data for Python trader to consume
  const intelFile = '/Users/lucfaucheux/.openclaw/workspace/kalshi-weather/data/x-intelligence.json';
  const fs = await import('fs');
  fs.default.writeFileSync(intelFile, JSON.stringify({ 
    spikes, kalshiHits, searchResults,
    generated_at: new Date().toISOString()
  }, null, 2));
  console.log(`\n📁 Intelligence saved to x-intelligence.json`);

  await pool.end();
  return { spikes, kalshiHits, searchResults };
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] === '--search' && args[1]) {
    initializeDatabase().then(() => searchTickerSentiment(args[1], 20)).then(() => pool.end());
  } else {
    runIntelligenceSweep().catch(e => { console.error(e.message); process.exit(1); });
  }
}
