-- Nibiru denemesi (owner, 11 Nov 2026): 10 or 20 new questions from the student's own grade and year, weaker
-- outcomes first. Answers go into the karne through question_practice_attempts.
CREATE TABLE IF NOT EXISTS nibiru_practice_exams (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  subject_id TEXT REFERENCES subjects(id),
  question_count INTEGER NOT NULL CHECK(question_count IN (10,20)),
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','SUBMITTED')),
  correct_count INTEGER,
  blank_count INTEGER,
  score_percent REAL,
  client_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  UNIQUE(student_id,client_key)
);
CREATE INDEX IF NOT EXISTS idx_nibiru_exams_student ON nibiru_practice_exams(student_id,created_at DESC);
CREATE TABLE IF NOT EXISTS nibiru_practice_exam_items (
  exam_id TEXT NOT NULL REFERENCES nibiru_practice_exams(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  question_id TEXT NOT NULL REFERENCES question_bank(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  snapshot_json TEXT NOT NULL,
  student_answer TEXT,
  correct INTEGER,
  PRIMARY KEY(exam_id,seq)
);
