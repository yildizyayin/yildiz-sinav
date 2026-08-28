PRAGMA foreign_keys = ON;

ALTER TABLE assignments ADD COLUMN class_id TEXT REFERENCES classes(id);
ALTER TABLE assignments ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'TASK';

CREATE INDEX IF NOT EXISTS idx_assignments_class_due ON assignments(institution_id,class_id,status,due_at);
