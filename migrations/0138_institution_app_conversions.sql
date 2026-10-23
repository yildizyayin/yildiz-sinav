-- S022: a Result Network school that moves (or is about to move) to the licensed app. While a row exists, the
-- end-of-term clean-up never deletes this school's students or results.
CREATE TABLE institution_app_conversions (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('PLANNED','CONVERTED')),
  planned_by TEXT REFERENCES users(id),
  planned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  converted_by TEXT REFERENCES users(id),
  converted_at TEXT,
  note TEXT
);
