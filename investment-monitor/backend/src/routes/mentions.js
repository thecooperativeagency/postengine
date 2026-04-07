import express from 'express';
import { pool } from '../db/connection.js';

const router = express.Router();

// Get mentions by ticker
router.get('/ticker/:ticker', async (req, res) => {
  const { ticker } = req.params;
  try {
    const result = await pool.query(
      `SELECT m.*, p.content, p.posted_at, i.name as investor_name
       FROM mentions m
       JOIN posts p ON m.post_id = p.id
       JOIN investors i ON p.investor_id = i.id
       WHERE UPPER(m.ticker) = UPPER($1)
       ORDER BY p.posted_at DESC
       LIMIT 50`,
      [ticker.toUpperCase()]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching mentions:', error);
    res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// Get top mentioned tickers
router.get('/trending/top', async (req, res) => {
  const { limit = 20 } = req.query;

  try {
    const result = await pool.query(
      `SELECT ticker, 
              COUNT(*) as mention_count,
              AVG(CASE WHEN sentiment = 'positive' THEN 1 WHEN sentiment = 'negative' THEN -1 ELSE 0 END) as avg_sentiment
       FROM mentions
       WHERE mentioned_at > NOW() - INTERVAL '7 days'
       GROUP BY ticker
       ORDER BY mention_count DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching trending mentions:', error);
    res.status(500).json({ error: 'Failed to fetch trending mentions' });
  }
});

// Get mentions for investor
router.get('/investor/:investorId', async (req, res) => {
  const { investorId } = req.params;
  const { days = 30 } = req.query;

  try {
    const result = await pool.query(
      `SELECT m.*, p.content, p.posted_at, p.source
       FROM mentions m
       JOIN posts p ON m.post_id = p.id
       WHERE p.investor_id = $1 AND m.mentioned_at > NOW() - INTERVAL '1 day' * $2
       ORDER BY p.posted_at DESC`,
      [investorId, days]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching investor mentions:', error);
    res.status(500).json({ error: 'Failed to fetch mentions' });
  }
});

// Add mention (used during post processing)
router.post('/', async (req, res) => {
  const { post_id, ticker, context, sentiment, extraction_confidence } = req.body;

  if (!post_id || !ticker) {
    return res.status(400).json({ error: 'post_id and ticker are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO mentions (post_id, ticker, context, sentiment, extraction_confidence)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [post_id, ticker.toUpperCase(), context, sentiment, extraction_confidence]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating mention:', error);
    res.status(500).json({ error: 'Failed to create mention' });
  }
});

export default router;
