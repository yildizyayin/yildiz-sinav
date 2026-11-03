-- Türkiye geneli takvim (owner, 3 Nov): application window, result release time and the release-night upload pause.
ALTER TABLE exam_administrations ADD COLUMN application_start_at TEXT;
ALTER TABLE exam_administrations ADD COLUMN application_end_at TEXT;
ALTER TABLE exam_administrations ADD COLUMN result_release_at TEXT;
ALTER TABLE exam_administrations ADD COLUMN upload_resume_at TEXT;
ALTER TABLE exam_administrations ADD COLUMN scheduled_release_done_at TEXT;
CREATE INDEX IF NOT EXISTS idx_exam_administrations_release ON exam_administrations(result_release_at) WHERE result_release_at IS NOT NULL;

-- An upload evaluated during the pause waits here; the result worker evaluates it once the pause ends.
CREATE TABLE IF NOT EXISTS result_deferred_evaluations (
  batch_id TEXT PRIMARY KEY REFERENCES scan_batches(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL,
  institution_id TEXT,
  actor_user_id TEXT NOT NULL,
  effective_json TEXT NOT NULL,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  done_at TEXT,
  outcome TEXT
);
CREATE INDEX IF NOT EXISTS idx_result_deferred_pending ON result_deferred_evaluations(queued_at) WHERE done_at IS NULL;
