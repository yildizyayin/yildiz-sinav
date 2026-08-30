PRAGMA foreign_keys = ON;

-- Explicit release approvals. Seeds remain PENDING so production cannot become
-- legally/commercially ready merely because technical tests pass.
CREATE TABLE IF NOT EXISTS privacy_release_approvals (
  id TEXT PRIMARY KEY,
  approval_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','WAIVED','REJECTED')),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  evidence_hash TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO privacy_release_approvals (id, approval_code, title, status) VALUES
  ('pra_role_model','COUNSEL_CONTROLLER_PROCESSOR','Controller/processor role model approved by qualified KVKK counsel','PENDING'),
  ('pra_notices','COUNSEL_PRIVACY_NOTICES','Student/parent/staff/manager notices approved by qualified KVKK counsel','PENDING'),
  ('pra_retention','COUNSEL_RETENTION_SCHEDULE','Retention/deletion schedule approved and executable','PENDING'),
  ('pra_transfers','COUNSEL_SUBPROCESSOR_TRANSFERS','Subprocessor and cross-border transfer pack approved','PENDING'),
  ('pra_verbis','VERBIS_STATUS_CONFIRMED','VERBIS applicability/status confirmed by authorized advisor','PENDING'),
  ('pra_owner','PRODUCTION_OWNER_SIGNOFF','ANUNEX production owner final release approval','PENDING');

CREATE TABLE IF NOT EXISTS privacy_smoke_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  commit_sha TEXT,
  suite_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('RUNNING','PASSED','FAILED')),
  synthetic_only INTEGER NOT NULL DEFAULT 1 CHECK(synthetic_only IN (0,1)),
  checks_total INTEGER NOT NULL DEFAULT 0,
  checks_passed INTEGER NOT NULL DEFAULT 0,
  failure_codes_json TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_privacy_smoke_status
  ON privacy_smoke_runs(environment,status,started_at DESC);
