-- Stable booklet-specific identity for Studio-created exams.
-- Keeps printed position -> original question + official outcome independent of A layout.
CREATE TABLE IF NOT EXISTS studio_exam_booklet_positions (
 exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
 booklet_code TEXT NOT NULL,
 printed_question_no INTEGER NOT NULL CHECK(printed_question_no>0),
 source_question_id TEXT NOT NULL REFERENCES question_bank(id),
 exam_question_id TEXT NOT NULL REFERENCES exam_questions(id) ON DELETE CASCADE,
 subject_id TEXT NOT NULL REFERENCES subjects(id),
 PRIMARY KEY(exam_id,booklet_code,printed_question_no),
 UNIQUE(exam_id,booklet_code,source_question_id)
);
CREATE INDEX IF NOT EXISTS idx_studio_exam_booklet_source ON studio_exam_booklet_positions(source_question_id);
CREATE TABLE IF NOT EXISTS studio_exam_booklet_outcomes (
 exam_id TEXT NOT NULL,
 booklet_code TEXT NOT NULL,
 printed_question_no INTEGER NOT NULL,
 outcome_id TEXT NOT NULL REFERENCES outcomes(id),
 PRIMARY KEY(exam_id,booklet_code,printed_question_no,outcome_id),
 FOREIGN KEY(exam_id,booklet_code,printed_question_no)
  REFERENCES studio_exam_booklet_positions(exam_id,booklet_code,printed_question_no) ON DELETE CASCADE
);
