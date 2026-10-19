-- A005: dedicated, non-human service identity for the question agent scheduler.
-- The account exists only so QUESTION_AGENT_SERVICE_ACTOR_ID points at a real,
-- auditable, deactivatable SUPER_ADMIN row instead of a person's own account.
-- It can never sign in: the password material is random bytes nobody knows,
-- and the `svc-` id prefix is refused by login, createSession and getAuthUser.
-- INSERT OR IGNORE keeps the row (and any later deactivation) untouched on re-run.
INSERT OR IGNORE INTO users (
  id, institution_id, student_id, role, display_name, email, phone, username,
  password_hash, password_salt, password_iterations, password_algo, active, must_change_password
) VALUES (
  'svc-soru-ajani', NULL, NULL, 'SUPER_ADMIN', 'Soru ajanı servis hesabı (giriş kapalı)', NULL, NULL, 'svc-soru-ajani',
  hex(randomblob(32)), hex(randomblob(16)), 100000, 'SERVICE_ACCOUNT_NO_LOGIN', 1, 0
);
