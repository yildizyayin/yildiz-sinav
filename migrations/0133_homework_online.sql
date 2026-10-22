-- A060: online homework. Answers are revealed after the due date by default; the teacher may choose
-- "right after submission" per assignment. Students keep a draft until they submit (first submission counts, A054).
ALTER TABLE assignments ADD COLUMN answer_reveal TEXT NOT NULL DEFAULT 'AFTER_DUE' CHECK(answer_reveal IN ('AFTER_DUE','AFTER_SUBMIT'));
CREATE TABLE homework_drafts (
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL CHECK(json_valid(answers_json)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(assignment_id, student_id)
);
