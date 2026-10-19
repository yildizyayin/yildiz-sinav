-- Preserve the legacy anchor for compatibility, record the complete selected set.
CREATE TABLE annual_content_plan_curricula (
 plan_id TEXT NOT NULL REFERENCES annual_content_plans(id) ON DELETE CASCADE,
 curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
 PRIMARY KEY(plan_id,curriculum_version_id)
);
INSERT INTO annual_content_plan_curricula(plan_id,curriculum_version_id)
 SELECT id,curriculum_version_id FROM annual_content_plans;
CREATE TRIGGER annual_plan_source_context BEFORE INSERT ON annual_content_plan_curricula
 WHEN NOT EXISTS(SELECT 1 FROM annual_content_plans p JOIN curriculum_versions cv
 ON cv.id=NEW.curriculum_version_id WHERE p.id=NEW.plan_id AND cv.verified=1
 AND cv.program_code='SCHOOL' AND cv.academic_year=p.academic_year AND cv.grade_level=p.grade_level)
 BEGIN SELECT RAISE(ABORT,'ANNUAL_CURRICULUM_CONTEXT_MISMATCH'); END;
CREATE TRIGGER annual_published_slots_preserved BEFORE DELETE ON annual_content_plan_slots
 WHEN EXISTS(SELECT 1 FROM annual_content_plan_slots s WHERE s.plan_id=OLD.plan_id AND s.status='PUBLISHED')
 BEGIN SELECT RAISE(ABORT,'PUBLISHED_ANNUAL_PLAN_IMMUTABLE'); END;
CREATE TRIGGER annual_published_sources_preserved BEFORE DELETE ON annual_content_plan_curricula
 WHEN EXISTS(SELECT 1 FROM annual_content_plan_slots s WHERE s.plan_id=OLD.plan_id AND s.status='PUBLISHED')
 BEGIN SELECT RAISE(ABORT,'PUBLISHED_ANNUAL_PLAN_IMMUTABLE'); END;
