PRAGMA foreign_keys = ON;

-- Optical/FMT is configured after the exam exists. One exam can use a
-- different published optical definition per booklet, while all assessment
-- channels continue to reference the same exam_id.
CREATE TABLE IF NOT EXISTS exam_optical_bindings (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  booklet_code TEXT NOT NULL,
  optical_template_version_id TEXT NOT NULL REFERENCES optical_template_versions(id),
  input_modes_json TEXT NOT NULL DEFAULT '["TXT","DAT","CAMERA"]',
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id, booklet_code)
);
CREATE INDEX IF NOT EXISTS idx_exam_optical_bindings_exam ON exam_optical_bindings(exam_id, active, booklet_code);
CREATE INDEX IF NOT EXISTS idx_exam_optical_bindings_template ON exam_optical_bindings(optical_template_version_id, active);
