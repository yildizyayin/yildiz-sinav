PRAGMA foreign_keys = ON;

-- Optional fields are populated only when they exist in a verified official row.
ALTER TABLE university_program_targets ADD COLUMN city TEXT;
ALTER TABLE university_program_targets ADD COLUMN education_language TEXT;
ALTER TABLE university_program_targets ADD COLUMN education_type TEXT;

CREATE INDEX IF NOT EXISTS idx_university_preference_filters
  ON university_program_targets(source_year,city,score_type,university_type,scholarship,active);
CREATE INDEX IF NOT EXISTS idx_secondary_preference_filters
  ON secondary_school_targets(source_year,city,district,school_type,placement_type,active);

-- This is a private planning list, not an official ÖSYM/e-Okul submission.
CREATE TABLE IF NOT EXISTS student_preference_lists (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('LGS_SCHOOL','YKS_PROGRAM')),
  source_year INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT 'Tercih Çalışma Listem',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_student_preference_active
  ON student_preference_lists(student_id,target_type,source_year)
  WHERE status='DRAFT';

CREATE TABLE IF NOT EXISTS student_preference_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES student_preference_lists(id) ON DELETE CASCADE,
  secondary_school_target_id TEXT REFERENCES secondary_school_targets(id),
  university_program_target_id TEXT REFERENCES university_program_targets(id),
  sort_order INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((secondary_school_target_id IS NOT NULL AND university_program_target_id IS NULL) OR
        (secondary_school_target_id IS NULL AND university_program_target_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_preference_school_once
  ON student_preference_items(list_id,secondary_school_target_id)
  WHERE secondary_school_target_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_preference_program_once
  ON student_preference_items(list_id,university_program_target_id)
  WHERE university_program_target_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_preference_item_order ON student_preference_items(list_id,sort_order);

