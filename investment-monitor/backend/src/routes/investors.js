import express from 'express';
import { pool } from '../db/connection.js';

const router = express.Router();

// Get all investors
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM investors WHERE status = $1 ORDER BY name ASC',
      ['active']
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching investors:', error);
    res.status(500).json({ error: 'Failed to fetch investors' });
  }
});

// Get single investor with recent posts
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const investor = await pool.query('SELECT * FROM investors WHERE id = $1', [id]);
    
    if (investor.rows.length === 0) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    const posts = await pool.query(
      `SELECT p.*, 
        json_agg(json_build_object('ticker', m.ticker, 'sentiment', m.sentiment)) 
        FILTER (WHERE m.id IS NOT NULL) as mentions
       FROM posts p
       LEFT JOIN mentions m ON p.id = m.post_id
       WHERE p.investor_id = $1
       GROUP BY p.id
       ORDER BY p.posted_at DESC
       LIMIT 20`,
      [id]
    );

    res.json({
      ...investor.rows[0],
      recent_posts: posts.rows,
    });
  } catch (error) {
    console.error('Error fetching investor:', error);
    res.status(500).json({ error: 'Failed to fetch investor' });
  }
});

// Create investor
router.post('/', async (req, res) => {
  const { name, bio, handle_x, handle_tiktok, handle_instagram, channel_youtube, cik_sec, website_url } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO investors (name, bio, handle_x, handle_tiktok, handle_instagram, channel_youtube, cik_sec, website_url, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
       RETURNING *`,
      [name, bio, handle_x, handle_tiktok, handle_instagram, channel_youtube, cik_sec, website_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.message.includes('duplicate key')) {
      return res.status(409).json({ error: 'Investor with this name already exists' });
    }
    console.error('Error creating investor:', error);
    res.status(500).json({ error: 'Failed to create investor' });
  }
});

// Update investor
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, bio, handle_x, handle_tiktok, handle_instagram, channel_youtube, cik_sec, website_url, status } = req.body;

  try {
    const result = await pool.query(
      `UPDATE investors 
       SET name = COALESCE($1, name),
           bio = COALESCE($2, bio),
           handle_x = COALESCE($3, handle_x),
           handle_tiktok = COALESCE($4, handle_tiktok),
           handle_instagram = COALESCE($5, handle_instagram),
           channel_youtube = COALESCE($6, channel_youtube),
           cik_sec = COALESCE($7, cik_sec),
           website_url = COALESCE($8, website_url),
           status = COALESCE($9, status),
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [name, bio, handle_x, handle_tiktok, handle_instagram, channel_youtube, cik_sec, website_url, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Investor not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating investor:', error);
    res.status(500).json({ error: 'Failed to update investor' });
  }
});

export default router;
