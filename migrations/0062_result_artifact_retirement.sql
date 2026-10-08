-- Non-personal tombstones intentionally survive participant/admin deletion.
CREATE TABLE IF NOT EXISTS result_artifact_retirements (
 administration_id TEXT PRIMARY KEY,
 exam_id TEXT NOT NULL,
 retired_through_version INTEGER NOT NULL CHECK(retired_through_version >= 1),
 sweep_version INTEGER NOT NULL DEFAULT 1 CHECK(sweep_version >= 1),
 next_sweep_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_sweep_at TEXT,
 retired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_artifact_retirement_due ON result_artifact_retirements(next_sweep_at,administration_id);
CREATE INDEX IF NOT EXISTS idx_result_artifact_retirement_exam ON result_artifact_retirements(exam_id,retired_through_version);
