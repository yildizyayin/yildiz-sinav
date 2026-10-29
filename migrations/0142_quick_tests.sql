PRAGMA foreign_keys = ON;

-- S044 Hızlı Test: a teacher builds a test by cropping questions from a PDF or photo (or from Studio's approved pool),
-- prints it with an optical form and answer key, or runs it as a timed online exam joined with a code.
-- Cropped questions are private to the institution; they never enter the governed question pool by themselves.
CREATE TABLE IF NOT EXISTS quick_tests (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  grade_level INTEGER,
  subject_label TEXT,
  option_count INTEGER NOT NULL DEFAULT 4 CHECK(option_count IN (4,5)),
  source_kind TEXT NOT NULL DEFAULT 'CROP' CHECK(source_kind IN ('CROP','POOL')),
  studio_document_id TEXT REFERENCES studio_documents(id) ON DELETE SET NULL,
  rights_declared_by TEXT REFERENCES users(id),
  rights_declared_at TEXT,
  layout_json TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quick_tests_institution ON quick_tests(institution_id,status,updated_at);

CREATE TABLE IF NOT EXISTS quick_test_questions (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES quick_tests(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('IMAGE','BANK')),
  image_key TEXT,
  image_width INTEGER,
  image_height INTEGER,
  question_bank_id TEXT REFERENCES question_bank(id),
  correct_answer TEXT CHECK(correct_answer IS NULL OR correct_answer IN ('A','B','C','D','E','X')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((kind='IMAGE' AND image_key IS NOT NULL) OR (kind='BANK' AND question_bank_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_quick_test_questions ON quick_test_questions(test_id,sort_order);

CREATE TABLE IF NOT EXISTS quick_test_sessions (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES quick_tests(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 300),
  shuffle_questions INTEGER NOT NULL DEFAULT 1,
  result_mode TEXT NOT NULL DEFAULT 'AFTER_SUBMIT' CHECK(result_mode IN ('AFTER_SUBMIT','AFTER_CLOSE','HIDDEN')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_quick_test_sessions_test ON quick_test_sessions(test_id,created_at);

-- An attempt is either online (code + name + number, a device token) or a paper sheet read with the phone camera.
CREATE TABLE IF NOT EXISTS quick_test_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES quick_test_sessions(id) ON DELETE CASCADE,
  test_id TEXT NOT NULL REFERENCES quick_tests(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('ONLINE','PAPER')),
  taker_name TEXT NOT NULL,
  taker_number TEXT NOT NULL,
  taker_class TEXT,
  token_hash TEXT,
  question_order_json TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deadline_at TEXT,
  submitted_at TEXT,
  correct_count INTEGER,
  wrong_count INTEGER,
  blank_count INTEGER,
  net REAL,
  score REAL,
  ip_hash TEXT,
  created_by TEXT REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quick_test_attempt_taker ON quick_test_attempts(session_id,taker_number) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quick_test_attempts_test ON quick_test_attempts(test_id,channel,submitted_at);
