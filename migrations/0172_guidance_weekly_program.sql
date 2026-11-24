-- Rehberlik R2 — akademik takip ve hazır haftalık program (owner, 12 Nov 2026).
-- The system prepares a week from the student's own deficits (rules, no AI); the guidance teacher edits it and gives it.
-- The student sees it on "Bu Haftam", the parent in the weekly view. Questions solved inside ANUNEX are counted
-- automatically; what the student enters from a book is kept apart as a declaration ("beyan") and never mixed with
-- verified work.

CREATE TABLE IF NOT EXISTS guidance_programs (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,              -- Monday, YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','GIVEN')),
  weekly_target INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  show_signature INTEGER NOT NULL DEFAULT 1 CHECK(show_signature IN (0,1)),
  created_by TEXT REFERENCES users(id),
  given_by TEXT REFERENCES users(id),
  given_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, week_start)
);
CREATE INDEX IF NOT EXISTS idx_guidance_programs_week ON guidance_programs(institution_id, week_start);

CREATE TABLE IF NOT EXISTS guidance_program_items (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES guidance_programs(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK(day BETWEEN 1 AND 7),     -- 1 Monday … 7 Sunday
  subject_id TEXT REFERENCES subjects(id),
  outcome_id TEXT REFERENCES outcomes(id),
  topic TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('MAVI_FOY','KIRMIZI_FOY','DEJAVU','SIFIR_HATA','OKUL_KITABI','ANUNEX','DIGER')),
  source_detail TEXT,
  target_count INTEGER NOT NULL DEFAULT 0 CHECK(target_count BETWEEN 0 AND 500),
  origin TEXT NOT NULL DEFAULT 'SYSTEM' CHECK(origin IN ('SYSTEM','COUNSELOR','TEACHER','STUDENT')),
  kind TEXT NOT NULL DEFAULT 'WEAK' CHECK(kind IN ('WEAK','WORKSHEET','SUPPORT','REVIEW','TEACHER','OWN','EXTRA')),
  reason TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
  done_at TEXT,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_guidance_program_items_program ON guidance_program_items(program_id, day, sort);

-- What the student solved from a book: a declaration, shown as such.
CREATE TABLE IF NOT EXISTS guidance_study_logs (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id),
  source TEXT NOT NULL CHECK(source IN ('MAVI_FOY','KIRMIZI_FOY','DEJAVU','SIFIR_HATA','OKUL_KITABI','ANUNEX','DIGER')),
  solved INTEGER NOT NULL CHECK(solved BETWEEN 1 AND 500),
  correct INTEGER NOT NULL DEFAULT 0 CHECK(correct>=0),
  wrong INTEGER NOT NULL DEFAULT 0 CHECK(wrong>=0),
  blank INTEGER NOT NULL DEFAULT 0 CHECK(blank>=0),
  item_id TEXT REFERENCES guidance_program_items(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(correct+wrong+blank<=solved)
);
CREATE INDEX IF NOT EXISTS idx_guidance_study_logs_student ON guidance_study_logs(student_id, log_date);

-- A subject teacher's target for a class and week; it joins the programmes of that class automatically.
CREATE TABLE IF NOT EXISTS guidance_subject_targets (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  teacher_id TEXT NOT NULL REFERENCES users(id),
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  week_start TEXT NOT NULL,
  topic TEXT NOT NULL,
  target_count INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 500),
  source TEXT NOT NULL DEFAULT 'DIGER' CHECK(source IN ('MAVI_FOY','KIRMIZI_FOY','DEJAVU','SIFIR_HATA','OKUL_KITABI','ANUNEX','DIGER')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guidance_subject_targets_class ON guidance_subject_targets(class_id, week_start);

-- The guidance teacher's own templates ("8. sınıf LGS yoğun" …).
CREATE TABLE IF NOT EXISTS guidance_program_templates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  weekly_target INTEGER NOT NULL CHECK(weekly_target BETWEEN 10 AND 3000),
  weak_pct INTEGER NOT NULL DEFAULT 60,
  worksheet_pct INTEGER NOT NULL DEFAULT 30,
  review_pct INTEGER NOT NULL DEFAULT 10,
  study_days TEXT NOT NULL DEFAULT '1,2,3,4,5,6',
  review_day INTEGER NOT NULL DEFAULT 7,
  show_signature INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(weak_pct+worksheet_pct+review_pct=100)
);
