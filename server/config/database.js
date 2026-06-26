/**
 * PostgreSQL connection pool
 *
 * Uses DATABASE_URL supplied by Render (or local .env for development).
 * SSL is enabled in production so that Render's managed Postgres is reached
 * over an encrypted connection.
 */

const { Pool } = require('pg');

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
  // Keep up to 10 idle connections ready
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Run a parameterized query against the pool.
 *
 * @param {string} text  - SQL query string with $1, $2, … placeholders
 * @param {Array}  params - Query parameters (prevents SQL injection)
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB]', { text: text.slice(0, 80), duration, rows: result.rowCount });
  }
  return result;
}

/**
 * Obtain a dedicated client from the pool.
 * Always release it in a finally block.
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
