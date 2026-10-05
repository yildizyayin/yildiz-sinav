CREATE INDEX IF NOT EXISTS rubric_observation_student_history
 ON learning_rubric_observations(student_id,observed_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS rubric_observation_institution_history
 ON learning_rubric_observations(institution_id,season_id,observed_at DESC,id DESC);
