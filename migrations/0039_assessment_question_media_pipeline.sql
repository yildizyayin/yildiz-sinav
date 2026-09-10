PRAGMA foreign_keys = ON;

-- Rich question content. A question may be text-only, image-only, or a mixed packet.
ALTER TABLE question_bank ADD COLUMN content_mode TEXT NOT NULL DEFAULT 'TEXT'
  CHECK(content_mode IN ('TEXT','IMAGE','MIXED'));
ALTER TABLE question_bank ADD COLUMN option_count INTEGER NOT NULL DEFAULT 4
  CHECK(option_count IN (4,5));
ALTER TABLE question_bank ADD COLUMN prior_grade_refs_json TEXT;
ALTER TABLE question_bank ADD COLUMN lgs_probability REAL CHECK(lgs_probability IS NULL OR lgs_probability BETWEEN 0 AND 1);
ALTER TABLE question_bank ADD COLUMN yks_probability REAL CHECK(yks_probability IS NULL OR yks_probability BETWEEN 0 AND 1);
ALTER TABLE question_bank ADD COLUMN exam_5y_count INTEGER CHECK(exam_5y_count IS NULL OR exam_5y_count >= 0);
CREATE INDEX IF NOT EXISTS idx_question_bank_content_mode
  ON question_bank(review_status,grade_level,subject_id,content_mode,option_count);

ALTER TABLE question_assets ADD COLUMN placement TEXT NOT NULL DEFAULT 'STEM'
  CHECK(placement IN ('STEM','SOLUTION','OPTION'));
ALTER TABLE question_assets ADD COLUMN option_label TEXT;
ALTER TABLE question_assets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE question_assets ADD COLUMN alt_text TEXT;
ALTER TABLE question_assets ADD COLUMN mime_type TEXT;
ALTER TABLE question_assets ADD COLUMN width INTEGER;
ALTER TABLE question_assets ADD COLUMN height INTEGER;
ALTER TABLE question_assets ADD COLUMN rights_status TEXT NOT NULL DEFAULT 'DECLARED'
  CHECK(rights_status IN ('DECLARED','VERIFIED','REJECTED'));
CREATE INDEX IF NOT EXISTS idx_question_assets_question_order
  ON question_assets(question_id,placement,sort_order);

CREATE TABLE IF NOT EXISTS question_content_blocks (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK(block_type IN ('TEXT','IMAGE','TABLE','FORMULA','DIAGRAM','AUDIO','VIDEO')),
  placement TEXT NOT NULL DEFAULT 'STEM' CHECK(placement IN ('STEM','SOLUTION','OPTION')),
  option_label TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  text_content TEXT,
  asset_id TEXT REFERENCES question_assets(id) ON DELETE SET NULL,
  payload_json TEXT,
  alt_text TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(block_type <> 'TEXT' OR text_content IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_question_blocks_question
  ON question_content_blocks(question_id,placement,sort_order);

-- One measurement envelope for digital, PDF/optical, deneme, föy, external and pool sources.
CREATE TABLE IF NOT EXISTS assessment_runs (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  student_id TEXT REFERENCES student_entities(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('EXAM','ASSIGNMENT','FOY','EXTERNAL','QUESTION_BANK','MINI_TEST')),
  source_id TEXT,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  exam_id TEXT REFERENCES exams(id) ON DELETE SET NULL,
  booklet_code TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'DIGITAL' CHECK(delivery_mode IN ('DIGITAL','PDF','OPTICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SUBMITTED','SCORED','CANCELLED')),
  score REAL,
  metadata_json TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_assessment_runs_student
  ON assessment_runs(student_id,source_type,started_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessment_runs_source
  ON assessment_runs(source_type,source_id,started_at DESC);

CREATE TABLE IF NOT EXISTS assessment_responses (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  question_id TEXT REFERENCES question_bank(id) ON DELETE SET NULL,
  node_id TEXT REFERENCES learning_nodes(id) ON DELETE SET NULL,
  selected_answer TEXT,
  is_correct INTEGER,
  source_channel TEXT NOT NULL DEFAULT 'DIGITAL' CHECK(source_channel IN ('DIGITAL','PDF','OPTICAL','IMPORT')),
  response_time_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id,question_id)
);
CREATE INDEX IF NOT EXISTS idx_assessment_responses_student
  ON assessment_responses(student_id,created_at DESC);

-- A small scope table makes branch ownership explicit while retaining existing teacher_assignments data.
CREATE TABLE IF NOT EXISTS teacher_question_scopes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,institution_id,subject_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_question_scopes_subject
  ON teacher_question_scopes(institution_id,subject_id,active);
