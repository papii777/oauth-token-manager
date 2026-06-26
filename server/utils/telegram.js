/**
 * Telegram notification utility
 *
 * Sends formatted HTML messages via the Telegram Bot API.
 * Requires BOT_TOKEN and CHAT_ID environment variables.
 */

const axios = require('axios');

const TELEGRAM_BASE = 'https://api.telegram.org';

/**
 * Send an HTML-formatted message to the configured Telegram chat.
 *
 * @param {string} message - HTML-formatted message text
 * @returns {Promise<void>}
 */
async function sendNotification(message) {
  const { BOT_TOKEN, CHAT_ID } = process.env;

  if (!BOT_TOKEN || !CHAT_ID) {
    // Notifications silently skipped when bot is not configured
    return;
  }

  try {
    await axios.post(`${TELEGRAM_BASE}/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: message,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });
  } catch (err) {
    // Log but don't propagate — notifications should never crash the app
    console.error('[Telegram] Failed to send notification:', err?.response?.data || err.message);
  }
}

/**
 * Convenience helpers for common notification types.
 */

async function notifyNewAccount(email, tokenExpiry) {
  await sendNotification(
    `✅ <b>New Account Added</b>\n\n` +
      `📧 Email: <code>${email}</code>\n` +
      `⏰ Token Expiry: ${new Date(tokenExpiry).toLocaleString()}`
  );
}

async function notifyTokenRefreshed(email, newExpiry) {
  await sendNotification(
    `🔄 <b>Token Refreshed</b>\n\n` +
      `📧 Email: <code>${email}</code>\n` +
      `⏰ New Expiry: ${new Date(newExpiry).toLocaleString()}`
  );
}

async function notifyTokenRefreshFailed(email, error) {
  await sendNotification(
    `❌ <b>Token Refresh Failed</b>\n\n` +
      `📧 Email: <code>${email}</code>\n` +
      `⚠️ Error: ${error}`
  );
}

async function notifyAccountDeleted(email) {
  await sendNotification(`🗑️ <b>Account Deleted</b>\n\n📧 Email: <code>${email}</code>`);
}

async function notifySystemError(message) {
  await sendNotification(`🚨 <b>System Error</b>\n\n${message}`);
}

module.exports = {
  sendNotification,
  notifyNewAccount,
  notifyTokenRefreshed,
  notifyTokenRefreshFailed,
  notifyAccountDeleted,
  notifySystemError,
};
