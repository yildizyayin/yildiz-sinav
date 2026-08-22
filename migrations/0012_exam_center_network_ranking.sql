PRAGMA foreign_keys = ON;

-- Exam Center V3: institution / network / central exam scopes, verified publisher catalog,
-- ranking snapshots and read-optimized result delivery.

ALTER TABLE exams ADD COLUMN scope_type TEXT NOT NULL DEFAULT 'INSTITUTION' CHECK(scope_type IN ('INSTITUTION','NETWORK','CENTRAL'));
ALTER TABLE exams ADD COLUMN publisher_name TEXT;
ALTER TABLE exams ADD COLUMN series_name TEXT;
ALTER TABLE exams ADD COLUMN exam_code TEXT;
ALTER TABLE exams ADD COLUMN verified_catalog INTEGER NOT NULL DEFAULT 0;
ALTER TABLE exams ADD COLUMN default_optical_template_version_id TEXT REFERENCES optical_template_versions(id);
ALTER TABLE exams ADD COLUMN data_closes_at TEXT;
ALTER TABLE exams ADD COLUMN result_release_at TEXT;
ALTER TABLE exams ADD COLUMN ranking_status TEXT NOT NULL DEFAULT 'OPEN' CHECK(ranking_status IN ('OPEN','FROZEN','CALCULATING','READY','PUBLISHED'));
ALTER TABLE exams ADD COLUMN ranking_snapshot_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_catalog_code ON exams(exam_code) WHERE exam_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exams_scope_catalog ON exams(scope_type, verified_catalog, academic_year, exam_type, status);

CREATE TABLE IF NOT EXISTS organization_networks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS organization_institutions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization_networks(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  region_name TEXT,
  is_headquarters INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, institution_id)
);
CREATE INDEX IF NOT EXISTS idx_org_inst_org ON organization_institutions(organization_id, active);
CREATE INDEX IF NOT EXISTS idx_org_inst_institution ON organization_institutions(institution_id, active);

CREATE TABLE IF NOT EXISTS organization_user_access (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization_networks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'VIEW' CHECK(access_level IN ('VIEW','MANAGE')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_user_access ON organization_user_access(user_id, active);

CREATE TABLE IF NOT EXISTS exam_networks (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organization_networks(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id, organization_id)
);

CREATE TABLE IF NOT EXISTS exam_data_submissions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  scan_batch_id TEXT REFERENCES scan_batches(id),
  source_file_name TEXT,
  record_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  submitted_by TEXT REFERENCES users(id),
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK(status IN ('RECEIVED','PROCESSED','NEEDS_REVIEW','REJECTED'))
);
CREATE INDEX IF NOT EXISTS idx_exam_submissions_exam_inst ON exam_data_submissions(exam_id, institution_id, submitted_at);

CREATE TABLE IF NOT EXISTS exam_ranking_snapshots (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'CALCULATING' CHECK(status IN ('CALCULATING','READY','PUBLISHED','SUPERSEDED','FAILED')),
  participant_count INTEGER NOT NULL DEFAULT 0,
  institution_count INTEGER NOT NULL DEFAULT 0,
  generated_at TEXT,
  published_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id, version)
);
CREATE INDEX IF NOT EXISTS idx_rank_snapshot_exam ON exam_ranking_snapshots(exam_id, status, version);

CREATE TABLE IF NOT EXISTS exam_ranking_entries (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES exam_ranking_snapshots(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  student_id TEXT REFERENCES student_entities(id),
  city TEXT,
  district TEXT,
  organization_id TEXT REFERENCES organization_networks(id),
  grade_level INTEGER,
  section TEXT,
  score REAL,
  net REAL NOT NULL DEFAULT 0,
  participant_status TEXT NOT NULL,
  turkey_rank INTEGER,
  turkey_total INTEGER,
  city_rank INTEGER,
  city_total INTEGER,
  district_rank INTEGER,
  district_total INTEGER,
  organization_rank INTEGER,
  organization_total INTEGER,
  institution_rank INTEGER,
  institution_total INTEGER,
  grade_rank INTEGER,
  grade_total INTEGER,
  section_rank INTEGER,
  section_total INTEGER,
  percentile REAL,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_rank_entry_student ON exam_ranking_entries(exam_id, student_id, snapshot_id);
CREATE INDEX IF NOT EXISTS idx_rank_entry_inst ON exam_ranking_entries(snapshot_id, institution_id, turkey_rank);
CREATE INDEX IF NOT EXISTS idx_rank_entry_city ON exam_ranking_entries(snapshot_id, city, city_rank);
CREATE INDEX IF NOT EXISTS idx_rank_entry_org ON exam_ranking_entries(snapshot_id, organization_id, organization_rank);

CREATE TABLE IF NOT EXISTS exam_result_release_log (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  snapshot_id TEXT REFERENCES exam_ranking_snapshots(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('FREEZE','BUILD','PUBLISH','UNPUBLISH')),
  actor_user_id TEXT REFERENCES users(id),
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One participant must produce exactly one ranking-source row. Network membership is selected
-- later by the ranking builder according to the exam's linked organization, preventing duplicates
-- when one institution belongs to multiple enterprise networks.
CREATE VIEW IF NOT EXISTS v_exam_ranking_source AS
SELECT
  ep.id AS participant_id,
  ep.exam_id,
  ep.institution_id,
  ep.student_id,
  ep.participant_status,
  ep.class_snapshot,
  i.city,
  i.district,
  se.grade_level,
  se.section,
  er.score,
  er.net,
  er.success_percent
FROM exam_participants ep
JOIN institutions i ON i.id = ep.institution_id
JOIN exam_results er ON er.participant_id = ep.id
LEFT JOIN student_enrollments se ON se.student_id = ep.student_id AND se.institution_id = ep.institution_id AND se.status = 'ACTIVE';
