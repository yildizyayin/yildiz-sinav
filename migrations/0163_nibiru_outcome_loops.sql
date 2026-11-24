-- Nibiru kazanım iyileştirme döngüsü (owner, 9 Nov 2026): a wrong or blank deneme question opens one loop per
-- student and outcome: approved video -> mini test -> outcome mini game -> badge, or a single teacher notification.
-- The steps reuse the existing records (coach_mini_tests, notifications); this table only remembers the path.
CREATE TABLE IF NOT EXISTS nibiru_outcome_loops (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT NOT NULL REFERENCES institution_seasons(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  source_type TEXT NOT NULL CHECK(source_type IN ('EXAM_QUESTION','WEAK_OUTCOME')),
  source_ref TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PASSED','TEACHER_REVIEW','CLOSED')),
  video_kind TEXT,
  video_ref TEXT,
  video_done_at TEXT,
  mini_test_id TEXT REFERENCES coach_mini_tests(id),
  game_round_id TEXT,
  teacher_reason TEXT,
  notified_at TEXT,
  notified_count INTEGER NOT NULL DEFAULT 0,
  badge_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);
-- one running loop per student and outcome; a finished one may be followed by a new one later
CREATE UNIQUE INDEX IF NOT EXISTS idx_nibiru_loop_active ON nibiru_outcome_loops(student_id,outcome_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_nibiru_loop_student ON nibiru_outcome_loops(student_id,updated_at);
CREATE INDEX IF NOT EXISTS idx_nibiru_loop_institution ON nibiru_outcome_loops(institution_id,status);

-- The outcome mini game: a timed round of approved, rights-cleared questions of the same outcome, graded on the
-- server. Its answers are academic evidence (source GAME); its XP is a separate reward and never mixed into accuracy.
CREATE TABLE IF NOT EXISTS nibiru_game_rounds (
  id TEXT PRIMARY KEY,
  loop_id TEXT NOT NULL REFERENCES nibiru_outcome_loops(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','PASSED','FAILED')),
  question_count INTEGER NOT NULL CHECK(question_count BETWEEN 5 AND 10),
  correct_count INTEGER,
  score_percent REAL,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  UNIQUE(loop_id)
);
CREATE TABLE IF NOT EXISTS nibiru_game_questions (
  round_id TEXT NOT NULL REFERENCES nibiru_game_rounds(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_bank(id),
  sort_order INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  student_answer TEXT,
  correct INTEGER,
  answered_at TEXT,
  PRIMARY KEY(round_id,question_id)
);
CREATE INDEX IF NOT EXISTS idx_nibiru_game_student ON nibiru_game_rounds(student_id,outcome_id);
