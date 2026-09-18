ALTER TABLE nibiru_sessions ADD COLUMN specialist TEXT;
ALTER TABLE nibiru_sessions ADD COLUMN workload TEXT;

CREATE INDEX IF NOT EXISTS idx_nibiru_sessions_routing
  ON nibiru_sessions(channel, channel_user_key, last_intent, expires_at);
