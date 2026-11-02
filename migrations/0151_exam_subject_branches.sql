-- Alt ders (owner decision 2 Nov): which questions of a test belong to which sub-subject, entered on the exam card
-- as a question range by position within the test (e.g. TYT Sosyal: Tarih 1–5). Only frozen results made after the
-- ranges are saved carry sub-subject rows; published totals, scores and ranks are never recalculated from them.
CREATE TABLE IF NOT EXISTS exam_subject_branches (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  branch_code TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  question_start INTEGER NOT NULL CHECK(question_start >= 1),
  question_end INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(question_end >= question_start),
  UNIQUE(exam_id, branch_code)
);
CREATE INDEX IF NOT EXISTS idx_exam_subject_branches_exam ON exam_subject_branches(exam_id, subject_id, sort_order);
