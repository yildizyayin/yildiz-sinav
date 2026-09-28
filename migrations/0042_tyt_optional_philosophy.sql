PRAGMA foreign_keys = ON;

-- TYT answer-key files may contain the five-question elective Philosophy
-- branch in addition to the 120-question scored envelope. The exam structure
-- remains TYT_TUR 40 + TYT_SOS 20 + TYT_MAT 40 + TYT_FEN 20; this stable token
-- is intentionally available for answer-key parsing and outcome mapping only.
INSERT OR IGNORE INTO subjects(id,code,name,category)
VALUES ('sub_tyt_fel','TYT_FEL','TYT Felsefe (Seçmeli)','VERBAL');

CREATE TABLE IF NOT EXISTS exam_optional_answer_keys (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  booklet_code TEXT NOT NULL,
  question_no INTEGER NOT NULL,
  correct_answer TEXT NOT NULL,
  option_count INTEGER NOT NULL DEFAULT 4 CHECK(option_count IN (4,5)),
  accepted_answers TEXT NOT NULL DEFAULT '',
  question_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(question_status IN ('ACTIVE','CANCELLED','EXCLUDED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,subject_id,booklet_code,question_no)
);

CREATE INDEX IF NOT EXISTS idx_exam_optional_answer_keys_exam
  ON exam_optional_answer_keys(exam_id,subject_id,booklet_code,question_no);
