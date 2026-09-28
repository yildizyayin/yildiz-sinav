PRAGMA foreign_keys = ON;

-- Logical questions may have different printed numbers in A/B/C/D booklets.
-- Keep that mapping separate from the canonical question identity.
CREATE TABLE IF NOT EXISTS exam_question_booklet_orders (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  exam_question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  booklet_code TEXT NOT NULL,
  printed_question_no INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_question_id, booklet_code)
);

CREATE INDEX IF NOT EXISTS idx_exam_question_booklet_orders_lookup
  ON exam_question_booklet_orders(exam_id, booklet_code, printed_question_no);
