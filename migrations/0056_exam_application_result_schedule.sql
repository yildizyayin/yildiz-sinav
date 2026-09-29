ALTER TABLE exams ADD COLUMN application_start_at TEXT;
ALTER TABLE exams ADD COLUMN application_end_at TEXT;
ALTER TABLE exam_delivery_profiles ADD COLUMN result_publish_at TEXT;

CREATE INDEX IF NOT EXISTS idx_exams_application_window
  ON exams(application_start_at, application_end_at);
CREATE INDEX IF NOT EXISTS idx_exam_delivery_profiles_result_publish
  ON exam_delivery_profiles(result_freeze_status, result_publish_at);
