PRAGMA foreign_keys = ON;

ALTER TABLE institutions ADD COLUMN demo_mode INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS worksheet_assignments (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_worksheet_assignments_scope ON worksheet_assignments(institution_id, class_id, status);

CREATE TABLE IF NOT EXISTS bulk_operation_jobs (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  operation_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('PREVIEW','RUNNING','COMPLETED','FAILED')),
  payload_json TEXT,
  summary_json TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_bulk_jobs_scope ON bulk_operation_jobs(institution_id, created_at);
