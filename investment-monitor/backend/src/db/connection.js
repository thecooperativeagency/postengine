import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'investment_monitor',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export async function initializeDatabase() {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful:', res.rows[0]);
    
    // Run migrations on startup
    await runMigrations();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

async function runMigrations() {
  const migrations = [
    // Investors table
    `CREATE TABLE IF NOT EXISTS investors (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      bio TEXT,
      handle_x VARCHAR(255),
      handle_tiktok VARCHAR(255),
      handle_instagram VARCHAR(255),
      channel_youtube VARCHAR(255),
      cik_sec VARCHAR(50),
      website_url VARCHAR(500),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,

    // Posts table
    `CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      source VARCHAR(50) NOT NULL,
      source_id VARCHAR(255) UNIQUE,
      content TEXT NOT NULL,
      posted_at TIMESTAMP NOT NULL,
      fetched_at TIMESTAMP DEFAULT NOW(),
      engagement_likes INTEGER DEFAULT 0,
      engagement_comments INTEGER DEFAULT 0,
      engagement_shares INTEGER DEFAULT 0,
      media_urls TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (investor_id) REFERENCES investors(id)
    )`,

    // Mentions table
    `CREATE TABLE IF NOT EXISTS mentions (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      ticker VARCHAR(10) NOT NULL,
      context TEXT,
      sentiment VARCHAR(20),
      extraction_confidence FLOAT,
      mentioned_at TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP DEFAULT NOW(),
      INDEX (ticker)
    )`,

    // Prices table
    `CREATE TABLE IF NOT EXISTS prices (
      id SERIAL PRIMARY KEY,
      ticker VARCHAR(10) NOT NULL,
      date DATE NOT NULL,
      open FLOAT,
      high FLOAT,
      low FLOAT,
      close FLOAT NOT NULL,
      volume BIGINT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(ticker, date)
    )`,

    // Alerts table
    `CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      investor_id INTEGER REFERENCES investors(id) ON DELETE CASCADE,
      ticker VARCHAR(10),
      alert_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) DEFAULT 'medium',
      message TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      acknowledged_at TIMESTAMP,
      read_at TIMESTAMP
    )`,

    // 13F filings table
    `CREATE TABLE IF NOT EXISTS thirteen_f (
      id SERIAL PRIMARY KEY,
      investor_id INTEGER NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      filing_date DATE NOT NULL,
      ticker VARCHAR(10) NOT NULL,
      shares_count BIGINT,
      shares_value BIGINT,
      position_change_pct FLOAT,
      source_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (investor_id) REFERENCES investors(id)
    )`,

    // Users table (for authentication)
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
  ];

  for (const migration of migrations) {
    try {
      await pool.query(migration);
    } catch (error) {
      if (!error.message.includes('already exists')) {
        console.error('Migration error:', error.message);
      }
    }
  }

  console.log('✅ Migrations completed');
}

export { pool };
