import express from 'express';
import { pool } from '../db/connection.js';

const router = express.Router();

// Get posts for investor
router.get('/investor/:investorId', async (req, res) => {
  const { investorId } = req.params;
  const { limit = 20, offset = 0 } = req.query;

  try {
    const posts = await pool.query(
      `SELECT p.*, 
        json_agg(json_build_object('id', m.id, 'ticker', m.ticker, 'sentiment', m.sentiment)) 
        FILTER (WHERE m.id IS NOT NULL) as mentions
       FROM posts p
       LEFT JOIN mentions m ON p.id = m.post_id
       WHERE p.investor_id = $1
       GROUP BY p.id
       ORDER BY p.posted_at DESC
       LIMIT $2 OFFSET $3`,
      [investorId, limit, offset]
    );

    res.json(posts.rows);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get posts by source
router.get('/source/:source', async (req, res) => {
  const { source } = req.params;
  const { limit = 50 } = req.query;

  const validSources = ['x', 'tiktok', 'instagram', 'youtube'];
  if (!validSources.includes(source.toLowerCase())) {
    return res.status(400).json({ error: 'Invalid source' });
  }

  try {
    const posts = await pool.query(
      `SELECT p.*, i.name as investor_name,
        json_agg(json_build_object('ticker', m.ticker, 'sentiment', m.sentiment)) 
        FILTER (WHERE m.id IS NOT NULL) as mentions
       FROM posts p
       JOIN investors i ON p.investor_id = i.id
       LEFT JOIN mentions m ON p.id = m.post_id
       WHERE LOWER(p.source) = LOWER($1)
       GROUP BY p.id, i.id
       ORDER BY p.posted_at DESC
       LIMIT $2`,
      [source, limit]
    );

    res.json(posts.rows);
  } catch (error) {
    console.error('Error fetching posts by source:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Create post
router.post('/', async (req, res) => {
  const { 
    investor_id, 
    source, 
    source_id, 
    content, 
    posted_at, 
    engagement_likes, 
    engagement_comments, 
    engagement_shares,
    media_urls 
  } = req.body;

  if (!investor_id || !source || !content) {
    return res.status(400).json({ error: 'investor_id, source, and content are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO posts 
       (investor_id, source, source_id, content, posted_at, engagement_likes, engagement_comments, engagement_shares, media_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [investor_id, source, source_id, content, posted_at || new Date(), engagement_likes || 0, engagement_comments || 0, engagement_shares || 0, media_urls]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Post with this source_id already exists' });
    }
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Get recent posts (feed)
router.get('/', async (req, res) => {
  const { limit = 50, hours = 24 } = req.query;

  try {
    const posts = await pool.query(
      `SELECT p.*, i.name as investor_name,
        json_agg(json_build_object('ticker', m.ticker, 'sentiment', m.sentiment)) 
        FILTER (WHERE m.id IS NOT NULL) as mentions
       FROM posts p
       JOIN investors i ON p.investor_id = i.id
       LEFT JOIN mentions m ON p.id = m.post_id
       WHERE p.posted_at > NOW() - INTERVAL '1 hour' * $1
       GROUP BY p.id, i.id
       ORDER BY p.posted_at DESC
       LIMIT $2`,
      [hours, limit]
    );

    res.json(posts.rows);
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

export default router;
