-- Outcome analysis is versioned separately from immutable score/rank snapshots.
CREATE TABLE exam_outcome_analysis_revisions (
 exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0),
 actor_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 published_app_at TEXT,
 published_result_at TEXT,
 PRIMARY KEY(exam_id,revision)
);
CREATE TABLE exam_outcome_analysis_history (
 exam_id TEXT NOT NULL,
 revision INTEGER NOT NULL,
 participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
 student_id TEXT REFERENCES student_entities(id),
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 academic_year TEXT NOT NULL,
 grade_level INTEGER,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 PRIMARY KEY(exam_id,revision,participant_id),
 FOREIGN KEY(exam_id,revision) REFERENCES exam_outcome_analysis_revisions(exam_id,revision) ON DELETE CASCADE
);
CREATE INDEX exam_outcome_history_participant ON exam_outcome_analysis_history(participant_id,revision);
CREATE TRIGGER cohort_revision_exam_outcome_history_insert AFTER INSERT ON exam_outcome_analysis_history BEGIN
 INSERT INTO cohort_report_revisions(institution_id,revision) VALUES(NEW.institution_id,1) ON CONFLICT(institution_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER cohort_revision_exam_outcome_analysis_publish AFTER UPDATE OF published_app_at,published_result_at ON exam_outcome_analysis_revisions BEGIN
 UPDATE cohort_report_global_revision SET revision=revision+1 WHERE id=1;
END;
