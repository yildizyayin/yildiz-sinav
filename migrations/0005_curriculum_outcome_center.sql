PRAGMA foreign_keys = ON;

ALTER TABLE curriculum_versions ADD COLUMN program_code TEXT NOT NULL DEFAULT 'SCHOOL';
ALTER TABLE curriculum_versions ADD COLUMN source_title TEXT;
ALTER TABLE curriculum_versions ADD COLUMN source_published_at TEXT;
ALTER TABLE curriculum_versions ADD COLUMN verified_by TEXT REFERENCES users(id);
ALTER TABLE curriculum_versions ADD COLUMN verified_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_curriculum_program_version
ON curriculum_versions(academic_year, program_code, coalesce(grade_level,0), program_version);

CREATE TABLE IF NOT EXISTS curriculum_import_jobs (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  program_code TEXT NOT NULL CHECK(program_code IN ('SCHOOL','TYT','AYT')),
  grade_level INTEGER,
  program_version TEXT NOT NULL,
  authority TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_published_at TEXT,
  source_file_key TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','READY','COMMITTED','FAILED','CANCELLED')),
  row_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  confirmed_official INTEGER NOT NULL DEFAULT 0,
  curriculum_version_id TEXT REFERENCES curriculum_versions(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  committed_by TEXT REFERENCES users(id),
  committed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_curriculum_import_status ON curriculum_import_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS curriculum_import_rows (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES curriculum_import_jobs(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  subject_code TEXT,
  subject_id TEXT REFERENCES subjects(id),
  grade_level INTEGER,
  outcome_code TEXT,
  topic TEXT,
  subtopic TEXT,
  title TEXT,
  valid INTEGER NOT NULL DEFAULT 0,
  issues_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, row_no)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_import_rows_job ON curriculum_import_rows(job_id, valid, row_no);
