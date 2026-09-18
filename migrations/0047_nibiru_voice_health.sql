-- Keep live voice activation evidence separate from secrets and user content.
CREATE TABLE IF NOT EXISTS nibiru_voice_provider_health (
  provider TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('STANDARD','PREMIUM')),
  model TEXT NOT NULL,
  last_success_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nibiru_voice_health_success
  ON nibiru_voice_provider_health(last_success_at);
