PRAGMA foreign_keys = ON;

ALTER TABLE worksheets ADD COLUMN series_code TEXT NOT NULL DEFAULT 'BLUE';
ALTER TABLE worksheets ADD COLUMN series_sequence_no INTEGER;
ALTER TABLE worksheets ADD COLUMN questions_per_subject INTEGER NOT NULL DEFAULT 10;

UPDATE worksheets
SET series_sequence_no=sequence_no,
    series_code='BLUE',
    questions_per_subject=10
WHERE series_sequence_no IS NULL;

CREATE INDEX IF NOT EXISTS idx_worksheets_series_catalog
  ON worksheets(academic_year,series_code,grade_level,track,series_sequence_no,status);
