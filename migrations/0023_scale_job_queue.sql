CREATE TABLE IF NOT EXISTS scale_async_jobs (
  id TEXT PRIMARY KEY,
  institution_id TEXT,
  job_type TEXT NOT NULL CHECK(job_type IN ('LOAD_PROBE','OPTICAL_BATCH','EVALUATION_BATCH','REPORT_EXPORT','IMPORT_BATCH')),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  progress_total INTEGER NOT NULL DEFAULT 0,
  progress_done INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  requested_by TEXT,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (institution_id) REFERENCES institutions(id),
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_scale_async_jobs_status_queued
ON scale_async_jobs(status, queued_at);

CREATE INDEX IF NOT EXISTS idx_scale_async_jobs_institution
ON scale_async_jobs(institution_id, queued_at DESC);

CREATE TABLE IF NOT EXISTS scale_probe_samples (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  sample_kind TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  rows_observed INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES scale_async_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scale_probe_samples_job
ON scale_probe_samples(job_id, created_at);
