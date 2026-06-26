/**
 * Token auto-refresh utility
 *
 * - refreshToken(account)   – Refresh a single account's tokens
 * - startAutoRefreshJob()   – Background cron job (every minute) that refreshes
 *                             all tokens expiring within the next 5 minutes
 */

const axios = require('axios');
const cron = require('node-cron');
const { query } = require('../config/database');
const { notifyTokenRefreshed, notifyTokenRefreshFailed } = require('./telegram');

// ─── Single token refresh ─────────────────────────────────────────────────────

/**
 * Refresh the access token for the given account using its refresh_token.
 * Updates the database record and returns the new token expiry on success.
 *
 * @param {{ id: number, email: string, refresh_token: string }} account
 * @returns {Promise<{ token_expiry: string }|null>} Updated expiry or null on failure
 */
async function refreshToken(account) {
  const { CLIENT_ID, CLIENT_SECRET, TENANT_ID } = process.env;

  if (!CLIENT_ID || !CLIENT_SECRET || !TENANT_ID) {
    console.error('[TokenRefresh] Missing Azure AD env vars.');
    return null;
  }

  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
      scope: 'openid profile email offline_access https://graph.microsoft.com/.default',
    });

    const response = await axios.post(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
    );

    const { access_token, refresh_token: new_refresh_token, expires_in } = response.data;
    const token_expiry = new Date(Date.now() + expires_in * 1000).toISOString();

    // Persist new tokens
    await query(
      `UPDATE oauth_accounts
       SET access_token  = $1,
           refresh_token = $2,
           token_expiry  = $3,
           status        = 'active',
           updated_at    = NOW()
       WHERE id = $4`,
      [access_token, new_refresh_token || account.refresh_token, token_expiry, account.id]
    );

    await notifyTokenRefreshed(account.email, token_expiry);
    console.log(`[TokenRefresh] Refreshed token for ${account.email}`);

    return { token_expiry };
  } catch (err) {
    const errorMessage =
      err?.response?.data?.error_description ||
      err?.response?.data?.error ||
      err.message;

    console.error(`[TokenRefresh] Failed for ${account.email}:`, errorMessage);

    // Mark account as errored so the dashboard can show it
    await query(
      `UPDATE oauth_accounts SET status = 'error', updated_at = NOW() WHERE id = $1`,
      [account.id]
    );

    await notifyTokenRefreshFailed(account.email, errorMessage);
    return null;
  }
}

// ─── Background auto-refresh job ─────────────────────────────────────────────

/**
 * Start a cron job that runs every minute and refreshes any tokens
 * that will expire within the next 5 minutes.
 */
function startAutoRefreshJob() {
  console.log('[TokenRefresh] Auto-refresh job started (runs every minute).');

  // Run every minute: "* * * * *"
  cron.schedule('* * * * *', async () => {
    try {
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      const result = await query(
        `SELECT * FROM oauth_accounts
         WHERE status != 'error'
           AND token_expiry <= $1`,
        [fiveMinutesFromNow]
      );

      if (result.rows.length === 0) return;

      console.log(`[TokenRefresh] Refreshing ${result.rows.length} token(s)...`);

      for (const account of result.rows) {
        await refreshToken(account);
      }
    } catch (err) {
      console.error('[TokenRefresh] Cron job error:', err.message);
    }
  });
}

module.exports = { refreshToken, startAutoRefreshJob };
