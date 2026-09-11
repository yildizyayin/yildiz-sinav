PRAGMA foreign_keys = ON;

-- Central archive for every exam-owned document. The exam_id is the stable
-- key shared by app.anunex.com and sonuc.anunex.com.
CREATE TABLE IF NOT EXISTS exam_document_assets (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('QUALIFIED_ANSWER_KEY','PLAIN_ANSWER_KEY_PDF','SOURCE_ANSWER_KEY','EXAM_PDF','PUBLISHER_LOGO','OTHER')),
  booklet_code TEXT NOT NULL DEFAULT 'A',
  r2_key TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('PROCESSING','READY','FAILED','ARCHIVED')),
  visibility TEXT NOT NULL DEFAULT 'INSTITUTION_TEACHER' CHECK(visibility IN ('SUPER_ADMIN','INSTITUTION_TEACHER','STUDENT','PUBLIC')),
  metadata_json TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_exam_document_assets_exam ON exam_document_assets(exam_id, asset_type, version DESC);

-- Extend existing video_links without breaking legacy result consumers. A
-- scheduled link remains approved=0 until the cron publisher promotes it.
ALTER TABLE video_links ADD COLUMN exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE;
ALTER TABLE video_links ADD COLUMN provider TEXT NOT NULL DEFAULT 'EXTERNAL';
ALTER TABLE video_links ADD COLUMN status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED'));
ALTER TABLE video_links ADD COLUMN publish_at TEXT;
ALTER TABLE video_links ADD COLUMN published_at TEXT;
ALTER TABLE video_links ADD COLUMN visibility TEXT NOT NULL DEFAULT 'STUDENT_TEACHER' CHECK(visibility IN ('SUPER_ADMIN','INSTITUTION_TEACHER','STUDENT_TEACHER','PUBLIC'));
ALTER TABLE video_links ADD COLUMN link_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(link_status IN ('UNKNOWN','OK','BROKEN'));
ALTER TABLE video_links ADD COLUMN last_checked_at TEXT;
-- SQLite only permits constant defaults when adding a column to an existing
-- table; new writes set the timestamp explicitly.
ALTER TABLE video_links ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_video_links_exam_lifecycle ON video_links(exam_id, status, publish_at);
CREATE INDEX IF NOT EXISTS idx_video_links_exam_target ON video_links(exam_id, exam_question_id, outcome_id, link_type);
