/**
 * Mailbox routes (Microsoft Graph API proxy)
 *
 * All routes are admin-protected.
 *
 * GET  /api/mailbox/:id/messages          – List inbox messages
 * GET  /api/mailbox/:id/message/:msgId    – Get a single email
 * POST /api/mailbox/:id/send              – Send an email
 * GET  /api/mailbox/:id/contacts          – Get contacts
 * GET  /api/mailbox/:id/folders           – List mail folders
 */

const express = require('express');
const { query } = require('../config/database');
const authMiddleware = require('../middleware/auth');
const {
  getInboxMessages,
  getMessage,
  sendEmail,
  getContacts,
  getMailFolders,
  getFolderMessages,
} = require('../utils/graph-api');
const { refreshToken } = require('../utils/token-refresh');

const router = express.Router();

// ─── Helper: resolve account and ensure a valid access token ─────────────────

async function resolveAccount(id) {
  const result = await query('SELECT * FROM oauth_accounts WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;

  let account = result.rows[0];

  // Proactively refresh if the token expires within the next 5 minutes
  const expiryMs = new Date(account.token_expiry).getTime();
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() + fiveMinutes >= expiryMs) {
    const refreshed = await refreshToken(account);
    if (refreshed) {
      // Re-fetch the updated record
      const updated = await query('SELECT * FROM oauth_accounts WHERE id = $1', [id]);
      account = updated.rows[0];
    }
  }

  return account;
}

// ─── List inbox messages ──────────────────────────────────────────────────────

router.get('/:id/messages', authMiddleware, async (req, res) => {
  try {
    const account = await resolveAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const folder = req.query.folder || 'inbox';
    const top = parseInt(req.query.top, 10) || 20;
    const skip = parseInt(req.query.skip, 10) || 0;
    const search = req.query.search || null;

    const messages = folder === 'inbox'
      ? await getInboxMessages(account.access_token, top, skip, search)
      : await getFolderMessages(account.access_token, folder, top, skip, search);

    res.json(messages);
  } catch (err) {
    console.error('List messages error:', err.message);
    res.status(502).json({ error: 'Failed to fetch messages from Microsoft Graph.' });
  }
});

// ─── Get single message ───────────────────────────────────────────────────────

router.get('/:id/message/:msgId', authMiddleware, async (req, res) => {
  try {
    const account = await resolveAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const message = await getMessage(account.access_token, req.params.msgId);
    res.json(message);
  } catch (err) {
    console.error('Get message error:', err.message);
    res.status(502).json({ error: 'Failed to fetch message.' });
  }
});

// ─── Send email ───────────────────────────────────────────────────────────────

router.post('/:id/send', authMiddleware, async (req, res) => {
  const { to, subject, body, contentType } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body are required.' });
  }

  try {
    const account = await resolveAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    await sendEmail(account.access_token, { to, subject, body, contentType: contentType || 'HTML' });
    res.json({ message: 'Email sent successfully.' });
  } catch (err) {
    console.error('Send email error:', err.message);
    res.status(502).json({ error: 'Failed to send email.' });
  }
});

// ─── Get contacts ─────────────────────────────────────────────────────────────

router.get('/:id/contacts', authMiddleware, async (req, res) => {
  try {
    const account = await resolveAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const top = parseInt(req.query.top, 10) || 50;
    const contacts = await getContacts(account.access_token, top);
    res.json(contacts);
  } catch (err) {
    console.error('Get contacts error:', err.message);
    res.status(502).json({ error: 'Failed to fetch contacts.' });
  }
});

// ─── List mail folders ────────────────────────────────────────────────────────

router.get('/:id/folders', authMiddleware, async (req, res) => {
  try {
    const account = await resolveAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const folders = await getMailFolders(account.access_token);
    res.json(folders);
  } catch (err) {
    console.error('Get folders error:', err.message);
    res.status(502).json({ error: 'Failed to fetch mail folders.' });
  }
});

module.exports = router;
