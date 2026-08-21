PRAGMA foreign_keys = ON;

ALTER TABLE parent_student_links ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
