PRAGMA foreign_keys = ON;

-- sonuc.anunex.com operators are intentionally NOT platform users.
-- They can evaluate only the MEB institutions allowed by their geographic scopes.
CREATE TABLE IF NOT EXISTS result_operators (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  identifier TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED')),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS result_operator_scopes (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES result_operators(id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  district TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(operator_id,city,district)
);
CREATE INDEX IF NOT EXISTS idx_result_operator_scope_lookup ON result_operator_scopes(operator_id,status,city,district);

CREATE TABLE IF NOT EXISTS result_operator_sessions (
  id TEXT PRIMARY KEY,
  operator_id TEXT NOT NULL REFERENCES result_operators(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_operator_session_expiry ON result_operator_sessions(expires_at,revoked_at);

-- A MEB directory record is only a reference. This key activates an institution-owned
-- result workspace without turning the institution into a licensed app tenant.
CREATE TABLE IF NOT EXISTS result_institution_keys (
  id TEXT PRIMARY KEY,
  meb_code TEXT NOT NULL REFERENCES national_institution_directory(meb_code),
  label TEXT,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  issued_by TEXT NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_result_institution_key_meb ON result_institution_keys(meb_code,status);

CREATE TABLE IF NOT EXISTS result_institution_sessions (
  id TEXT PRIMARY KEY,
  meb_code TEXT NOT NULL REFERENCES national_institution_directory(meb_code),
  key_id TEXT NOT NULL REFERENCES result_institution_keys(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_institution_session_expiry ON result_institution_sessions(meb_code,expires_at,revoked_at);

CREATE TABLE IF NOT EXISTS result_operator_audit (
  id TEXT PRIMARY KEY,
  operator_id TEXT REFERENCES result_operators(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meb_code TEXT,
  administration_id TEXT REFERENCES exam_administrations(id) ON DELETE SET NULL,
  ip_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_operator_audit_actor ON result_operator_audit(operator_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_result_operator_audit_institution ON result_operator_audit(meb_code,created_at DESC);

-- Link evaluation administration to the operator who performs the work.
ALTER TABLE result_network_institutions ADD COLUMN result_operator_id TEXT REFERENCES result_operators(id);
CREATE INDEX IF NOT EXISTS idx_result_network_operator_geo ON result_network_institutions(result_operator_id,city_snapshot,district_snapshot,administration_id);

-- Every centrally defined exam automatically receives one Result Network administration.
-- app.anunex.com and sonuc.anunex.com share this production D1, so the exam is defined only once.
INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,created_by)
SELECT 'eadm_'||lower(hex(randomblob(16))),e.id,e.academic_year,'RESULT_NETWORK','DRAFT',e.created_by
FROM exams e
WHERE e.owner_type='CENTRAL'
  AND NOT EXISTS(SELECT 1 FROM exam_administrations ea WHERE ea.exam_id=e.id AND ea.channel='RESULT_NETWORK');

CREATE TRIGGER IF NOT EXISTS trg_central_exam_result_network_auto
AFTER INSERT ON exams
WHEN NEW.owner_type='CENTRAL'
BEGIN
  INSERT INTO exam_administrations(id,exam_id,academic_year,channel,status,created_by)
  SELECT 'eadm_'||lower(hex(randomblob(16))),NEW.id,NEW.academic_year,'RESULT_NETWORK','DRAFT',NEW.created_by
  WHERE NOT EXISTS(SELECT 1 FROM exam_administrations ea WHERE ea.exam_id=NEW.id AND ea.channel='RESULT_NETWORK');
END;

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('RESULT_OPERATOR_NETWORK','Bölgesel Sonuç Operatörü Ağı','STANDARD',1);
