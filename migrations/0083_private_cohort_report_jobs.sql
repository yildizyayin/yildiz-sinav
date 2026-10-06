-- Opt-in background cohort report jobs and source-generation fences.
CREATE TABLE cohort_report_revisions (institution_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO cohort_report_revisions(institution_id) SELECT id FROM institutions;
CREATE TABLE cohort_report_global_revision (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO cohort_report_global_revision(id) VALUES(1);
CREATE TABLE private_cohort_report_jobs (
 id TEXT PRIMARY KEY, actor_user_id TEXT NOT NULL REFERENCES users(id), request_id TEXT NOT NULL,
 actor_scope_json TEXT NOT NULL CHECK(json_valid(actor_scope_json)), selection_json TEXT NOT NULL CHECK(json_valid(selection_json)),
 institution_id TEXT NOT NULL, source_revision INTEGER NOT NULL, global_revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','READY','FAILED','REVOKED','EXPIRED')),
 enrollment_cursor TEXT NOT NULL DEFAULT '', processed_enrollments INTEGER NOT NULL DEFAULT 0,
 aggregate_json TEXT CHECK(aggregate_json IS NULL OR json_valid(aggregate_json)), object_key TEXT,
 lease_token TEXT, lease_until TEXT, error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL, cleanup_done INTEGER NOT NULL DEFAULT 0,
 UNIQUE(actor_user_id,request_id)
);
CREATE INDEX cohort_report_actor_jobs ON private_cohort_report_jobs(actor_user_id,created_at DESC);
CREATE INDEX cohort_report_scope_jobs ON private_cohort_report_jobs(institution_id,status,expires_at);
CREATE INDEX cohort_report_dispatch ON private_cohort_report_jobs(status,lease_until,expires_at);
CREATE INDEX cohort_snapshot_scope ON exam_result_snapshots(institution_id,exam_id,snapshot_version,student_id);
CREATE INDEX cohort_enrollment_scan ON student_enrollments(institution_id,id,season_id);
CREATE TRIGGER cohort_revision_student_enrollments_insert AFTER INSERT ON student_enrollments
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_student_enrollments_update AFTER UPDATE ON student_enrollments
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_student_enrollments_delete AFTER DELETE ON student_enrollments
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_institution_seasons_insert AFTER INSERT ON institution_seasons
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_institution_seasons_update AFTER UPDATE ON institution_seasons
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_institution_seasons_delete AFTER DELETE ON institution_seasons
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_classes_insert AFTER INSERT ON classes
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_classes_update AFTER UPDATE ON classes
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_classes_delete AFTER DELETE ON classes
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_result_snapshots_insert AFTER INSERT ON exam_result_snapshots
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_result_snapshots_update AFTER UPDATE ON exam_result_snapshots
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_result_snapshots_delete AFTER DELETE ON exam_result_snapshots
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_participants_insert AFTER INSERT ON exam_participants
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_participants_update AFTER UPDATE ON exam_participants
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_participants_delete AFTER DELETE ON exam_participants
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_assessment_runs_insert AFTER INSERT ON assessment_runs
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_assessment_runs_update AFTER UPDATE ON assessment_runs
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_assessment_runs_delete AFTER DELETE ON assessment_runs
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_frozen_foy_response_evidence_insert AFTER INSERT ON frozen_foy_response_evidence
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_frozen_foy_response_evidence_update AFTER UPDATE ON frozen_foy_response_evidence
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_frozen_foy_response_evidence_delete AFTER DELETE ON frozen_foy_response_evidence
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_frozen_game_session_evidence_insert AFTER INSERT ON frozen_game_session_evidence
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_frozen_game_session_evidence_update AFTER UPDATE ON frozen_game_session_evidence
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_frozen_game_session_evidence_delete AFTER DELETE ON frozen_game_session_evidence
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_assignments_insert AFTER INSERT ON assignments
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_assignments_update AFTER UPDATE ON assignments
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id OR j.institution_id=NEW.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT NEW.institution_id,1 WHERE NEW.institution_id IS NOT NULL AND NEW.institution_id IS NOT OLD.institution_id ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_assignments_delete AFTER DELETE ON assignments
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE (j.institution_id=OLD.institution_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT OLD.institution_id,1 WHERE OLD.institution_id IS NOT NULL ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_delivery_profiles_insert AFTER INSERT ON exam_delivery_profiles
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 UPDATE cohort_report_global_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER cohort_revision_exam_delivery_profiles_update AFTER UPDATE ON exam_delivery_profiles
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 UPDATE cohort_report_global_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER cohort_revision_exam_delivery_profiles_delete AFTER DELETE ON exam_delivery_profiles
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j WHERE j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 UPDATE cohort_report_global_revision SET revision=revision+1 WHERE id=1;
END;
CREATE TRIGGER cohort_revision_coach_mini_tests_insert AFTER INSERT ON coach_mini_tests
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j JOIN assignments a ON a.institution_id=j.institution_id WHERE a.id IN (NEW.assignment_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT DISTINCT institution_id,1 FROM assignments WHERE id IN (NEW.assignment_id) ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_coach_mini_tests_update AFTER UPDATE ON coach_mini_tests
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j JOIN assignments a ON a.institution_id=j.institution_id WHERE a.id IN (OLD.assignment_id,NEW.assignment_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT DISTINCT institution_id,1 FROM assignments WHERE id IN (OLD.assignment_id,NEW.assignment_id) ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_coach_mini_tests_delete AFTER DELETE ON coach_mini_tests
WHEN EXISTS(SELECT 1 FROM private_cohort_report_jobs j JOIN assignments a ON a.institution_id=j.institution_id WHERE a.id IN (OLD.assignment_id) AND j.status IN ('QUEUED','RUNNING','READY') AND datetime(j.expires_at)>CURRENT_TIMESTAMP)
BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) SELECT DISTINCT institution_id,1 FROM assignments WHERE id IN (OLD.assignment_id) ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
