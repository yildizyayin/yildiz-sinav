PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS institution_licenses (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL UNIQUE REFERENCES institutions(id) ON DELETE CASCADE,
  plan_code TEXT NOT NULL DEFAULT 'TRIAL_7_DAY' CHECK(plan_code IN ('TRIAL_7_DAY','ANNUAL','PILOT','CUSTOM')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','SUSPENDED','CANCELLED')),
  trial_started_at TEXT,
  trial_expires_at TEXT,
  license_started_at TEXT,
  license_expires_at TEXT,
  converted_from_trial INTEGER NOT NULL DEFAULT 0,
  conversion_mode TEXT CHECK(conversion_mode IN ('KEEP_DATA','RESET_DATA')),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_institution_licenses_status ON institution_licenses(status, trial_expires_at, license_expires_at);

CREATE TABLE IF NOT EXISTS institution_license_events (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  license_id TEXT REFERENCES institution_licenses(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('TRIAL_STARTED','TRIAL_EXPIRED','ANNUAL_ACTIVATED','ANNUAL_KEEP_DATA','ANNUAL_RESET_DATA','SUSPENDED','REACTIVATED','CANCELLED')),
  actor_user_id TEXT REFERENCES users(id),
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_license_events_scope ON institution_license_events(institution_id, created_at);

CREATE TABLE IF NOT EXISTS nibiru_settings (
  id TEXT PRIMARY KEY DEFAULT 'platform',
  assistant_name TEXT NOT NULL DEFAULT 'Nibiru',
  enabled INTEGER NOT NULL DEFAULT 1,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
  public_whatsapp_number TEXT,
  ai_model TEXT NOT NULL DEFAULT '@cf/zai-org/glm-4.7-flash',
  education_language_mode TEXT NOT NULL DEFAULT 'MEB_DEVELOPMENTAL',
  transparency_text TEXT NOT NULL DEFAULT 'Ben Nibiru, Anunex’in yapay zekâ akademik asistanıyım.',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO nibiru_settings(id) VALUES('platform');

CREATE TABLE IF NOT EXISTS nibiru_whatsapp_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  phone_e164 TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'VERIFIED' CHECK(status IN ('PENDING','VERIFIED','REVOKED')),
  verification_method TEXT NOT NULL DEFAULT 'PAIRING_CODE' CHECK(verification_method IN ('PAIRING_CODE','ADMIN_VERIFIED','MIGRATED_VERIFIED')),
  verified_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nibiru_identity_phone ON nibiru_whatsapp_identities(phone_e164, status);

CREATE TABLE IF NOT EXISTS nibiru_pairing_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nibiru_pairing_user ON nibiru_pairing_codes(user_id, expires_at);

CREATE TABLE IF NOT EXISTS nibiru_sessions (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK(channel IN ('WHATSAPP','WEB')),
  channel_user_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_intent TEXT,
  last_student_id TEXT REFERENCES student_entities(id),
  last_exam_id TEXT REFERENCES exams(id),
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel, channel_user_key)
);
CREATE INDEX IF NOT EXISTS idx_nibiru_sessions_user ON nibiru_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS nibiru_whatsapp_receipts (
  provider_message_id TEXT PRIMARY KEY,
  phone_e164 TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_nibiru_receipts_phone ON nibiru_whatsapp_receipts(phone_e164, received_at);

CREATE TABLE IF NOT EXISTS nibiru_audit_events (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK(channel IN ('WHATSAPP','WEB')),
  role TEXT,
  intent TEXT,
  subject_student_id TEXT REFERENCES student_entities(id) ON DELETE SET NULL,
  subject_exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('ANSWERED','REDIRECTED','DENIED','UNVERIFIED','ERROR')),
  message_chars INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nibiru_audit_scope ON nibiru_audit_events(institution_id, created_at);
