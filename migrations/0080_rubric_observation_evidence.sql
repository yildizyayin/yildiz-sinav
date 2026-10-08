CREATE TABLE learning_rubric_observations (
 id TEXT PRIMARY KEY,
 student_id TEXT NOT NULL REFERENCES student_entities(id),
 enrollment_id TEXT NOT NULL REFERENCES student_enrollments(id),
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 season_id TEXT NOT NULL REFERENCES institution_seasons(id),
 class_id TEXT NOT NULL REFERENCES classes(id),
 subject_id TEXT NOT NULL REFERENCES subjects(id),
 rubric_id TEXT NOT NULL REFERENCES learning_rubric_versions(id),
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 selections_json TEXT NOT NULL CHECK(json_valid(selections_json)),
 evidence_note TEXT NOT NULL,
 feedback TEXT NOT NULL,
 next_step TEXT NOT NULL,
 observed_at TEXT NOT NULL,
 observer_id TEXT NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(observer_id,request_id)
);
CREATE INDEX rubric_observation_student_scope ON learning_rubric_observations(student_id,institution_id,season_id,subject_id,published_at);
CREATE TABLE learning_rubric_observation_withdrawals (
 observation_id TEXT PRIMARY KEY REFERENCES learning_rubric_observations(id),
 withdrawn_by TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL,
 withdrawn_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER rubric_observation_no_update BEFORE UPDATE ON learning_rubric_observations
 BEGIN SELECT RAISE(ABORT,'OBSERVATION_IMMUTABLE'); END;
CREATE TRIGGER rubric_observation_no_delete BEFORE DELETE ON learning_rubric_observations
 BEGIN SELECT RAISE(ABORT,'OBSERVATION_IMMUTABLE'); END;
CREATE TRIGGER rubric_withdrawal_no_update BEFORE UPDATE ON learning_rubric_observation_withdrawals
 BEGIN SELECT RAISE(ABORT,'WITHDRAWAL_IMMUTABLE'); END;
CREATE TRIGGER rubric_withdrawal_no_delete BEFORE DELETE ON learning_rubric_observation_withdrawals
 BEGIN SELECT RAISE(ABORT,'WITHDRAWAL_IMMUTABLE'); END;
