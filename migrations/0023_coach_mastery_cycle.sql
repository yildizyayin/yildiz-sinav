PRAGMA foreign_keys = ON;

-- Nibiru Education Coach verified learning loop:
-- task -> 5-10 question mini-test -> remeasurement -> support/retry or mastery.

CREATE TABLE IF NOT EXISTS coach_mini_tests (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  assignment_item_id TEXT NOT NULL REFERENCES assignment_items(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  cycle_no INTEGER NOT NULL DEFAULT 1 CHECK(cycle_no >= 1),
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','PASSED','FAILED','CANCELLED')),
  question_count INTEGER NOT NULL CHECK(question_count BETWEEN 5 AND 10),
  correct_count INTEGER,
  score_percent REAL,
  pass_threshold REAL NOT NULL DEFAULT 0.80 CHECK(pass_threshold BETWEEN 0.50 AND 1.00),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  UNIQUE(assignment_item_id,student_id,cycle_no)
);
CREATE INDEX IF NOT EXISTS idx_coach_mini_test_student
  ON coach_mini_tests(student_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_mini_test_item
  ON coach_mini_tests(assignment_item_id,student_id,cycle_no DESC);

CREATE TABLE IF NOT EXISTS coach_mini_test_questions (
  test_id TEXT NOT NULL REFERENCES coach_mini_tests(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_bank(id),
  sort_order INTEGER NOT NULL,
  student_answer TEXT,
  correct INTEGER,
  answered_at TEXT,
  PRIMARY KEY(test_id,question_id),
  UNIQUE(test_id,sort_order)
);

CREATE TABLE IF NOT EXISTS student_outcome_mastery (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'DEVELOPING' CHECK(status IN ('DEVELOPING','MASTERED')),
  cycle_count INTEGER NOT NULL DEFAULT 0,
  last_score REAL,
  last_test_id TEXT REFERENCES coach_mini_tests(id),
  mastered_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id,outcome_id)
);
CREATE INDEX IF NOT EXISTS idx_student_outcome_mastery_status
  ON student_outcome_mastery(student_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS coach_followup_actions (
  id TEXT PRIMARY KEY,
  test_id TEXT NOT NULL REFERENCES coach_mini_tests(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  action_type TEXT NOT NULL CHECK(action_type IN ('PRACTICE','VIDEO','TOPIC_REVIEW')),
  reference_id TEXT,
  title TEXT NOT NULL,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','DONE')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_coach_followup_test
  ON coach_followup_actions(test_id,student_id,status,created_at);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('COACH_MINI_TEST','Eğitim Koçu Mini Testi','STANDARD',1),
 ('COACH_REMEASUREMENT','Görev Sonrası Yeniden Ölçüm','STANDARD',1),
 ('COACH_MASTERY_LOOP','Kazanım Tamamlama Döngüsü','STANDARD',1);
