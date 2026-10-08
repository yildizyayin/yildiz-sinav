CREATE TABLE IF NOT EXISTS exam_operation_locks (
  exam_id TEXT PRIMARY KEY REFERENCES exams(id),
  owner_token TEXT NOT NULL,
  operation TEXT NOT NULL,
  acquired_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
