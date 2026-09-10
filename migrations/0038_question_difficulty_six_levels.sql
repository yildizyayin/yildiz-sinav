PRAGMA foreign_keys=ON;

ALTER TABLE question_bank ADD COLUMN difficulty_level INTEGER NOT NULL DEFAULT 3 CHECK (difficulty_level BETWEEN 1 AND 6);

UPDATE question_bank
SET difficulty_level = CASE
  WHEN difficulty BETWEEN 1 AND 5 THEN difficulty
  ELSE 3
END;

CREATE INDEX IF NOT EXISTS idx_question_bank_difficulty_level
  ON question_bank(grade_level, subject_id, difficulty_level, review_status);

CREATE TABLE IF NOT EXISTS question_practice_attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  selected_answer TEXT,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_question_practice_attempts_student
  ON question_practice_attempts(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_practice_attempts_question
  ON question_practice_attempts(student_id, question_id, created_at DESC);
