-- Sınıf Uzay Yarışı (owner, 25-26 Nov 2026). One row per race a teacher starts for a class; the live play itself runs
-- in a Durable Object. When the race ends each student's answers are written as a finished Öğrenme Evreni play
-- (lu_sessions with client_key 'race:<id>'), so they count as that outcome's evidence like any other game.
CREATE TABLE IF NOT EXISTS class_races (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  teacher_user_id TEXT NOT NULL REFERENCES users(id),
  question_ids_json TEXT NOT NULL,
  seconds_per_question INTEGER NOT NULL DEFAULT 20 CHECK(seconds_per_question BETWEEN 10 AND 60),
  status TEXT NOT NULL DEFAULT 'LOBBY' CHECK(status IN ('LOBBY','RUNNING','FINISHED','CANCELLED')),
  report_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_class_races_code ON class_races(code,status);
CREATE INDEX IF NOT EXISTS idx_class_races_teacher ON class_races(teacher_user_id,created_at);
