-- A053: guidance report. Private counselling records are kept apart from everything shared: only the
-- guidance teacher of the student's class (and the Super Admin, every read logged) sees them; they are
-- append-only. The support plan is the shared part: the guidance teacher writes it and decides whether the
-- student and parent see it.
CREATE TABLE guidance_private_records (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX guidance_private_records_student ON guidance_private_records(student_id, created_at DESC);
CREATE TRIGGER guidance_private_records_no_update BEFORE UPDATE ON guidance_private_records BEGIN SELECT RAISE(ABORT,'PRIVATE_RECORD_IMMUTABLE'); END;
CREATE TRIGGER guidance_private_records_no_delete BEFORE DELETE ON guidance_private_records BEGIN SELECT RAISE(ABORT,'PRIVATE_RECORD_IMMUTABLE'); END;

CREATE TABLE guidance_support_plans (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  goals TEXT NOT NULL,
  actions TEXT NOT NULL,
  review_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED')),
  shared_with_student INTEGER NOT NULL DEFAULT 0,
  shared_with_parent INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
