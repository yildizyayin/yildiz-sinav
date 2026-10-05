-- The receipt is inserted with the complete grading/effect batch, never separately.
-- Existing submitted tests remain unchanged; only READY tests create a receipt.
CREATE TABLE IF NOT EXISTS coach_mini_test_submissions (
  test_id TEXT PRIMARY KEY REFERENCES coach_mini_tests(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  committed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
