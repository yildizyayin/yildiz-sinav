PRAGMA foreign_keys = ON;

-- S045: a Super Admin enrolls their own authenticator from the panel. The TOTP seed is sealed (AES-GCM, key from
-- SESSION_SECRET); it is only ACTIVE after the owner proves a code from the app, so enrolling cannot lock anyone out.
-- The Cloudflare secret SUPER_ADMIN_MFA_TOTP_SECRET, when set, still wins for every Super Admin.
CREATE TABLE IF NOT EXISTS super_admin_mfa_secrets (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_sealed TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  activated_at TEXT
);
