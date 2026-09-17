CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_student_account
ON users(student_id)
WHERE role='STUDENT' AND student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_parent_student_links_active
ON parent_student_links(student_id, active);

CREATE INDEX IF NOT EXISTS idx_users_access_roles
ON users(institution_id, role, active);
