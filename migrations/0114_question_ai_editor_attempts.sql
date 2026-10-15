CREATE TABLE question_ai_editor_attempts (
 job_id TEXT PRIMARY KEY REFERENCES question_generation_jobs(id),
 source_audit_id TEXT NOT NULL REFERENCES audit_logs(id),
 source_hash TEXT NOT NULL,
 model TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'INLINE' CHECK(mode IN ('INLINE','FAILED_SOURCE')),
 status TEXT NOT NULL CHECK(status IN ('RUNNING','EDITED','FAILED')),
 edited_questions_json TEXT,
 usage_json TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT
);
CREATE TRIGGER question_ai_editor_source_immutable BEFORE UPDATE ON question_ai_editor_attempts
 WHEN NEW.job_id<>OLD.job_id OR NEW.source_audit_id<>OLD.source_audit_id OR NEW.source_hash<>OLD.source_hash OR NEW.model<>OLD.model OR NEW.mode<>OLD.mode
 BEGIN SELECT RAISE(ABORT,'AI_EDITOR_SOURCE_IMMUTABLE'); END;

CREATE TRIGGER question_ai_editor_result_immutable BEFORE UPDATE ON question_ai_editor_attempts
 WHEN OLD.status='EDITED' AND (NEW.status<>'EDITED' OR NEW.edited_questions_json IS NOT OLD.edited_questions_json OR NEW.usage_json IS NOT OLD.usage_json)
 BEGIN SELECT RAISE(ABORT,'AI_EDITOR_RESULT_IMMUTABLE'); END;
