PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  attendance_date TEXT NOT NULL,
  period_label TEXT NOT NULL DEFAULT 'Günlük',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','FINALIZED')),
  note TEXT,
  taken_by TEXT NOT NULL REFERENCES users(id),
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,attendance_date,period_label)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  note TEXT,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(session_id,student_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_sessions(institution_id,attendance_date,class_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_records(student_id,attendance_status);
