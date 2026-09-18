PRAGMA foreign_keys = ON;

-- RBA and guidance delivery modes. Online assessment remains the default;
-- printed answer sheets are evaluated through the same counselor-review gate.
ALTER TABLE guidance_assessment_instruments ADD COLUMN delivery_modes_json TEXT NOT NULL DEFAULT '["ONLINE"]';
ALTER TABLE guidance_assessment_instruments ADD COLUMN optical_config_json TEXT;

ALTER TABLE guidance_assessment_sessions ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE guidance_assessment_sessions ADD COLUMN optical_batch_id TEXT;
ALTER TABLE guidance_assessment_sessions ADD COLUMN student_number_snapshot TEXT;

CREATE TABLE IF NOT EXISTS guidance_optical_batches (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  instrument_id TEXT NOT NULL REFERENCES guidance_assessment_instruments(id),
  optical_template_version_id TEXT REFERENCES optical_template_versions(id),
  source_file_name TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','COMMITTED','PARTIAL','FAILED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_guidance_optical_batch_scope
  ON guidance_optical_batches(institution_id,instrument_id,created_at DESC);

UPDATE guidance_assessment_instruments
SET delivery_modes_json='["ONLINE","PRINT_OPTICAL"]',
    optical_config_json='{"answerBlockCode":"RBA","scaleMap":{"A":1,"B":2,"C":3,"D":4,"E":5}}'
WHERE active=1;
