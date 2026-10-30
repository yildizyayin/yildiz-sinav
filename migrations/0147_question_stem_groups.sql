PRAGMA foreign_keys = ON;

-- P01: questions that share one root (a passage, a table, a figure) are a stem group. They are selected together,
-- printed next to each other in their own order and never swapped or split. The shared text itself is stored here
-- and goes through the same editorial approval as a question; until the booklet and the online exam can render it,
-- a group with shared text is refused there rather than printed without its root.
CREATE TABLE IF NOT EXISTS question_stem_groups (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL DEFAULT 'PLATFORM' CHECK(owner_type IN ('PLATFORM','INSTITUTION','PUBLISHER','USER')),
  owner_id TEXT,
  title TEXT,
  shared_stem_text TEXT,
  review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(review_status IN ('DRAFT','REVIEW','APPROVED','REJECTED','ARCHIVED')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE question_bank ADD COLUMN stem_group_id TEXT REFERENCES question_stem_groups(id);
ALTER TABLE question_bank ADD COLUMN stem_group_order INTEGER;
CREATE INDEX IF NOT EXISTS idx_question_bank_stem_group ON question_bank(stem_group_id, stem_group_order);

-- Quick Test versions: a copy made because the original already has attempts points back to it.
ALTER TABLE quick_tests ADD COLUMN version_of TEXT REFERENCES quick_tests(id);
