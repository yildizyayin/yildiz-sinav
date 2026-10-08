-- Parent resolution for atomic set-based curriculum publication.
CREATE INDEX IF NOT EXISTS curriculum_import_parent_lookup_idx
ON curriculum_import_rows(job_id,subject_id,grade_level,outcome_code);
