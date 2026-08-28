PRAGMA foreign_keys = ON;

ALTER TABLE import_jobs ADD COLUMN original_file_name TEXT;
ALTER TABLE import_jobs ADD COLUMN file_sha256 TEXT;
ALTER TABLE import_jobs ADD COLUMN row_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN error_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN skipped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN commit_summary_json TEXT;
ALTER TABLE import_jobs ADD COLUMN rolled_back_at TEXT;
ALTER TABLE import_jobs ADD COLUMN rolled_back_by TEXT REFERENCES users(id);

ALTER TABLE import_staging_rows ADD COLUMN resolution TEXT NOT NULL DEFAULT 'IMPORT'
  CHECK(resolution IN ('IMPORT','SKIP','MATCH'));
ALTER TABLE import_staging_rows ADD COLUMN resolution_note TEXT;
ALTER TABLE import_staging_rows ADD COLUMN resolved_by TEXT REFERENCES users(id);
ALTER TABLE import_staging_rows ADD COLUMN resolved_at TEXT;

CREATE TABLE IF NOT EXISTS import_commit_mutations (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id),
  staging_row_id TEXT REFERENCES import_staging_rows(id),
  mutation_type TEXT NOT NULL CHECK(mutation_type IN ('STUDENT_CREATED','ENROLLMENT_CREATED','CLASS_CREATED','EXTERNAL_ID_CREATED')),
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(import_job_id,mutation_type,entity_id)
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_scope_history
  ON import_jobs(institution_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_mutations_job
  ON import_commit_mutations(import_job_id,mutation_type);
