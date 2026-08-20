PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS activation_requests (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  decided_by TEXT REFERENCES users(id),
  decision_note TEXT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_activation_one_pending ON activation_requests(institution_id,student_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_activation_requests_status ON activation_requests(status, requested_at);
CREATE INDEX IF NOT EXISTS idx_activation_requests_institution ON activation_requests(institution_id, status, requested_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id, read_at, created_at DESC);
