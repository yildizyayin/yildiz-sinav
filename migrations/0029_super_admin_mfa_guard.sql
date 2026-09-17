PRAGMA foreign_keys = ON;

-- Super Admin TOTP secrets remain Cloudflare Secrets. This table stores only
-- rate-limit evidence; no TOTP seed or one-time code is persisted.
CREATE TABLE IF NOT EXISTS super_admin_mfa_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  success INTEGER NOT NULL CHECK(success IN (0,1)),
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_super_admin_mfa_attempts_user
  ON super_admin_mfa_attempts(user_id, created_at DESC);
