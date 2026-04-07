import express from 'express';
import { pool } from '../db/connection.js';

const router = express.Router();

// Dashboard stats
router.get('/stats', async (req, res) => {
  try {
    const investorCount = await pool.query('SELECT COUNT(*) as count FROM investors WHERE status = $1', ['active']);
    const postCount = await pool.query('SELECT COUNT(*) as count FROM posts WHERE posted_at > NOW() - INTERVAL \'7 days\'');
    const mentionCount = await pool.query('SELECT COUNT(*) as count FROM mentions WHERE mentioned_at > NOW() - INTERVAL \'7 days\'');
    const alertCount = await pool.query('SELECT COUNT(*) as count FROM alerts WHERE created_at > NOW() - INTERVAL \'24 hours\' AND read_at IS NULL');

    res.json({
      active_investors: investorCount.rows[0].count,
      posts_this_week: postCount.rows[0].count,
      mentions_this_week: mentionCount.rows[0].count,
      unread_alerts: alertCount.rows[0].count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Activity feed
router.get('/activity', async (req, res) => {
  const { limit = 50, hours = 24 } = req.query;

  try {
    const result = await pool.query(
      `SELECT 
        'post' as activity_type,
        i.id as investor_id,
        i.name as investor_name,
        p.source as data_source,
        p.content as content,
        p.posted_at as timestamp,
        (SELECT COUNT(*) FROM mentions WHERE post_id = p.id) as mention_count
       FROM posts p
       JOIN investors i ON p.investor_id = i.id
       WHERE p.posted_at > NOW() - INTERVAL '1 hour' * $1
       ORDER BY p.posted_at DESC
       LIMIT $2`,
      [hours, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

// Trending tickers with correlation
router.get('/trending', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        m.ticker,
        COUNT(DISTINCT p.id) as mention_count,
        COUNT(DISTINCT p.investor_id) as investor_count,
        AVG(CASE WHEN m.sentiment = 'positive' THEN 1 WHEN m.sentiment = 'negative' THEN -1 ELSE 0 END) as avg_sentiment,
        MAX(p.posted_at) as last_mentioned
       FROM mentions m
       JOIN posts p ON m.post_id = p.id
       WHERE m.mentioned_at > NOW() - INTERVAL '24 hours'
       GROUP BY m.ticker
       ORDER BY mention_count DESC
       LIMIT 20`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching trending:', error);
    res.status(500).json({ error: 'Failed to fetch trending tickers' });
  }
});

// Investor spotlight - activity and mentions
router.get('/investors/spotlight', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        i.id,
        i.name,
        i.handle_x,
        i.handle_tiktok,
        COUNT(DISTINCT p.id) as posts_this_week,
        COUNT(DISTINCT m.id) as mentions_this_week,
        COUNT(DISTINCT m.ticker) as unique_tickers
       FROM investors i
       LEFT JOIN posts p ON i.id = p.investor_id AND p.posted_at > NOW() - INTERVAL '7 days'
       LEFT JOIN mentions m ON p.id = m.post_id AND m.mentioned_at > NOW() - INTERVAL '7 days'
       WHERE i.status = 'active'
       GROUP BY i.id, i.name, i.handle_x, i.handle_tiktok
       ORDER BY posts_this_week DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching investor spotlight:', error);
    res.status(500).json({ error: 'Failed to fetch investor spotlight' });
  }
});

export default router;
