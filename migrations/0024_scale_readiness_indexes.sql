PRAGMA foreign_keys = ON;

-- Supports stale Student Intelligence sweeps and 100k-scale health checks.
CREATE INDEX IF NOT EXISTS idx_student_intelligence_refreshed_at
ON student_intelligence_profiles(refreshed_at);

CREATE INDEX IF NOT EXISTS idx_enrollment_active_student
ON student_enrollments(status, student_id, institution_id, class_id);

CREATE INDEX IF NOT EXISTS idx_sessions_active_expiry
ON sessions(revoked_at, expires_at);

CREATE INDEX IF NOT EXISTS idx_scan_batches_status_scope
ON scan_batches(status, institution_id, created_at);
