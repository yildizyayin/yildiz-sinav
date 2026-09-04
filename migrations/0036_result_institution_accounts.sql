PRAGMA foreign_keys = ON;

-- Hidden operational rows let sonuc.anunex.com reuse the exact same ANUNEX
-- exam parser/evaluation engine without turning MEB directory records into app tenants.
ALTER TABLE institutions ADD COLUMN result_network_only INTEGER NOT NULL DEFAULT 0 CHECK(result_network_only IN (0,1));
CREATE INDEX IF NOT EXISTS idx_institutions_result_network_only ON institutions(result_network_only,status);

CREATE TABLE IF NOT EXISTS result_institution_accounts (
  id TEXT PRIMARY KEY,
  meb_code TEXT NOT NULL UNIQUE REFERENCES national_institution_directory(meb_code),
  identifier TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUSPENDED','REVOKED')),
  can_evaluate INTEGER NOT NULL DEFAULT 1 CHECK(can_evaluate IN (0,1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_institution_account_status ON result_institution_accounts(status,meb_code);

CREATE TABLE IF NOT EXISTS result_institution_account_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES result_institution_accounts(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_institution_account_session ON result_institution_account_sessions(account_id,expires_at,revoked_at);

CREATE TABLE IF NOT EXISTS result_institution_workspaces (
  meb_code TEXT PRIMARY KEY REFERENCES national_institution_directory(meb_code),
  institution_id TEXT NOT NULL UNIQUE REFERENCES institutions(id),
  service_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dealer batch ownership is explicit so a dealer can never continue another
-- dealer's evaluation even if a batch id is guessed or leaked.
CREATE TABLE IF NOT EXISTS result_operator_batches (
  batch_id TEXT PRIMARY KEY REFERENCES scan_batches(id) ON DELETE CASCADE,
  operator_id TEXT NOT NULL REFERENCES result_operators(id) ON DELETE CASCADE,
  meb_code TEXT NOT NULL REFERENCES national_institution_directory(meb_code),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_operator_batches_scope ON result_operator_batches(operator_id,meb_code,created_at DESC);

CREATE TABLE IF NOT EXISTS result_institution_account_audit (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES result_institution_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meb_code TEXT,
  batch_id TEXT,
  ip_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_institution_account_audit ON result_institution_account_audit(account_id,created_at DESC);
