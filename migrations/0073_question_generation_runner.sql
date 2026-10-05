-- Rebuild the request table because SQLite cannot widen its status CHECK in place.
ALTER TABLE question_generation_jobs RENAME TO question_generation_jobs_0072;
CREATE TABLE question_generation_jobs (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  program_version TEXT NOT NULL,
  outcome_code TEXT,
  outcome_title TEXT NOT NULL,
  question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 10),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','RUNNING','REVIEW_READY','FAILED','CANCELLED')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT,
  cancelled_by TEXT REFERENCES users(id),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  generated_count INTEGER NOT NULL DEFAULT 0 CHECK(generated_count BETWEEN 0 AND question_count),
  lease_token TEXT,
  lease_until TEXT,
  error_code TEXT,
  completed_at TEXT,
  CHECK((status='RUNNING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status<>'RUNNING' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK((status='CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL)
    OR (status<>'CANCELLED' AND cancelled_at IS NULL AND cancelled_by IS NULL)),
  CHECK((status='REVIEW_READY' AND completed_at IS NOT NULL AND generated_count=question_count)
    OR (status<>'REVIEW_READY' AND completed_at IS NULL AND generated_count=0))
);
INSERT INTO question_generation_jobs
 (id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,subject_id,
  program_version,outcome_code,outcome_title,question_count,status,requested_by,created_at,cancelled_at,cancelled_by)
 SELECT id,request_key,outcome_id,curriculum_version_id,academic_year,grade_level,subject_id,
  program_version,outcome_code,outcome_title,question_count,status,requested_by,created_at,cancelled_at,cancelled_by
 FROM question_generation_jobs_0072;
DROP TABLE question_generation_jobs_0072;
CREATE UNIQUE INDEX question_generation_jobs_active_outcome_context
 ON question_generation_jobs(outcome_id,curriculum_version_id)
 WHERE status IN ('REQUESTED','RUNNING','FAILED');
CREATE INDEX question_generation_jobs_year_cursor ON question_generation_jobs(academic_year,id);
CREATE INDEX question_generation_jobs_year_outcome_cursor ON question_generation_jobs(academic_year,outcome_id,id);

ALTER TABLE question_bank ADD COLUMN source_model TEXT;
ALTER TABLE question_bank ADD COLUMN source_job_id TEXT REFERENCES question_generation_jobs(id);
-- Candidate lookup never loads the whole question bank into Worker memory.
CREATE INDEX question_bank_generation_identity_candidates
 ON question_bank(academic_year,grade_level,subject_id,lower(trim(stem_text)))
 WHERE question_type='MULTIPLE_CHOICE';
CREATE TABLE question_generation_lineage (
  question_id TEXT PRIMARY KEY REFERENCES question_bank(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES question_generation_jobs(id),
  source_model TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  subject_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academic_year,grade_level,subject_id,content_hash)
);
CREATE INDEX question_generation_lineage_job ON question_generation_lineage(job_id);
-- A commit gate is written in the same D1 batch as every draft, link, lineage,
-- final status and audit record. A zero-row gate and an incomplete batch abort.
CREATE TABLE question_generation_commit_gates (
  job_id TEXT PRIMARY KEY REFERENCES question_generation_jobs(id),
  lease_token TEXT NOT NULL
);
CREATE TABLE question_generation_commit_assertions (
  job_id TEXT PRIMARY KEY REFERENCES question_generation_jobs(id)
);
CREATE TRIGGER question_generation_draft_guard BEFORE INSERT ON question_bank
WHEN NEW.source_job_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'GENERATION_COMMIT_FENCE') WHERE NOT EXISTS (
  SELECT 1 FROM question_generation_commit_gates g JOIN question_generation_jobs j ON j.id=g.job_id
  JOIN outcomes o ON o.id=j.outcome_id JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id
  WHERE g.job_id=NEW.source_job_id AND j.status='RUNNING' AND j.lease_token=g.lease_token
  AND j.lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  AND o.active=1 AND cv.verified=1 AND o.curriculum_version_id=j.curriculum_version_id
  AND o.code IS j.outcome_code AND o.title=j.outcome_title
  AND o.grade_level=j.grade_level AND cv.grade_level=j.grade_level
  AND o.subject_id=j.subject_id AND cv.academic_year=j.academic_year AND cv.program_version=j.program_version
  AND EXISTS(SELECT 1 FROM learning_nodes n WHERE n.id='ln_'||o.id AND n.active=1 AND n.node_type='OUTCOME'
   AND n.academic_year=cv.academic_year AND n.grade_level=o.grade_level AND n.subject_id=o.subject_id)
  AND NEW.academic_year=j.academic_year AND NEW.grade_level=j.grade_level AND NEW.subject_id=j.subject_id
  AND NEW.origin_kind='AI_GENERATED' AND NEW.review_status='REVIEW' AND NEW.copyright_status='RESTRICTED'
 );
END;
CREATE TRIGGER question_generation_complete_guard BEFORE INSERT ON question_generation_commit_assertions
BEGIN
 SELECT RAISE(ABORT,'GENERATION_COMMIT_INCOMPLETE') WHERE NOT EXISTS (
  SELECT 1 FROM question_generation_jobs j WHERE j.id=NEW.job_id AND j.status='REVIEW_READY'
  AND j.generated_count=j.question_count
  AND (SELECT COUNT(*) FROM question_generation_lineage l WHERE l.job_id=j.id)=j.question_count
  AND (SELECT COUNT(*) FROM question_generation_lineage l JOIN question_learning_links ql ON ql.question_id=l.question_id
       WHERE l.job_id=j.id AND ql.node_id='ln_'||j.outcome_id)=j.question_count
 );
END;
