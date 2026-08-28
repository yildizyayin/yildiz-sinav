PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN password_changed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_active_user ON sessions(user_id,revoked_at,expires_at);
