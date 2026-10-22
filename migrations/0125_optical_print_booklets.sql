-- A035: the booklet printed on a student's optical sheet was recomputed on every print from the class list
-- order (A,B,A,B…). Sorting by name instead of number, or one new student, gave the same student another
-- booklet on a reprint. The first printed booklet is now kept per exam and student.
CREATE TABLE IF NOT EXISTS optical_print_booklets (
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  booklet_code TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (exam_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_optical_print_booklets_institution ON optical_print_booklets(exam_id, institution_id);
