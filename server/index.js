/**
 * Express application entry point
 *
 * Mounts all API routes, serves the React build in production,
 * and starts the token auto-refresh background job.
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');

const { pool, query } = require('./config/database');
const authRoutes = require('./routes/auth');
const tokenRoutes = require('./routes/tokens');
const mailboxRoutes = require('./routes/mailbox');
const { startAutoRefreshJob } = require('./utils/token-refresh');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate-limit all API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Tighter limit for the login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again later.' },
});

// ─── Health check (rate-limited) ─────────────────────────────────────────────

const healthLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', healthLimiter, (req, res) => {
  res.json({ status: 'ok', service: 'oauth-token-manager', timestamp: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/mailbox', mailboxRoutes);

// ─── Serve React build in production ─────────────────────────────────────────

if (isProduction) {
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// ─── Global error handler ────────────────────────────────────────────────────

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Database initialisation + startup ───────────────────────────────────────

async function initDatabase() {
  const fs = require('fs');
  const schemaPath = path.join(__dirname, 'models', 'db-schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query(schema);
    console.log('[DB] Schema initialised.');
  } finally {
    client.release();
  }
}

async function seedAdminUser() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.warn('[Auth] ADMIN_PASSWORD not set. Skipping admin seed.');
    return;
  }

  const existing = await query(
    'SELECT id FROM admin_users WHERE username = $1',
    [username]
  );

  if (existing.rows.length === 0) {
    const hash = await bcrypt.hash(password, 12);
    await query(
      'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
      [username, hash]
    );
    console.log('[Auth] Admin user created.');
  }
}

async function start() {
  try {
    await initDatabase();
    await seedAdminUser();
    startAutoRefreshJob();

    app.listen(PORT, () => {
      console.log(`[Server] Listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });
  } catch (err) {
    console.error('[Server] Startup failed:', err);
    process.exit(1);
  }
}

start();
