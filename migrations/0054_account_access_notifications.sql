PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;

-- Account credentials are delivered only at creation time or during the short retry window.
-- The credential payload is encrypted with ACCOUNT_NOTIFICATION_SECRET/SESSION_SECRET;
-- plaintext passwords are never stored in D1 or audit logs.
CREATE TABLE IF NOT EXISTS account_notification_batches (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  recipient_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','COMPLETED','PARTIAL','FAILED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_account_notification_batches_scope
  ON account_notification_batches(institution_id, created_at DESC);

CREATE TABLE IF NOT EXISTS account_notification_deliveries (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES account_notification_batches(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('EMAIL','SMS')),
  destination TEXT,
  credential_ciphertext TEXT,
  credential_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','SKIPPED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  failure_code TEXT,
  attempted_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch_id,user_id,channel)
);
CREATE INDEX IF NOT EXISTS idx_account_notification_deliveries_scope
  ON account_notification_deliveries(institution_id, status, created_at DESC);

