ALTER TABLE result_artifact_preparation_jobs ADD COLUMN attempt_token TEXT;
ALTER TABLE result_artifact_preparation_jobs ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE result_artifact_preparation_jobs ADD COLUMN last_error_code TEXT;
ALTER TABLE result_artifact_preparation_jobs ADD COLUMN next_attempt_at TEXT;
