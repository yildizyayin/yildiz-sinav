-- Additive: no changes to existing WhatsApp identities or worksheet plans.
CREATE TABLE IF NOT EXISTS user_passkeys (
 credential_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 rp_id TEXT NOT NULL,
 public_key TEXT NOT NULL,
 counter INTEGER NOT NULL DEFAULT 0,
 transports_json TEXT NOT NULL DEFAULT '[]',
 device_type TEXT NOT NULL,
 backed_up INTEGER NOT NULL DEFAULT 0,
 label TEXT NOT NULL DEFAULT 'Geçiş anahtarım',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON user_passkeys(user_id,rp_id);
CREATE TABLE IF NOT EXISTS passkey_challenges (
 id TEXT PRIMARY KEY,
 browser_hash TEXT NOT NULL,
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('REGISTER','LOGIN')),
 challenge TEXT NOT NULL,
 origin TEXT NOT NULL,
 rp_id TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkey_challenge_expiry ON passkey_challenges(expires_at);
CREATE TABLE IF NOT EXISTS nibiru_daily_usage (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 usage_date TEXT NOT NULL,
 request_count INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(user_id,usage_date)
);
CREATE TABLE IF NOT EXISTS calendar_events (
 id TEXT PRIMARY KEY,
 institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
 owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope TEXT NOT NULL CHECK(scope IN ('PERSONAL','INSTITUTION','CLASS','STUDENT')),
 class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
 student_id TEXT REFERENCES student_entities(id) ON DELETE CASCADE,
 subject_id TEXT REFERENCES subjects(id),
 kind TEXT NOT NULL CHECK(kind IN ('LESSON','EXAM','HOMEWORK','WORKSHEET','MEETING','GUIDANCE','RBA','STUDY','REMINDER')),
 title TEXT NOT NULL,
 description TEXT,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
 recurrence TEXT NOT NULL DEFAULT 'NONE' CHECK(recurrence IN ('NONE','WEEKLY')),
 repeat_until TEXT,
 reminder_minutes INTEGER NOT NULL DEFAULT 30,
 status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','COMPLETED','CANCELLED')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK((scope='CLASS' AND class_id IS NOT NULL) OR scope!='CLASS'),
 CHECK((scope='STUDENT' AND student_id IS NOT NULL) OR scope!='STUDENT'),
 CHECK(scope='PERSONAL' OR institution_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_calendar_institution_date ON calendar_events(institution_id,starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_owner_date ON calendar_events(owner_user_id,starts_at);
CREATE TABLE IF NOT EXISTS calendar_event_acknowledgements (
 event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 occurrence_at TEXT NOT NULL,
 acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(event_id,user_id,occurrence_at)
);
