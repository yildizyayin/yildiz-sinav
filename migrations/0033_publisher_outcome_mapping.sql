PRAGMA foreign_keys = ON;

-- Publisher labels are preserved verbatim and mapped to the canonical curriculum
-- only after a confidence-scored review.
CREATE TABLE IF NOT EXISTS publisher_outcome_labels (
  id TEXT PRIMARY KEY,
  publisher_id TEXT REFERENCES publishers(id),
  academic_year TEXT NOT NULL,
  program_code TEXT NOT NULL CHECK(program_code IN ('SCHOOL','TYT','AYT')),
  grade_level INTEGER,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  publisher_code TEXT,
  label_path_json TEXT NOT NULL,
  detected_grade_level INTEGER,
  canonical_outcome_id TEXT REFERENCES outcomes(id),
  mapping_status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
    CHECK(mapping_status IN ('REVIEW_REQUIRED','SUGGESTED','APPROVED','REJECTED')),
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence >= 0 AND confidence <= 1),
  review_note TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(publisher_id,academic_year,program_code,subject_id,publisher_code,label_path_json)
);
CREATE INDEX IF NOT EXISTS idx_publisher_outcome_review
ON publisher_outcome_labels(mapping_status,publisher_id,academic_year,subject_id);

CREATE TABLE IF NOT EXISTS question_publisher_outcomes (
  exam_question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  publisher_outcome_id TEXT NOT NULL REFERENCES publisher_outcome_labels(id),
  PRIMARY KEY(exam_question_id,publisher_outcome_id)
);

CREATE TABLE IF NOT EXISTS exam_source_packages (
  exam_id TEXT PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL DEFAULT 'USER_PROVIDED',
  source_exam_id TEXT,
  source_file_name TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  rights_basis TEXT NOT NULL DEFAULT 'USER_PROVIDED'
    CHECK(rights_basis IN ('OWNED','WRITTEN_LICENSE','USER_PROVIDED','RESTRICTED_REFERENCE')),
  contains_question_text INTEGER NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'DECLARED'
    CHECK(verification_status IN ('DECLARED','VERIFIED','REJECTED')),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

