ALTER TABLE question_generation_jobs ADD COLUMN active_stage TEXT
 CHECK(active_stage IS NULL OR active_stage IN ('GENERATING','VALIDATING','ORIGINALITY','COMMITTING'));
ALTER TABLE question_generation_jobs ADD COLUMN stage_started_at TEXT;
