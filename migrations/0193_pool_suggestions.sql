-- "Havuza öner" (owner, 27 Nov 2026): a teacher may suggest a question they cropped for the shared pool. The teacher
-- declares that they wrote it or that it belongs to the institution and allows ANUNEX to use it; the suggestion only
-- waits for the editorial team. Nothing enters question_bank from here by itself: the team writes and approves the
-- pool question through the normal review, then records the decision here.
CREATE TABLE IF NOT EXISTS pool_suggestions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  quick_test_question_id TEXT,
  image_key TEXT NOT NULL,
  image_width INTEGER,
  image_height INTEGER,
  correct_answer TEXT,
  grade_level INTEGER,
  subject_label TEXT,
  note TEXT,
  statement TEXT NOT NULL,
  suggested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED')),
  review_note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  question_bank_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pool_suggestions_status ON pool_suggestions(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_suggestions_question ON pool_suggestions(quick_test_question_id) WHERE quick_test_question_id IS NOT NULL;
