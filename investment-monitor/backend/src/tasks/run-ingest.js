/**
 * Master ingestion script — runs on demand or via cron.
 * Pulls news for all investors, extracts ticker mentions, generates alerts.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

import { pool, initializeDatabase } from '../db/connection.js';
import { fetchNewsArticles } from './ingestors.js';

// Investor search terms for NewsAPI
const INVESTOR_QUERIES = [
  { name: 'Cathie Wood', queries: ['Cathie Wood', 'ARK Invest', 'ARK Innovation'] },
  { name: 'Chris Camillo', queries: ['Chris Camillo', 'TickerTags'] },
  { name: 'Keith Gill', queries: ['Keith Gill', 'Roaring Kitty', 'DeepFuckingValue'] },
  { name: 'Mark Minervini', queries: ['Mark Minervini', 'Minervini'] },
  { name: 'Peter Lynch', queries: ['Peter Lynch', 'Fidelity Magellan'] },
];

// Simple ticker extraction regex
const TICKER_PATTERN = /\b([A-Z]{1,5})\b/g;
const COMMON_WORDS = new Set(['I','A','THE','AND','OR','NOT','IN','IS','IT','TO','OF','AT','BE','AS','WE','DO','AN','SO','IF','BY','UP','NO','ON','MY','GO','ME','US','AM','PM','CEO','CFO','CTO','IPO','ETF','ARK','SEC','GDP','CPI','FED','USD','EUR','AI','API','ML','VC','PE','IPO']);

function extractTickers(text) {
  const matches = text.match(TICKER_PATTERN) || [];
  return [...new Set(matches.filter(t =>
    t.length >= 2 && t.length <= 5 && !COMMON_WORDS.has(t)
  ))];
}

function analyzeSentiment(text) {
  const bullish = ['buy', 'bullish', 'up', 'surge', 'rally', 'gain', 'strong', 'beat', 'growth', 'opportunity', 'undervalued'];
  const bearish = ['sell', 'bearish', 'down', 'crash', 'drop', 'fall', 'weak', 'miss', 'decline', 'overvalued', 'risk'];
  const lower = text.toLowerCase();
  const bullCount = bullish.filter(w => lower.includes(w)).length;
  const bearCount = bearish.filter(w => lower.includes(w)).length;
  if (bullCount > bearCount) return 'positive';
  if (bearCount > bullCount) return 'negative';
  return 'neutral';
}

async function ingestInvestor(investorName, queries) {
  // Get investor ID from DB
  const investorRes = await pool.query('SELECT id FROM investors WHERE name = $1', [investorName]);
  if (investorRes.rows.length === 0) {
    console.warn(`  Investor not found in DB: ${investorName}`);
    return 0;
  }
  const investorId = investorRes.rows[0].id;

  let totalNew = 0;
  for (const query of queries) {
    const articles = await fetchNewsArticles([query], 10);
    for (const article of articles) {
      try {
        // Insert post
        const sourceId = article.url ? `newsapi-${Buffer.from(article.url).toString('base64').slice(0,40)}` : `newsapi-${Date.now()}-${Math.random()}`;
        const postRes = await pool.query(
          `INSERT INTO posts (investor_id, source, source_id, content, posted_at, engagement_likes)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (source_id) DO NOTHING RETURNING id`,
          [
            investorId, 'newsapi',
            sourceId,
            article.content || article.title || '',
            article.published_at || new Date(),
            0,
          ]
        );

        if (postRes.rows.length === 0) continue; // Already exists
        const postId = postRes.rows[0].id;
        totalNew++;

        // Extract tickers and insert mentions
        const text = `${article.title || ''} ${article.content || ''} ${article.url || ''}`;
        const tickers = extractTickers(text);
        const sentiment = analyzeSentiment(text);

        for (const ticker of tickers.slice(0, 10)) {
          await pool.query(
            `INSERT INTO mentions (post_id, ticker, context, sentiment, extraction_confidence, mentioned_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [postId, ticker, text.substring(0, 200), sentiment, 0.7, article.published_at || new Date()]
          ).catch(() => {}); // Ignore duplicate mentions
        }
      } catch (err) {
        // Ignore duplicate source_ids
      }
    }
  }
  return totalNew;
}

async function main() {
  console.log('🔄 Starting ingestion...');
  await initializeDatabase();

  let totalNew = 0;
  for (const investor of INVESTOR_QUERIES) {
    process.stdout.write(`  ${investor.name}... `);
    const count = await ingestInvestor(investor.name, investor.queries);
    console.log(`${count} new articles`);
    totalNew += count;
    await new Promise(r => setTimeout(r, 500)); // Rate limit
  }

  console.log(`\n✅ Ingestion complete. ${totalNew} new posts added.`);

  // Show trending tickers
  const trending = await pool.query(`
    SELECT ticker, COUNT(*) as mentions, 
           SUM(CASE WHEN sentiment='positive' THEN 1 ELSE 0 END) as bullish,
           SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) as bearish
    FROM mentions 
    WHERE mentioned_at > NOW() - INTERVAL '7 days'
    GROUP BY ticker ORDER BY mentions DESC LIMIT 10
  `);
  
  if (trending.rows.length > 0) {
    console.log('\n📈 Trending tickers (7 days):');
    for (const row of trending.rows) {
      console.log(`  $${row.ticker}: ${row.mentions} mentions (${row.bullish}🟢 ${row.bearish}🔴)`);
    }
  }

  await pool.end();
}

main().catch(e => { console.error('Ingest failed:', e.message); process.exit(1); });
