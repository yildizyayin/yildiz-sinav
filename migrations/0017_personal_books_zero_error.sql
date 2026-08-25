PRAGMA foreign_keys = ON;

-- Standard student publishing products.
-- Source exam questions are referenced for learning evidence; printable content must come
-- from approved OWNED/LICENSED/PUBLIC_DOMAIN question-bank material.

CREATE TABLE IF NOT EXISTS student_personal_books (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year TEXT,
  grade_level INTEGER,
  title TEXT NOT NULL DEFAULT 'Kişiye Özel Kitabım',
  source_mode TEXT NOT NULL DEFAULT 'WEAK_OUTCOMES' CHECK(source_mode IN ('WEAK_OUTCOMES','TARGET_GAPS','MIXED')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','READY','GENERATING_PDF','PUBLISHED','ARCHIVED')),
  outcome_count INTEGER NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  pdf_r2_key TEXT,
  generated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_personal_books_student ON student_personal_books(student_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS student_personal_book_items (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES student_personal_books(id) ON DELETE CASCADE,
  outcome_id TEXT REFERENCES outcomes(id),
  subject_id TEXT REFERENCES subjects(id),
  bank_question_id TEXT REFERENCES question_bank(id),
  source_exam_question_id TEXT REFERENCES exam_questions(id),
  item_type TEXT NOT NULL CHECK(item_type IN ('OUTCOME_HEADER','PRACTICE_QUESTION','SOURCE_REVIEW','MICRO_VIDEO','NOTE')),
  difficulty INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_personal_book_items_book ON student_personal_book_items(book_id,sort_order);

CREATE TABLE IF NOT EXISTS zero_error_booklets (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  source_exam_id TEXT REFERENCES exams(id),
  title TEXT NOT NULL DEFAULT 'Sıfır Hata Kitapçığım',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','READY','GENERATING_PDF','COMPLETED','ARCHIVED')),
  wrong_count INTEGER NOT NULL DEFAULT 0,
  blank_count INTEGER NOT NULL DEFAULT 0,
  practice_count INTEGER NOT NULL DEFAULT 0,
  unresolved_count INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  pdf_r2_key TEXT,
  generated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_zero_error_student ON zero_error_booklets(student_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS zero_error_booklet_items (
  id TEXT PRIMARY KEY,
  booklet_id TEXT NOT NULL REFERENCES zero_error_booklets(id) ON DELETE CASCADE,
  source_exam_question_id TEXT NOT NULL REFERENCES exam_questions(id),
  outcome_id TEXT REFERENCES outcomes(id),
  subject_id TEXT REFERENCES subjects(id),
  original_status TEXT NOT NULL CHECK(original_status IN ('WRONG','BLANK')),
  bank_question_id TEXT REFERENCES question_bank(id),
  cycle_no INTEGER NOT NULL DEFAULT 1,
  item_status TEXT NOT NULL DEFAULT 'TO_REVIEW' CHECK(item_status IN ('TO_REVIEW','PRACTICE_READY','MASTERED','NEEDS_REPEAT')),
  last_score REAL,
  last_attempt_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_zero_error_items_booklet ON zero_error_booklet_items(booklet_id,item_status,sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zero_error_source_per_cycle ON zero_error_booklet_items(booklet_id,source_exam_question_id,cycle_no);

CREATE TABLE IF NOT EXISTS zero_error_attempts (
  id TEXT PRIMARY KEY,
  booklet_item_id TEXT NOT NULL REFERENCES zero_error_booklet_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  answer TEXT,
  correct INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_zero_error_attempts_item ON zero_error_attempts(booklet_item_id,created_at DESC);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('PERSONAL_BOOK','Kişiye Özel Kitap','STANDARD',1),
 ('ZERO_ERROR_BOOKLET','Sıfır Hata Kitapçığı','STANDARD',1);
