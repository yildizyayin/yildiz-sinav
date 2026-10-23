-- S020: a one-time PIN lets a school claim its own Result Network account. Only a salted hash is stored;
-- failed attempts lock the PIN for a while; using it once ends it.
CREATE TABLE institution_claim_pins (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_iterations INTEGER NOT NULL,
  issued_by TEXT REFERENCES users(id),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  used_at TEXT,
  used_by_user_id TEXT REFERENCES users(id),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT
);
