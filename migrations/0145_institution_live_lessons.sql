PRAGMA foreign_keys = ON;

-- S048 (D-S046/D-S047): the institution's own live lessons. ANUNEX keeps only the timetable entry and the
-- institution's meeting link (Zoom/Teams/Meet); video, recording and payment stay with the institution.
CREATE TABLE IF NOT EXISTS institution_live_lessons (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id),
  title TEXT NOT NULL,
  teacher_user_id TEXT REFERENCES users(id),
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 10 AND 240),
  provider TEXT NOT NULL CHECK(provider IN ('ZOOM','TEAMS','MEET','OTHER')),
  join_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','CANCELLED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_lessons_class ON institution_live_lessons(class_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_live_lessons_institution ON institution_live_lessons(institution_id, starts_at);

-- "Uzaktan eğitim modu": a date range during which the institution teaches online (holiday, closure, pandemic).
CREATE TABLE IF NOT EXISTS institution_remote_modes (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  note TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- The LIVE feature now means the institution's own live lessons (off by default; the Super Admin turns it on for
-- app-licensed institutions). The old paid, credit-based booking is retired (D-S046).
UPDATE platform_features SET label='Kurum Canlı Dersi' WHERE feature_key='LIVE';
