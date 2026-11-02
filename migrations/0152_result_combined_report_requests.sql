-- Birleşik karne (2 Nov): request log for the per-identity rate limit. Only the result identity and the time are kept.
CREATE TABLE IF NOT EXISTS result_combined_report_requests (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_combined_requests_identity ON result_combined_report_requests(identity_id, created_at);
