-- A request is a durable, manually initiated intent. No question is generated or
-- approved by this table; a later executor must introduce its own reviewed state.
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
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','CANCELLED')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT,
  cancelled_by TEXT REFERENCES users(id),
  CHECK((status='REQUESTED' AND cancelled_at IS NULL AND cancelled_by IS NULL) OR
        (status='CANCELLED' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL))
);
-- SQLite's partial unique index arbitrates simultaneous requests, even when
-- separate Workers observe no active job before attempting their inserts.
CREATE UNIQUE INDEX question_generation_jobs_active_outcome_context
  ON question_generation_jobs(outcome_id,curriculum_version_id)
  WHERE status='REQUESTED';
CREATE INDEX question_generation_jobs_year_cursor
  ON question_generation_jobs(academic_year,id);
CREATE INDEX question_generation_jobs_year_outcome_cursor
  ON question_generation_jobs(academic_year,outcome_id,id);
