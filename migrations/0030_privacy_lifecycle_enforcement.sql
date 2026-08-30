PRAGMA foreign_keys = ON;

-- Technical privacy lifecycle enforcement. Policy rows remain LEGAL_REVIEW by default;
-- this migration does not make a legal retention decision or open the production gate.
ALTER TABLE privacy_deletion_jobs ADD COLUMN retention_policy_id TEXT REFERENCES retention_policies(id);
ALTER TABLE privacy_deletion_jobs ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE privacy_deletion_jobs ADD COLUMN approved_at TEXT;
ALTER TABLE privacy_deletion_jobs ADD COLUMN approval_evidence_hash TEXT;
ALTER TABLE privacy_deletion_jobs ADD COLUMN execution_scope_code TEXT;

CREATE TABLE IF NOT EXISTS privacy_legal_holds (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  subject_user_id TEXT REFERENCES users(id),
  subject_student_id TEXT REFERENCES student_entities(id),
  reason_code TEXT NOT NULL,
  note TEXT,
  evidence_hash TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RELEASED')),
  applied_by TEXT NOT NULL REFERENCES users(id),
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_by TEXT REFERENCES users(id),
  released_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(subject_user_id IS NOT NULL OR subject_student_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_privacy_legal_hold_subject
  ON privacy_legal_holds(status,subject_user_id,subject_student_id,applied_at DESC);

CREATE TABLE IF NOT EXISTS privacy_disposal_evidence (
  id TEXT PRIMARY KEY,
  deletion_job_id TEXT NOT NULL UNIQUE REFERENCES privacy_deletion_jobs(id),
  request_id TEXT REFERENCES data_subject_requests(id),
  institution_id TEXT REFERENCES institutions(id),
  mode TEXT NOT NULL CHECK(mode IN ('DELETE','ANONYMIZE')),
  execution_scope_code TEXT NOT NULL,
  affected_records INTEGER NOT NULL DEFAULT 0 CHECK(affected_records >= 0),
  result_hash TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_privacy_disposal_evidence_request
  ON privacy_disposal_evidence(request_id,completed_at DESC);

CREATE TABLE IF NOT EXISTS privacy_retention_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','COMPLETED','FAILED')),
  policies_considered INTEGER NOT NULL DEFAULT 0,
  policies_executed INTEGER NOT NULL DEFAULT 0,
  affected_records INTEGER NOT NULL DEFAULT 0,
  failure_codes_json TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_privacy_retention_runs_status
  ON privacy_retention_runs(environment,status,started_at DESC);

INSERT OR IGNORE INTO retention_policies
  (id,code,entity_type,purpose_note,trigger_event,retention_days,retention_note,disposal_action,legal_hold_supported,status)
VALUES
  ('ret_auth_session','AUTH_SESSION_EXPIRED','SESSION','Expire authenticated session material after its operational need ends.','EXPIRES_AT',30,'Technical template only; legal retention period requires counsel approval.','DELETE',1,'LEGAL_REVIEW'),
  ('ret_login_attempt','LOGIN_ATTEMPT_SECURITY','LOGIN_ATTEMPT','Limit security telemetry containing identifier/IP hashes.','CREATED_AT',90,'Technical template only; legal retention period requires counsel approval. This hash-only telemetry is not reliably subject-resolvable for legal hold.','DELETE',0,'LEGAL_REVIEW'),
  ('ret_pairing_code','NIBIRU_PAIRING_CODE','NIBIRU_PAIRING_CODE','Remove expired WhatsApp/Nibiru pairing material.','EXPIRES_AT',7,'Technical template only; legal retention period requires counsel approval.','DELETE',1,'LEGAL_REVIEW'),
  ('ret_whatsapp_receipt','WHATSAPP_RECEIPT','WHATSAPP_RECEIPT','Limit provider receipt metadata after delivery/idempotency need ends.','RECEIVED_AT',30,'Technical template only; legal retention period requires counsel approval.','DELETE',1,'LEGAL_REVIEW'),
  ('ret_scan_raw_payload','SCAN_RAW_PAYLOAD','SCAN_RAW_PAYLOAD','Erase imported optical row payload after committed processing while preserving derived result records.','BATCH_CREATED_AT',30,'Technical template only; raw payload disposal timing requires counsel approval.','ANONYMIZE',1,'LEGAL_REVIEW');
