PRAGMA foreign_keys = ON;

-- S046: bank-style one-time SMS codes for login and password reset. Only hashes are kept: the phone number is
-- stored as a SHA-256 hash and the code as a salted hash; the message text is never stored.
CREATE TABLE IF NOT EXISTS sms_otp_challenges (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK(purpose IN ('LOGIN','RESET')),
  phone_hash TEXT NOT NULL,
  code_hash TEXT,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  sent INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sms_otp_phone ON sms_otp_challenges(phone_hash, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_otp_ip ON sms_otp_challenges(ip_hash, created_at DESC);

-- Delivery evidence without content: what was sent, to whom (hashed), through which provider, and the outcome.
CREATE TABLE IF NOT EXISTS sms_delivery_log (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL,
  user_id TEXT,
  phone_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('SENT','FAILED','NOT_CONFIGURED')),
  provider_ref TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_created ON sms_delivery_log(created_at DESC);
