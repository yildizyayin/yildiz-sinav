-- Cursor progress is not a proof of current R2 availability or rollout readiness.
CREATE TABLE IF NOT EXISTS result_artifact_preparation_jobs (
 administration_id TEXT NOT NULL REFERENCES exam_administrations(id) ON DELETE CASCADE,
 snapshot_version INTEGER NOT NULL,
 actor_user_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','PREPARED','INVALIDATED')),
 participant_cursor TEXT NOT NULL DEFAULT '',
 prepared_count INTEGER NOT NULL DEFAULT 0,
 last_attempted_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(administration_id,snapshot_version)
);
CREATE INDEX IF NOT EXISTS idx_result_artifact_preparation_status ON result_artifact_preparation_jobs(status,updated_at);
CREATE TRIGGER IF NOT EXISTS artifact_job_identity_insert AFTER INSERT ON result_access_identities BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=NEW.administration_id;
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_identity_update AFTER UPDATE ON result_access_identities BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id IN (OLD.administration_id,NEW.administration_id) AND (OLD.participant_id<>NEW.participant_id OR OLD.administration_id<>NEW.administration_id OR OLD.result_institution_id<>NEW.result_institution_id);
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_identity_delete AFTER DELETE ON result_access_identities BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=OLD.administration_id;
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_snapshot_insert AFTER INSERT ON exam_result_snapshots BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE snapshot_version=NEW.snapshot_version AND administration_id IN (SELECT id FROM exam_administrations WHERE exam_id=NEW.exam_id);
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_snapshot_update AFTER UPDATE ON exam_result_snapshots BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE (snapshot_version=OLD.snapshot_version OR snapshot_version=NEW.snapshot_version) AND administration_id IN (SELECT id FROM exam_administrations WHERE exam_id IN (OLD.exam_id,NEW.exam_id));
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_snapshot_delete AFTER DELETE ON exam_result_snapshots BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE snapshot_version=OLD.snapshot_version AND administration_id IN (SELECT id FROM exam_administrations WHERE exam_id=OLD.exam_id);
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_publication_update AFTER UPDATE ON exam_administrations WHEN NEW.status<>'PUBLISHED' OR NEW.channel<>'RESULT_NETWORK' OR NEW.published_snapshot_version<>OLD.published_snapshot_version BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS artifact_job_participant_update AFTER UPDATE ON exam_participants WHEN OLD.exam_id<>NEW.exam_id OR OLD.institution_id IS NOT NEW.institution_id BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id IN (SELECT administration_id FROM result_access_identities WHERE participant_id IN (OLD.id,NEW.id));
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_institution_scope_update AFTER UPDATE ON result_network_institutions WHEN OLD.administration_id<>NEW.administration_id OR OLD.licensed_institution_id IS NOT NEW.licensed_institution_id OR OLD.meb_code IS NOT NEW.meb_code BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id IN (OLD.administration_id,NEW.administration_id);
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_manifest_update AFTER UPDATE ON result_artifact_manifest BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id IN (OLD.administration_id,NEW.administration_id) AND snapshot_version IN (OLD.snapshot_version,NEW.snapshot_version);
END;
CREATE TRIGGER IF NOT EXISTS artifact_job_manifest_delete AFTER DELETE ON result_artifact_manifest BEGIN
 UPDATE result_artifact_preparation_jobs SET status='INVALIDATED',updated_at=CURRENT_TIMESTAMP WHERE administration_id=OLD.administration_id AND snapshot_version=OLD.snapshot_version;
END;
