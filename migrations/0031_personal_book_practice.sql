PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personal_book_attempts (
  id TEXT PRIMARY KEY,
  book_item_id TEXT NOT NULL REFERENCES student_personal_book_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  answer TEXT,
  correct INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personal_book_attempt_item
  ON personal_book_attempts(book_item_id,student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_personal_book_attempt_student
  ON personal_book_attempts(student_id,created_at DESC);
