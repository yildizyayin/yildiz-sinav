PRAGMA foreign_keys = ON;

-- TYT optional Philosophy (+5) is evidence-only. It must never alter the
-- official 120-question TYT score/net/rank envelope.
CREATE TABLE IF NOT EXISTS tyt_optional_philosophy_results (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  booklet_code TEXT NOT NULL,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  blank_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  success_percent REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(participant_id,subject_id)
);

CREATE TABLE IF NOT EXISTS tyt_optional_philosophy_answers (
  id TEXT PRIMARY KEY,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  answer_key_id TEXT NOT NULL REFERENCES exam_optional_answer_keys(id) ON DELETE CASCADE,
  answer TEXT,
  status TEXT NOT NULL CHECK(status IN ('CORRECT','WRONG','BLANK','INVALID')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(participant_id,answer_key_id)
);

CREATE INDEX IF NOT EXISTS idx_tyt_optional_philosophy_results_exam
  ON tyt_optional_philosophy_results(exam_id,subject_id);
CREATE INDEX IF NOT EXISTS idx_tyt_optional_philosophy_answers_participant
  ON tyt_optional_philosophy_answers(participant_id);
