CREATE TABLE result_artifact_queue_jobs (
 kind TEXT NOT NULL CHECK(kind IN ('PREPARE','VERIFY')),
 administration_id TEXT NOT NULL,
 snapshot_version INTEGER NOT NULL,
 source_generation INTEGER NOT NULL,
 dispatch_token TEXT NOT NULL,
 page_cursor TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('PENDING','ERROR','DONE')),
 next_dispatch_at TEXT NOT NULL,
 last_error_code TEXT,
 processed_pages INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(kind,administration_id,snapshot_version,source_generation),
 FOREIGN KEY(administration_id,snapshot_version) REFERENCES result_artifact_preparation_jobs(administration_id,snapshot_version) ON DELETE CASCADE
);
CREATE INDEX idx_result_artifact_queue_due ON result_artifact_queue_jobs(status,next_dispatch_at);
