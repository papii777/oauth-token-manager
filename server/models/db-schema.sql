-- PostgreSQL database schema for the OAuth Token Manager
-- Run this script once against your database to create the required tables.
-- On Render you can do so via the database shell or psql.

-- ─── OAuth Accounts ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id            SERIAL PRIMARY KEY,
  user_id       VARCHAR(255) UNIQUE NOT NULL,   -- Azure AD object ID (oid)
  email         VARCHAR(255) NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expiry  TIMESTAMP NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  status        VARCHAR(50) DEFAULT 'active'    -- active | expired | error
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email  ON oauth_accounts (email);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_status ON oauth_accounts (status);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_expiry ON oauth_accounts (token_expiry);

-- ─── Admin Users ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── Helper: automatically update updated_at on row change ───────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_oauth_accounts_updated_at ON oauth_accounts;
CREATE TRIGGER set_oauth_accounts_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
