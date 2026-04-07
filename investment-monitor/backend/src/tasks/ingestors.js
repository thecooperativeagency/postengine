import fetch from 'node-fetch'
import { load as cheerioLoad } from 'cheerio'
import { pool } from '../db/connection.js'

/**
 * X (Twitter) API Integration
 * Requires: X_BEARER_TOKEN
 */
export async function fetchXTweets(handle, since = null) {
  const token = process.env.X_BEARER_TOKEN
  if (!token) {
    console.warn('X_BEARER_TOKEN not configured')
    return []
  }

  try {
    const headers = {
      'Authorization': `Bearer ${token}`,
    }

    const params = new URLSearchParams({
      'query': `from:${handle} -is:retweet`,
      'max_results': '100',
      'tweet.fields': 'created_at,public_metrics,author_id',
      'expansions': 'author_id',
      'user.fields': 'username',
    })

    if (since) {
      params.append('start_time', since.toISOString())
    }

    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?${params}`,
      { headers }
    )

    if (!res.ok) {
      console.error('X API error:', res.status, res.statusText)
      return []
    }

    const data = await res.json()
    return (data.data || []).map(tweet => ({
      source: 'x',
      source_id: tweet.id,
      content: tweet.text,
      posted_at: new Date(tweet.created_at),
      engagement_likes: tweet.public_metrics?.like_count || 0,
      engagement_comments: tweet.public_metrics?.reply_count || 0,
      engagement_shares: tweet.public_metrics?.retweet_count || 0,
    }))
  } catch (error) {
    console.error('Error fetching X tweets:', error)
    return []
  }
}

/**
 * SEC EDGAR API - 13F Filings
 * Free, no API key required
 */
export async function fetch13FFilings(cikNumber, limit = 10) {
  try {
    const filingUrl = `https://data.sec.gov/submissions/CIK${cikNumber.padStart(10, '0')}.json`

    const res = await fetch(filingUrl)
    if (!res.ok) {
      console.warn(`CIK ${cikNumber} not found`)
      return []
    }

    const data = await res.json()
    const filings = data.filings?.recent?.form
      ?.filter(f => f.includes('13F'))
      .slice(0, limit)

    return (filings || []).map((form, idx) => ({
      form_type: form,
      filing_index: idx,
    }))
  } catch (error) {
    console.error('Error fetching 13F filings:', error)
    return []
  }
}

/**
 * News API Integration
 * Requires: NEWSAPI_KEY (newsapi.org)
 */
export async function fetchNewsArticles(keywords, limit = 10) {
  const apiKey = process.env.NEWSAPI_KEY
  if (!apiKey) {
    console.warn('NEWSAPI_KEY not configured')
    return []
  }

  try {
    const params = new URLSearchParams({
      q: keywords.join(' OR '),
      sortBy: 'publishedAt',
      language: 'en',
      pageSize: limit,
    })

    const res = await fetch(
      `https://newsapi.org/v2/everything?${params}&apiKey=${apiKey}`
    )

    if (!res.ok) {
      console.error('NewsAPI error:', res.status)
      return []
    }

    const data = await res.json()
    return (data.articles || []).map(article => ({
      title: article.title,
      url: article.url,
      content: article.content || article.description,
      source: article.source.name,
      published_at: new Date(article.publishedAt),
      image_url: article.urlToImage,
    }))
  } catch (error) {
    console.error('Error fetching news:', error)
    return []
  }
}

/**
 * Extract ticker mentions from text
 * Finds patterns like $AAPL or AAPL (with context)
 */
export function extractTickers(text) {
  const mentions = []

  // Pattern 1: $TICKER
  const dollarPattern = /\$([A-Z]{1,5})\b/g
  let match
  while ((match = dollarPattern.exec(text)) !== null) {
    mentions.push({
      ticker: match[1],
      pattern: 'dollar_sign',
      confidence: 0.95,
    })
  }

  // Pattern 2: Standalone ticker (4-5 chars, all caps, surrounded by spaces/punctuation)
  const standalonePattern = /\b([A-Z]{4,5})\b/g
  while ((match = standalonePattern.exec(text)) !== null) {
    // Check if surrounded by investment-related words
    const context = text.substring(
      Math.max(0, match.index - 30),
      Math.min(text.length, match.index + match[0].length + 30)
    )

    const investmentWords = ['stock', 'buy', 'sell', 'hold', 'position', 'short', 'long', 'pump', 'dump']
    if (investmentWords.some(word => context.toLowerCase().includes(word))) {
      mentions.push({
        ticker: match[1],
        pattern: 'standalone',
        confidence: 0.7,
      })
    }
  }

  // Deduplicate and return
  return [...new Map(mentions.map(m => [m.ticker, m])).values()]
}

/**
 * Analyze sentiment of text
 * Simple keyword-based approach
 */
export function analyzeSentiment(text) {
  const bullish = ['buy', 'bullish', 'moon', 'rocket', 'pump', 'long', 'undervalued', 'cheap', 'strong', 'great', 'excellent', 'outstanding']
  const bearish = ['sell', 'bearish', 'dump', 'short', 'overvalued', 'expensive', 'weak', 'bad', 'terrible', 'avoid', 'crash']

  const lowerText = text.toLowerCase()
  const bullishCount = bullish.filter(word => lowerText.includes(word)).length
  const bearishCount = bearish.filter(word => lowerText.includes(word)).length

  if (bullishCount > bearishCount) return 'positive'
  if (bearishCount > bullishCount) return 'negative'
  return 'neutral'
}

/**
 * Ingest posts and process mentions
 */
export async function processPosts(investorId, posts, source) {
  for (const post of posts) {
    try {
      // Insert post
      const postResult = await pool.query(
        `INSERT INTO posts 
         (investor_id, source, source_id, content, posted_at, engagement_likes, engagement_comments, engagement_shares)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source_id) DO NOTHING
         RETURNING id`,
        [
          investorId,
          source,
          post.source_id,
          post.content,
          post.posted_at,
          post.engagement_likes || 0,
          post.engagement_comments || 0,
          post.engagement_shares || 0,
        ]
      )

      if (postResult.rows.length === 0) continue // Post already exists

      const postId = postResult.rows[0].id

      // Extract tickers
      const tickers = extractTickers(post.content)
      const sentiment = analyzeSentiment(post.content)

      // Insert mentions
      for (const ticker of tickers) {
        await pool.query(
          `INSERT INTO mentions 
           (post_id, ticker, context, sentiment, extraction_confidence)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            postId,
            ticker.ticker,
            post.content.substring(0, 500),
            sentiment,
            ticker.confidence,
          ]
        )
      }

      console.log(`✅ Processed post ${postId} with ${tickers.length} mentions`)
    } catch (error) {
      console.error('Error processing post:', error)
    }
  }
}

export default {
  fetchXTweets,
  fetch13FFilings,
  fetchNewsArticles,
  extractTickers,
  analyzeSentiment,
  processPosts,
}
