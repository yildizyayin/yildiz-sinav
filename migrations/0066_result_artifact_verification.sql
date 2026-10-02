ALTER TABLE result_artifact_preparation_jobs ADD COLUMN source_generation INTEGER NOT NULL DEFAULT 1;
CREATE TABLE result_artifact_verifications (
 administration_id TEXT NOT NULL,
 snapshot_version INTEGER NOT NULL,
 source_generation INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('VERIFYING','VERIFIED','INVALIDATED')),
 participant_cursor TEXT NOT NULL DEFAULT '',
 expected_count INTEGER NOT NULL,
 verified_count INTEGER NOT NULL DEFAULT 0,
 last_error_code TEXT,
 next_attempt_at TEXT,
 last_attempted_at TEXT,
 verified_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(administration_id,snapshot_version),
 FOREIGN KEY(administration_id,snapshot_version) REFERENCES result_artifact_preparation_jobs(administration_id,snapshot_version) ON DELETE CASCADE
);
CREATE INDEX idx_result_artifact_verification_due ON result_artifact_verifications(status,next_attempt_at);
CREATE TRIGGER artifact_preparation_source_generation AFTER UPDATE OF status ON result_artifact_preparation_jobs WHEN NEW.status='INVALIDATED' BEGIN
 UPDATE result_artifact_preparation_jobs SET source_generation=source_generation+1 WHERE administration_id=NEW.administration_id AND snapshot_version=NEW.snapshot_version;
END;
CREATE TRIGGER artifact_verification_generation_changed AFTER UPDATE OF source_generation,status ON result_artifact_preparation_jobs WHEN NEW.source_generation<>OLD.source_generation OR NEW.status='INVALIDATED' BEGIN
 UPDATE result_artifact_verifications SET status='INVALIDATED',verified_at=NULL,last_error_code='RESULT_ARTIFACT_SOURCE_CHANGED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=NEW.administration_id AND snapshot_version=NEW.snapshot_version;
END;
CREATE TRIGGER artifact_job_retirement_insert AFTER INSERT ON result_artifact_retirements BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=NEW.administration_id AND snapshot_version<=NEW.retired_through_version;
END;
CREATE TRIGGER artifact_job_retirement_update AFTER UPDATE ON result_artifact_retirements BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=NEW.administration_id AND snapshot_version<=NEW.retired_through_version AND NEW.retired_through_version>OLD.retired_through_version;
END;
CREATE TRIGGER artifact_job_official_institution_code_update AFTER UPDATE OF code ON institutions WHEN OLD.code IS NOT NEW.code BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id IN (SELECT rai.administration_id FROM result_access_identities rai JOIN exam_participants ep ON ep.id=rai.participant_id WHERE ep.institution_id=NEW.id);
END;

CREATE TRIGGER artifact_job_official_institution_delete BEFORE DELETE ON institutions BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id IN (SELECT rai.administration_id FROM result_access_identities rai JOIN exam_participants ep ON ep.id=rai.participant_id WHERE ep.institution_id=OLD.id);
END;
