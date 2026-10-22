-- A038: open-ended / short-answer question production for written exams.
-- Separate from the multiple-choice pipeline: own jobs, analytic rubric per question, no options and no
-- answer letter, so no optical or automatic multiple-choice grading path can use these items.
CREATE TABLE open_ended_generation_jobs (
  id TEXT PRIMARY KEY,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  outcome_code TEXT,
  outcome_title TEXT NOT NULL,
  question_format TEXT NOT NULL CHECK(question_format IN ('OPEN_ENDED','SHORT_ANSWER')),
  question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 3),
  max_points INTEGER NOT NULL CHECK(max_points BETWEEN 1 AND 100),
  written_table_id TEXT REFERENCES written_exam_tables(id),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','RUNNING','REVIEW_READY','FAILED','CANCELLED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  generated_count INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until TEXT,
  error_code TEXT,
  generator_model TEXT,
  verifier_model TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  CHECK((status='RUNNING' AND lease_token IS NOT NULL AND lease_until IS NOT NULL) OR (status<>'RUNNING' AND lease_token IS NULL AND lease_until IS NULL)),
  CHECK((status='REVIEW_READY' AND completed_at IS NOT NULL AND generated_count=question_count) OR (status<>'REVIEW_READY' AND generated_count=0))
);
CREATE INDEX open_ended_generation_jobs_year ON open_ended_generation_jobs(academic_year, created_at DESC);

CREATE TABLE open_ended_generation_items (
  question_id TEXT PRIMARY KEY REFERENCES question_bank(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES open_ended_generation_jobs(id),
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX open_ended_generation_items_job ON open_ended_generation_items(job_id);

CREATE TABLE question_rubric_items (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  criterion TEXT NOT NULL,
  descriptor TEXT,
  points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 100),
  UNIQUE(question_id, sort_order)
);

ALTER TABLE question_bank ADD COLUMN written_format TEXT CHECK(written_format IS NULL OR written_format IN ('OPEN_ENDED','SHORT_ANSWER'));

-- The last statement of a commit batch: aborts the whole batch unless every draft, rubric and link landed.
CREATE TABLE open_ended_commit_assertions (job_id TEXT PRIMARY KEY REFERENCES open_ended_generation_jobs(id));
CREATE TRIGGER open_ended_commit_guard BEFORE INSERT ON open_ended_commit_assertions
BEGIN
 SELECT RAISE(ABORT,'OPEN_ENDED_COMMIT_INCOMPLETE') WHERE NOT EXISTS (
  SELECT 1 FROM open_ended_generation_jobs j WHERE j.id=NEW.job_id AND j.status='REVIEW_READY' AND j.generated_count=j.question_count
  AND (SELECT count(*) FROM open_ended_generation_items i JOIN question_bank q ON q.id=i.question_id
       WHERE i.job_id=j.id AND q.question_type='OPEN_ENDED' AND q.options_json IS NULL AND q.correct_answer IS NULL
       AND q.review_status='REVIEW' AND q.copyright_status='RESTRICTED'
       AND EXISTS(SELECT 1 FROM question_learning_links l WHERE l.question_id=q.id AND l.node_id='ln_'||j.outcome_id)
       AND (SELECT coalesce(sum(r.points),0) FROM question_rubric_items r WHERE r.question_id=q.id)=j.max_points)=j.question_count
 );
END;
