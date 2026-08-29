PRAGMA foreign_keys = ON;

-- Searchable counters for the unified, role-safe student intelligence read model.
ALTER TABLE student_intelligence_profiles ADD COLUMN active_recovery_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_intelligence_profiles ADD COLUMN open_coach_task_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_intelligence_profiles ADD COLUMN pending_followup_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_intelligence_profiles ADD COLUMN mastered_outcome_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_intelligence_profiles ADD COLUMN available_video_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_intelligence_profiles ADD COLUMN personal_book_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE student_intelligence_profiles ADD COLUMN motivation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(motivation_enabled IN (0,1));

CREATE INDEX IF NOT EXISTS idx_student_intelligence_action_loop
  ON student_intelligence_profiles(institution_id,active_recovery_count,open_coach_task_count,pending_followup_count);

