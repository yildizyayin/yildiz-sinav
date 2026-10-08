-- Transport state is durable; expiry/publication/tombstones remain authoritative.
CREATE TABLE IF NOT EXISTS result_retention_queue_jobs (
 kind TEXT NOT NULL CHECK(kind IN ('COHORT_PURGE','ARTIFACT_SWEEP')),
 administration_id TEXT NOT NULL,
 dispatch_token TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','ERROR','DONE')),
 next_dispatch_at TEXT NOT NULL,
 last_dispatched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_processed_at TEXT,
 processed_pages INTEGER NOT NULL DEFAULT 0,
 failure_count INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(kind,administration_id)
);
CREATE INDEX IF NOT EXISTS idx_result_retention_queue_dispatch ON result_retention_queue_jobs(next_dispatch_at,status);
CREATE INDEX IF NOT EXISTS idx_result_retention_event_administration ON result_retention_events(administration_id,event_type);
