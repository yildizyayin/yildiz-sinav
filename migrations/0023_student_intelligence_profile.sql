PRAGMA foreign_keys = ON;

-- Persistent, role-safe educational intelligence read model.
-- This does not replace outcome_results, Learning Graph, RBA, targets, assignments or Zero Error;
-- it summarizes their verified educational signals for fast student/Nibiru consumption.
CREATE TABLE IF NOT EXISTS student_intelligence_profiles (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year TEXT,
  grade_level INTEGER,
  class_id TEXT REFERENCES classes(id),
  profile_version INTEGER NOT NULL DEFAULT 1,
  mastery_score REAL,
  academic_confidence REAL NOT NULL DEFAULT 0 CHECK(academic_confidence BETWEEN 0 AND 1),
  learning_coverage REAL NOT NULL DEFAULT 0 CHECK(learning_coverage BETWEEN 0 AND 1),
  evidence_count INTEGER NOT NULL DEFAULT 0,
  strong_node_count INTEGER NOT NULL DEFAULT 0,
  stable_node_count INTEGER NOT NULL DEFAULT 0,
  developing_node_count INTEGER NOT NULL DEFAULT 0,
  critical_node_count INTEGER NOT NULL DEFAULT 0,
  insufficient_node_count INTEGER NOT NULL DEFAULT 0,
  recent_exam_count INTEGER NOT NULL DEFAULT 0,
  exam_trend TEXT NOT NULL DEFAULT 'INSUFFICIENT' CHECK(exam_trend IN ('RISING','STABLE','FALLING','INSUFFICIENT')),
  reviewed_guidance_signal_count INTEGER NOT NULL DEFAULT 0,
  active_target_count INTEGER NOT NULL DEFAULT 0,
  open_zero_error_count INTEGER NOT NULL DEFAULT 0,
  active_assignment_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  refreshed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_intelligence_institution ON student_intelligence_profiles(institution_id,grade_level,refreshed_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_intelligence_priority ON student_intelligence_profiles(critical_node_count,developing_node_count,academic_confidence);

CREATE TABLE IF NOT EXISTS student_intelligence_profile_history (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  profile_version INTEGER NOT NULL,
  mastery_score REAL,
  academic_confidence REAL NOT NULL DEFAULT 0,
  learning_coverage REAL NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  exam_trend TEXT NOT NULL DEFAULT 'INSUFFICIENT',
  strong_node_count INTEGER NOT NULL DEFAULT 0,
  developing_node_count INTEGER NOT NULL DEFAULT 0,
  critical_node_count INTEGER NOT NULL DEFAULT 0,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id,profile_version)
);
CREATE INDEX IF NOT EXISTS idx_student_intelligence_history ON student_intelligence_profile_history(student_id,profile_version DESC);

INSERT OR REPLACE INTO platform_features(feature_key,label,stage,enabled_default)
VALUES('STUDENT_INTELLIGENCE','Öğrenci Akademik Zekâ Profili','STANDARD',1);
