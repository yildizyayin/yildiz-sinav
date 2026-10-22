-- A037: common written exam (ortak yazılı) topic–question distribution tables.
-- ÖDSGM (MEB) publishes the tables for its subjects, provincial committees for the others; a table holds
-- several scenarios and each school committee chooses one. A table is officially verified only from a
-- source document of the same academic year: without a 2027–2028 document no 2027–2028 table is official.
CREATE TABLE IF NOT EXISTS written_exam_tables (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  term INTEGER NOT NULL CHECK (term IN (1,2)),
  exam_no INTEGER NOT NULL DEFAULT 1 CHECK (exam_no BETWEEN 1 AND 3),
  grade_level INTEGER NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  authority TEXT NOT NULL CHECK (authority IN ('ODSGM','IL_ZUMRE','OKUL_ZUMRE')),
  province TEXT,
  institution_id TEXT REFERENCES institutions(id),
  source_title TEXT NOT NULL,
  source_url TEXT,
  source_academic_year TEXT,
  source_published_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','VERIFIED','ZUMRE','ARCHIVED')),
  verified_by TEXT,
  verified_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_written_exam_tables_lookup ON written_exam_tables(academic_year, term, grade_level, subject_id, status);

CREATE TABLE IF NOT EXISTS written_exam_scenarios (
  id TEXT PRIMARY KEY,
  table_id TEXT NOT NULL REFERENCES written_exam_tables(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_written_exam_scenarios_table ON written_exam_scenarios(table_id, sort_order);

CREATE TABLE IF NOT EXISTS written_exam_scenario_rows (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL REFERENCES written_exam_scenarios(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 1,
  unit TEXT,
  topic TEXT,
  outcome_code TEXT,
  outcome_id TEXT REFERENCES outcomes(id),
  question_count INTEGER NOT NULL CHECK (question_count BETWEEN 1 AND 20)
);
CREATE INDEX IF NOT EXISTS idx_written_exam_rows_scenario ON written_exam_scenario_rows(scenario_id, sort_order);

-- A school committee's choice of one scenario for its common written exam.
CREATE TABLE IF NOT EXISTS written_exam_scenario_choices (
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  table_id TEXT NOT NULL REFERENCES written_exam_tables(id),
  scenario_id TEXT NOT NULL REFERENCES written_exam_scenarios(id),
  chosen_by TEXT NOT NULL,
  chosen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (institution_id, table_id)
);
