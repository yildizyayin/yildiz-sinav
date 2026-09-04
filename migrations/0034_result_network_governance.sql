PRAGMA foreign_keys = ON;

-- Result Network governance: dealers are explicit profiles, never implicit role elevation.
CREATE TABLE IF NOT EXISTS result_network_dealers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','SUSPENDED','REVOKED')),
  display_name TEXT,
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_network_dealers_status ON result_network_dealers(status);

CREATE TABLE IF NOT EXISTS result_network_dealer_scopes (
  id TEXT PRIMARY KEY,
  dealer_id TEXT NOT NULL REFERENCES result_network_dealers(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('INSTITUTION','DISTRICT','CITY','NATIONAL')),
  meb_code TEXT,
  city TEXT,
  district TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dealer_id,scope_type,meb_code,city,district)
);

-- Lifecycle is separate from the legacy ACTIVE/PASSIVE column so FREEZE and ARCHIVE are reversible/auditable.
CREATE TABLE IF NOT EXISTS institution_access_controls (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(lifecycle_status IN ('ACTIVE','PASSIVE','FROZEN','ARCHIVED')),
  reason TEXT,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institution_governance_events (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  actor_dealer_id TEXT REFERENCES result_network_dealers(id),
  action TEXT NOT NULL CHECK(action IN ('CREATE','PASSIVE','FREEZE','UNFREEZE','ARCHIVE','RESTORE')),
  previous_status TEXT,
  next_status TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One exam definition, one administration record, many visible channels.
CREATE TABLE IF NOT EXISTS exam_channel_publications (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('MARKETING','LICENSED','DEMO','RESULT_NETWORK')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('DRAFT','ACTIVE','ARCHIVED')),
  source_administration_id TEXT REFERENCES exam_administrations(id) ON DELETE SET NULL,
  published_by TEXT REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,channel)
);
CREATE INDEX IF NOT EXISTS idx_exam_channel_publications_status ON exam_channel_publications(channel,status);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('RESULT_NETWORK_GOVERNANCE','Sonuç ağı kurum ve bayi yetkileri','STANDARD',1),
 ('SHARED_EXAM_CATALOG','Üç yüzey ortak sınav kataloğu','STANDARD',1);
