ALTER TABLE question_generation_jobs ADD COLUMN editorial_verify_retry_count INTEGER NOT NULL DEFAULT 0 CHECK(editorial_verify_retry_count BETWEEN 0 AND 1);
ALTER TABLE question_generation_jobs ADD COLUMN repair_source_audit_id TEXT;
UPDATE question_generation_jobs SET repair_source_audit_id=(SELECT json_extract(a.details_json,'$.sourceAuditId') FROM audit_logs a WHERE a.entity_id=question_generation_jobs.id AND a.action='QUESTION_EDITORIAL_REPAIR_REQUESTED' AND json_valid(a.details_json) ORDER BY a.created_at DESC,a.id DESC LIMIT 1) WHERE editorial_repair_count=1;
