-- Controlled execution state for manually requested question-generation jobs.
-- Generated questions must always enter REVIEW; no automatic approval path exists.
ALTER TABLE question_generation_jobs ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(execution_status IN ('PENDING','RUNNING','RETRY','COMPLETED','FAILED','CANCELLED'));
ALTER TABLE question_generation_jobs ADD COLUMN lease_owner TEXT;
ALTER TABLE question_generation_jobs ADD COLUMN lease_expires_at TEXT;
ALTER TABLE question_generation_jobs ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count>=0);
ALTER TABLE question_generation_jobs ADD COLUMN last_error TEXT;
ALTER TABLE question_generation_jobs ADD COLUMN started_at TEXT;
ALTER TABLE question_generation_jobs ADD COLUMN completed_at TEXT;

UPDATE question_generation_jobs SET execution_status='CANCELLED' WHERE status='CANCELLED';

CREATE TRIGGER question_generation_job_cancel_execution AFTER UPDATE OF status ON question_generation_jobs
WHEN NEW.status='CANCELLED' AND OLD.status<>'CANCELLED'
BEGIN
  UPDATE question_generation_jobs
  SET execution_status='CANCELLED', lease_owner=NULL, lease_expires_at=NULL,
      last_error=NULL
  WHERE id=NEW.id;
END;

CREATE TABLE question_generation_lineage (
  job_id TEXT NOT NULL REFERENCES question_generation_jobs(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK(ordinal>=1 AND ordinal<=10),
  output_sha256 TEXT NOT NULL CHECK(length(output_sha256)=64),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(job_id,ordinal),
  UNIQUE(question_id)
);
CREATE INDEX question_generation_lineage_question ON question_generation_lineage(question_id);
CREATE INDEX question_generation_jobs_execution ON question_generation_jobs(execution_status,lease_expires_at,id);
