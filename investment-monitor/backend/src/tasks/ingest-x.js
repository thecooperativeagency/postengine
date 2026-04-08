/**
 * X (Twitter) ingestion — pulls real tweets from tracked investors.
 * Requires X API credits (Bearer Token).
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import axios from 'axios';
import { pool, initializeDatabase } from '../db/connection.js';

const BEARER = process.env.X_BEARER_TOKEN;
const HEADERS = { Authorization: `Bearer ${BEARER}` };

// Pull from x-intelligence tracked accounts
import { TRACKED_ACCOUNTS as INVESTORS } from './x-intelligence.js';

// Simple ticker extraction
const COMMON = new Set(['I','A','THE','AND','OR','NOT','IN','IS','IT','TO','BE','AS','WE','DO','AN','SO','IF','BY','UP','NO','ON','MY','GO','ME','US','AM','PM','CEO','CFO','IPO','ETF','SEC','GDP','CPI','FED','USD','EUR','AI','ML','VC','PE','WW','US','UK','EU','ANY','WAR','OLD','NEW','BIG']);

function extractTickers(text) {
  const matches = text.match(/\$([A-Z]{1,5})\b/g) || [];
  return [...new Set(matches.map(t => t.replace('$', '')).filter(t => !COMMON.has(t)))];
}

function analyzeSentiment(text) {
  const bull = ['buy','bullish','long','up','surge','rally','gain','beat','growth','opportunity','undervalued','calls'];
  const bear = ['sell','bearish','short','down','crash','drop','fall','weak','miss','decline','overvalued','puts','rug'];
  const lower = text.toLowerCase();
  const b = bull.filter(w => lower.includes(w)).length;
  const s = bear.filter(w => lower.includes(w)).length;
  return b > s ? 'positive' : s > b ? 'negative' : 'neutral';
}

async function getUserId(handle) {
  const res = await axios.get(
    `https://api.twitter.com/2/users/by/username/${handle}?user.fields=public_metrics`,
    { headers: HEADERS, timeout: 10000 }
  );
  return res.data.data?.id;
}

async function ingestInvestorTweets(investor) {
  // Get userId if not cached
  if (!investor.userId) {
    investor.userId = await getUserId(investor.handle);
    if (!investor.userId) { console.warn(`  Could not find user ID for ${investor.handle}`); return 0; }
  }

  // Get investor DB id
  const dbRes = await pool.query('SELECT id FROM investors WHERE name = $1', [investor.name]);
  if (dbRes.rows.length === 0) { console.warn(`  ${investor.name} not in DB`); return 0; }
  const investorId = dbRes.rows[0].id;

  // Fetch recent tweets
  const res = await axios.get(
    `https://api.twitter.com/2/users/${investor.userId}/tweets`,
    {
      headers: HEADERS,
      timeout: 10000,
      params: {
        max_results: 10,
        'tweet.fields': 'created_at,public_metrics',
        exclude: 'retweets,replies',
      }
    }
  );

  const tweets = res.data.data || [];
  let newCount = 0;

  for (const tweet of tweets) {
    try {
      const postRes = await pool.query(
        `INSERT INTO posts (investor_id, source, source_id, content, posted_at, engagement_likes, engagement_comments, engagement_shares)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id) DO NOTHING RETURNING id`,
        [
          investorId, 'x', tweet.id, tweet.text,
          new Date(tweet.created_at),
          tweet.public_metrics?.like_count || 0,
          tweet.public_metrics?.reply_count || 0,
          tweet.public_metrics?.retweet_count || 0,
        ]
      );

      if (postRes.rows.length === 0) continue;
      const postId = postRes.rows[0].id;
      newCount++;

      // Extract $TICKER mentions
      const tickers = extractTickers(tweet.text);
      const sentiment = analyzeSentiment(tweet.text);

      for (const ticker of tickers) {
        await pool.query(
          `INSERT INTO mentions (post_id, ticker, context, sentiment, extraction_confidence, mentioned_at)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [postId, ticker, tweet.text.substring(0, 200), sentiment, 0.95, new Date(tweet.created_at)]
        ).catch(() => {});
      }

      if (tickers.length > 0) {
        console.log(`    💬 "${tweet.text.substring(0, 60)}..." → $${tickers.join(', $')}`);
      }
    } catch (err) {
      // ignore dupes
    }
  }

  return newCount;
}

async function main() {
  console.log('🐦 X Tweet Ingestion');
  console.log('====================');
  await initializeDatabase();

  let total = 0;
  for (const investor of INVESTORS) {
    process.stdout.write(`  ${investor.name}... `);
    try {
      const count = await ingestInvestorTweets(investor);
      console.log(`${count} new tweets`);
      total += count;
      await new Promise(r => setTimeout(r, 1000)); // rate limit buffer
    } catch (err) {
      console.log(`ERROR: ${err.response?.data?.detail || err.message}`);
    }
  }

  // Show what tickers are trending from X specifically
  const trending = await pool.query(`
    SELECT m.ticker, COUNT(*) as mentions,
      SUM(CASE WHEN m.sentiment='positive' THEN 1 ELSE 0 END) as bullish
    FROM mentions m
    JOIN posts p ON m.post_id = p.id
    WHERE p.source = 'x' AND m.mentioned_at > NOW() - INTERVAL '48 hours'
    GROUP BY m.ticker ORDER BY mentions DESC LIMIT 10
  `);

  if (trending.rows.length > 0) {
    console.log('\n📈 Trending from X (48h):');
    for (const r of trending.rows) {
      console.log(`  $${r.ticker}: ${r.mentions} mentions (${r.bullish} bullish)`);
    }
  }

  console.log(`\n✅ Done. ${total} new tweets ingested.`);
  await pool.end();
}

main().catch(e => { console.error('Failed:', e.message); process.exit(1); });
