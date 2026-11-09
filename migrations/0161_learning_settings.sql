-- Birleşik Karne (owner, 9 Nov 2026): how many different questions each outcome should reach for a student.
-- Default 30; an institution may choose between 20 and 100.
CREATE TABLE IF NOT EXISTS institution_learning_settings (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  outcome_question_target INTEGER NOT NULL DEFAULT 30 CHECK(outcome_question_target BETWEEN 20 AND 100),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
