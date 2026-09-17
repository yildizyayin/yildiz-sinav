PRAGMA foreign_keys = ON;

-- A qualified exam is published only after every active question is linked to
-- an official, verified catalog record. Legacy exams remain optional.
ALTER TABLE exams ADD COLUMN outcome_mode TEXT NOT NULL DEFAULT 'OPTIONAL' CHECK(outcome_mode IN ('OPTIONAL','OFFICIAL_REQUIRED'));
CREATE INDEX IF NOT EXISTS idx_exams_outcome_mode ON exams(outcome_mode,status);

-- Keep the source hierarchy instead of flattening units, topics and
-- sub-outcomes into one text field. Existing imports continue to work because
-- the new columns have safe defaults.
ALTER TABLE outcomes ADD COLUMN parent_outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL;
ALTER TABLE outcomes ADD COLUMN node_type TEXT NOT NULL DEFAULT 'OUTCOME';
ALTER TABLE outcomes ADD COLUMN unit TEXT;
CREATE INDEX IF NOT EXISTS idx_outcomes_hierarchy ON outcomes(curriculum_version_id,subject_id,parent_outcome_id,node_type);

ALTER TABLE curriculum_import_rows ADD COLUMN parent_code TEXT;
ALTER TABLE curriculum_import_rows ADD COLUMN node_type TEXT NOT NULL DEFAULT 'OUTCOME';
ALTER TABLE curriculum_import_rows ADD COLUMN unit TEXT;
