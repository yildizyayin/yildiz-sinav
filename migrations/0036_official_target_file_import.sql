PRAGMA foreign_keys = ON;

-- Staged, reviewable and reversible official MEB/ÖSYM/YÖK target imports.
CREATE TABLE IF NOT EXISTS academic_target_import_jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES academic_target_sources(id),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('MEB_ROTA_MAARIF','MEB_EOKUL','OSYM','YOK_ATLAS')),
  data_year INTEGER NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_verified_at TEXT NOT NULL,
  source_file_key TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  mapping_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PREVIEW'
    CHECK(status IN ('PREVIEW','READY','COMMITTING','COMMITTED','FAILED','ROLLED_BACK')),
  row_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  previous_import_status TEXT,
  previous_last_imported_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  committed_by TEXT REFERENCES users(id),
  rolled_back_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at TEXT,
  rolled_back_at TEXT,
  rollback_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_target_import_jobs_source ON academic_target_import_jobs(source_kind,data_year,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_target_import_jobs_status ON academic_target_import_jobs(status,created_at DESC);

CREATE TABLE IF NOT EXISTS academic_target_import_rows (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES academic_target_import_jobs(id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  mapped_json TEXT NOT NULL,
  valid INTEGER NOT NULL DEFAULT 0 CHECK(valid IN (0,1)),
  issues_json TEXT NOT NULL DEFAULT '[]',
  target_id TEXT,
  mutation TEXT CHECK(mutation IN ('CREATED','UPDATED')),
  before_json TEXT,
  UNIQUE(job_id,row_no)
);
CREATE INDEX IF NOT EXISTS idx_target_import_rows_job ON academic_target_import_rows(job_id,row_no);

