-- Internal continuation and temporary FIRST/LATEST choices; no public API or license change.
ALTER TABLE private_cohort_report_jobs ADD COLUMN pending_json TEXT CHECK(pending_json IS NULL OR json_valid(pending_json));
ALTER TABLE private_cohort_report_jobs ADD COLUMN step_no INTEGER NOT NULL DEFAULT 0;
ALTER TABLE private_cohort_report_jobs ADD COLUMN processed_events INTEGER NOT NULL DEFAULT 0;
CREATE TABLE private_cohort_practice_picks (
 job_id TEXT NOT NULL REFERENCES private_cohort_report_jobs(id) ON DELETE CASCADE,
 enrollment_id TEXT NOT NULL,
 repeat_key TEXT NOT NULL,
 evidence_time REAL NOT NULL,
 run_id TEXT NOT NULL,
 run_order TEXT NOT NULL,
 row_json TEXT NOT NULL CHECK(json_valid(row_json)),
 PRIMARY KEY(job_id,enrollment_id,repeat_key)
);
CREATE INDEX cohort_foy_enrollment_events ON frozen_foy_response_evidence(enrollment_id,response_id);
CREATE INDEX cohort_game_enrollment_events ON frozen_game_session_evidence(enrollment_id,session_id);
CREATE INDEX cohort_practice_student_events ON assessment_runs(student_id,source_type,id,institution_id);
CREATE INDEX cohort_exam_student_events ON exam_result_snapshots(student_id,id,institution_id);
