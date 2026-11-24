-- Nibiru veli uygulaması 2 (owner, 24 Nov 2026): the conversation is kept like WhatsApp, Nibiru writes first when
-- something happens (result published, absence), answers can be rated, and the phone can be notified.
CREATE TABLE IF NOT EXISTS nibiru_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES student_entities(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK(author IN ('USER','NIBIRU')),
  origin TEXT NOT NULL DEFAULT 'CHAT' CHECK(origin IN ('CHAT','PROACTIVE')),
  text TEXT NOT NULL,
  payload_json TEXT,
  feedback INTEGER CHECK(feedback IN (-1,1)),
  feedback_at TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nibiru_messages_user ON nibiru_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_nibiru_messages_feedback ON nibiru_messages(feedback, feedback_at);
-- one first message per person and event
CREATE TABLE IF NOT EXISTS nibiru_proactive_log (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, kind, ref_id)
);
-- phone notifications carry no text at all ("Nibiru · Yeni bir mesajınız var" is written by the phone)
CREATE TABLE IF NOT EXISTS nibiru_push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_nibiru_push_user ON nibiru_push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS nibiru_push_keys (
  id TEXT PRIMARY KEY CHECK(id='vapid'),
  public_key TEXT NOT NULL,
  private_jwk TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
