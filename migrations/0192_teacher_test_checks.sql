-- Testlerim (owner, 27 Nov 2026): before a test first goes to students (homework, print, board) the teacher confirms
-- the questions suit the class: "testi gönderme sorumluluğu öğretmene aittir". One row per confirmation of one exact
-- set of questions; changing the questions needs a new confirmation.
CREATE TABLE IF NOT EXISTS teacher_test_checks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES studio_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  items_hash TEXT NOT NULL,
  statement TEXT NOT NULL,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teacher_test_checks_doc ON teacher_test_checks(document_id, items_hash);
