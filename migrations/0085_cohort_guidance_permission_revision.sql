-- GUIDANCE permission mutations invalidate prepared reports in the affected institution.
CREATE TRIGGER cohort_revision_guidance_assignment_insert AFTER INSERT ON teacher_assignments
WHEN (NEW.assignment_type='GUIDANCE') AND EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_guidance_assignment_update AFTER UPDATE ON teacher_assignments
WHEN (OLD.assignment_type='GUIDANCE' OR NEW.assignment_type='GUIDANCE') AND EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_guidance_assignment_delete AFTER DELETE ON teacher_assignments
WHEN (OLD.assignment_type='GUIDANCE') AND EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
