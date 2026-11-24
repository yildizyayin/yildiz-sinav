-- Nibiru bildirimleri (owner, 24 Nov 2026): each person chooses which kinds of first messages they want; a phone
-- notification due between 22:00 and 08:00 (Istanbul) waits in a queue until morning (urgent guidance excepted).
CREATE TABLE IF NOT EXISTS nibiru_notify_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('RESULT','ABSENCE','GUIDANCE','MEETING','WEEKLY','STAFF')),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, category)
);
CREATE TABLE IF NOT EXISTS nibiru_push_queue (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
