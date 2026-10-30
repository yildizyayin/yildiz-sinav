-- Nibiru canlı kontrol (30 Ekim): the Super Admin's on-demand check of the text models, speech-to-text and voice.
-- Only the outcome is kept (which service answered, error codes); no prompts, audio or student data.
CREATE TABLE IF NOT EXISTS nibiru_health_checks (
  id TEXT PRIMARY KEY,
  checked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  environment TEXT,
  ok INTEGER NOT NULL CHECK(ok IN (0,1)),
  result_json TEXT NOT NULL,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nibiru_health_checks_time ON nibiru_health_checks(checked_at DESC);
