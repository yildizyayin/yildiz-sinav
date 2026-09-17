PRAGMA foreign_keys = ON;

-- A participant can belong to multiple comparison scopes at once (e.g. a national exam and a chain network).
CREATE TABLE IF NOT EXISTS exam_result_scope_ranks (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('NATIONAL','CITY','DISTRICT','NETWORK','INSTITUTION','GRADE','CLASS')),
  scope_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  participant_count INTEGER NOT NULL,
  score REAL,
  net REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,participant_id,snapshot_version,scope_type,scope_id)
);
CREATE INDEX IF NOT EXISTS idx_scope_rank_lookup ON exam_result_scope_ranks(exam_id,snapshot_version,participant_id,scope_type);
CREATE INDEX IF NOT EXISTS idx_scope_rank_leaderboard ON exam_result_scope_ranks(exam_id,snapshot_version,scope_type,scope_id,rank);

-- Existing exams are made visible to the new Exam Center without forcing institutions to recreate them.
INSERT OR IGNORE INTO exam_delivery_profiles(exam_id,scope,verified_catalog,result_freeze_status,snapshot_version,created_at,updated_at)
SELECT id,
       CASE WHEN owner_type='CENTRAL' THEN 'CENTRAL' ELSE 'INSTITUTION' END,
       CASE WHEN owner_type='CENTRAL' THEN 1 ELSE 0 END,
       'OPEN',0,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM exams;

-- Publisher question analytics snapshots can be materialized per exam after result publication.
CREATE TABLE IF NOT EXISTS publisher_question_analytics (
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL,
  exam_question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  question_no INTEGER NOT NULL,
  participant_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  blank_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  success_percent REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(exam_id,snapshot_version,exam_question_id)
);
CREATE INDEX IF NOT EXISTS idx_publisher_question_analytics_exam ON publisher_question_analytics(exam_id,snapshot_version,subject_id,question_no);

-- Personal book generation records keep the source student and learning-state snapshot auditable.
CREATE TABLE IF NOT EXISTS personal_book_profiles (
  document_id TEXT PRIMARY KEY REFERENCES studio_documents(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  source_exam_id TEXT REFERENCES exams(id),
  weak_nodes_json TEXT,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Mobile clients use device registrations for push later; tokens are provider-neutral until App Store/Play setup.
CREATE TABLE IF NOT EXISTS mobile_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK(platform IN ('IOS','ANDROID','WEB')),
  device_key TEXT NOT NULL,
  push_provider TEXT,
  push_token TEXT,
  app_version TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,platform,device_key)
);
CREATE INDEX IF NOT EXISTS idx_mobile_devices_user ON mobile_devices(user_id,active);
