-- Öğrenme Evreni PR-5 (owner, 11 Nov 2026): a teacher gives an outcome (optionally one game kind) to a class or to
-- chosen students. Done is not stored: it is read from the student's finished Evren games after the task was given.
CREATE TABLE IF NOT EXISTS lu_tasks (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  class_id TEXT REFERENCES classes(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  template_code TEXT REFERENCES lu_game_templates(code),
  note TEXT CHECK(note IS NULL OR length(note)<=300),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_lu_tasks_creator ON lu_tasks(created_by,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lu_tasks_institution ON lu_tasks(institution_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS lu_task_recipients (
  task_id TEXT NOT NULL REFERENCES lu_tasks(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  PRIMARY KEY(task_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_lu_task_recipients_student ON lu_task_recipients(student_id);
