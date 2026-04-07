import express from 'express';
import { pool } from '../db/connection.js';

const router = express.Router();

// Get unread alerts
router.get('/', async (req, res) => {
  const { limit = 50 } = req.query;

  try {
    const alerts = await pool.query(
      `SELECT a.*, i.name as investor_name
       FROM alerts a
       LEFT JOIN investors i ON a.investor_id = i.id
       WHERE a.read_at IS NULL
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json(alerts.rows);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Get alerts by investor
router.get('/investor/:investorId', async (req, res) => {
  const { investorId } = req.params;
  const { limit = 50 } = req.query;

  try {
    const alerts = await pool.query(
      `SELECT * FROM alerts 
       WHERE investor_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [investorId, limit]
    );

    res.json(alerts.rows);
  } catch (error) {
    console.error('Error fetching investor alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Get alerts by ticker
router.get('/ticker/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const { limit = 50 } = req.query;

  try {
    const alerts = await pool.query(
      `SELECT a.*, i.name as investor_name
       FROM alerts a
       LEFT JOIN investors i ON a.investor_id = i.id
       WHERE UPPER(a.ticker) = UPPER($1)
       ORDER BY a.created_at DESC
       LIMIT $2`,
      [ticker, limit]
    );

    res.json(alerts.rows);
  } catch (error) {
    console.error('Error fetching ticker alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Create alert
router.post('/', async (req, res) => {
  const { investor_id, ticker, alert_type, severity, message, metadata } = req.body;

  if (!alert_type || !message) {
    return res.status(400).json({ error: 'alert_type and message are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO alerts (investor_id, ticker, alert_type, severity, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [investor_id, ticker, alert_type, severity || 'medium', message, JSON.stringify(metadata || {})]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// Mark alert as read
router.put('/:id/read', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE alerts 
       SET read_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// Mark alert as acknowledged
router.put('/:id/acknowledge', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE alerts 
       SET acknowledged_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({ error: 'Failed to acknowledge alert' });
  }
});

export default router;
