PRAGMA foreign_keys = ON;

-- Old cycles may have silently reused questions; never label them NEW.
ALTER TABLE coach_mini_tests ADD COLUMN selection_mode TEXT NOT NULL DEFAULT 'LEGACY'
  CHECK(selection_mode IN ('LEGACY','NEW','REPEAT'));

-- A batch allocating NEW questions must reserve them exactly once per student.
CREATE TABLE IF NOT EXISTS coach_question_exposures (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_bank(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id,question_id)
);
INSERT OR IGNORE INTO coach_question_exposures(student_id,question_id)
SELECT t.student_id,q.question_id FROM coach_mini_tests t
JOIN coach_mini_test_questions q ON q.test_id=t.id;
