-- A085: camera answer sheets of written papers. The sheet layout is fixed once (what was printed is what is
-- read); every photographed answer box is kept (R2) and linked to the student; digit grids give an exact
-- suggestion, free text an AI suggestion with confidence and flags. Suggestions never count as scores (A041).
CREATE TABLE written_paper_layouts (
  paper_id TEXT PRIMARY KEY REFERENCES written_papers(id),
  layout_json TEXT NOT NULL CHECK(json_valid(layout_json)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER written_paper_layouts_no_update BEFORE UPDATE ON written_paper_layouts BEGIN SELECT RAISE(ABORT,'LAYOUT_IMMUTABLE'); END;
CREATE TRIGGER written_paper_layouts_no_delete BEFORE DELETE ON written_paper_layouts BEGIN SELECT RAISE(ABORT,'LAYOUT_IMMUTABLE'); END;
CREATE TABLE written_answer_scans (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES written_papers(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  item_id TEXT NOT NULL REFERENCES written_paper_items(id),
  page_no INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  digits_read TEXT,
  read_confidence REAL,
  read_issues_json TEXT CHECK(read_issues_json IS NULL OR json_valid(read_issues_json)),
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX written_answer_scans_student ON written_answer_scans(paper_id, student_id, item_id, created_at DESC);
ALTER TABLE written_score_suggestions ADD COLUMN source TEXT NOT NULL DEFAULT 'TEXT_AI' CHECK(source IN ('TEXT_AI','VISION_AI','DIGIT_GRID'));
ALTER TABLE written_score_suggestions ADD COLUMN confidence REAL;
ALTER TABLE written_score_suggestions ADD COLUMN flags_json TEXT;
ALTER TABLE written_score_suggestions ADD COLUMN scan_id TEXT REFERENCES written_answer_scans(id);
