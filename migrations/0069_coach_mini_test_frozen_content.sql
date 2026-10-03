-- New tests capture the exact content and answer key used for grading.
-- Legacy rows remain NULL: current content cannot recreate historical evidence.
ALTER TABLE coach_mini_test_questions ADD COLUMN snapshot_json TEXT;
