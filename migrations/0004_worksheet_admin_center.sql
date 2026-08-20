PRAGMA foreign_keys = ON;

ALTER TABLE worksheets ADD COLUMN program_code TEXT NOT NULL DEFAULT 'SCHOOL';

CREATE UNIQUE INDEX IF NOT EXISTS idx_worksheet_program_slot
ON worksheets(academic_year, program_code, coalesce(grade_level,0), track, sequence_no);

CREATE TABLE IF NOT EXISTS worksheet_outcomes (
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  PRIMARY KEY(worksheet_id, outcome_id)
);
CREATE INDEX IF NOT EXISTS idx_worksheet_outcomes_subject ON worksheet_outcomes(worksheet_id, subject_id);

CREATE TABLE IF NOT EXISTS worksheet_question_links (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  question_no INTEGER NOT NULL,
  outcome_id TEXT REFERENCES outcomes(id),
  solution_url TEXT,
  topic_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worksheet_id, subject_id, question_no)
);
CREATE INDEX IF NOT EXISTS idx_worksheet_question_links ON worksheet_question_links(worksheet_id, subject_id, question_no);
