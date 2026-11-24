-- Birleşik Karne: what a teacher did about an outcome for a student (plan: "öğretmen müdahaleleri").
-- Staff-only notes; never shown to students or parents. History is kept: rows are not updated, only withdrawn.
CREATE TABLE IF NOT EXISTS learning_interventions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  kind TEXT NOT NULL CHECK(kind IN ('ONE_TO_ONE','EXTRA_PRACTICE','CLASS_REVIEW','PARENT_CONTACT','GUIDANCE_REFERRAL','OTHER')),
  note TEXT CHECK(note IS NULL OR length(note) <= 500),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  withdrawn_at TEXT,
  withdrawn_by TEXT REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_learning_interventions_student ON learning_interventions(student_id, outcome_id, created_at);
