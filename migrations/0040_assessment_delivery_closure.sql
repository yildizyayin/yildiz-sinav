PRAGMA foreign_keys = ON;

-- Generated question-pool outputs are immutable, tenant-scoped delivery assets.
CREATE TABLE IF NOT EXISTS studio_document_assets (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES studio_documents(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  booklet_code TEXT NOT NULL DEFAULT 'A' CHECK(booklet_code IN ('A','B')),
  asset_type TEXT NOT NULL CHECK(asset_type IN ('QUESTION_PDF','ANSWER_KEY','OPTICAL_FORM')),
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id, booklet_code, asset_type)
);
CREATE INDEX IF NOT EXISTS idx_studio_document_assets_scope
  ON studio_document_assets(institution_id, document_id, booklet_code, asset_type);

-- Normalized import envelope for results coming from another publisher or exam system.
CREATE TABLE IF NOT EXISTS external_assessment_records (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  source_label TEXT NOT NULL,
  title TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id),
  score REAL NOT NULL CHECK(score BETWEEN 0 AND 1),
  correct_count INTEGER,
  wrong_count INTEGER,
  blank_count INTEGER,
  observed_at TEXT NOT NULL,
  imported_by TEXT NOT NULL REFERENCES users(id),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, student_id, external_key)
);
CREATE INDEX IF NOT EXISTS idx_external_assessment_student
  ON external_assessment_records(institution_id, student_id, observed_at DESC);
