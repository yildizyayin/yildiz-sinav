-- Öğrenci rehberliği (owner, 13 Nov 2026): "öğrenci sadece rehberin ona gönderdiği işleri görebilsin". The screen &
-- sleep diary therefore opens for a class (or one student) only when the guidance teacher asks for it, for a period.
CREATE TABLE IF NOT EXISTS guidance_screen_requests (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES student_entities(id) ON DELETE CASCADE,
  counselor_id TEXT NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(class_id IS NOT NULL OR student_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_guidance_screen_requests_class ON guidance_screen_requests(class_id, end_date);
CREATE INDEX IF NOT EXISTS idx_guidance_screen_requests_student ON guidance_screen_requests(student_id, end_date);
