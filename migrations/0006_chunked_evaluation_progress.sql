PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scan_evaluation_progress (
  batch_id TEXT NOT NULL REFERENCES scan_batches(id) ON DELETE CASCADE,
  scan_record_id TEXT NOT NULL REFERENCES scan_records(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES student_entities(id),
  participant_id TEXT REFERENCES exam_participants(id) ON DELETE CASCADE,
  processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(batch_id, scan_record_id)
);

CREATE INDEX IF NOT EXISTS idx_scan_evaluation_progress_batch
  ON scan_evaluation_progress(batch_id, processed_at);
