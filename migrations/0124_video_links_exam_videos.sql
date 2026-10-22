-- A033: the exam archive could not add a single video. The table only allowed SOLUTION/TOPIC links while the
-- archive adds whole-exam videos (link_type EXAM), and it read/wrote a description column no migration created.
-- SQLite cannot change a CHECK constraint, so the table is rebuilt with the same columns plus description,
-- then its indexes and triggers are recreated exactly as before. No other table references video_links.
-- (The only writer of exam videos always failed, so no description values exist to carry over.)
PRAGMA defer_foreign_keys = on;

CREATE TABLE video_links_v2 (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT REFERENCES worksheets(id) ON DELETE CASCADE,
  exam_question_id TEXT REFERENCES exam_questions(id) ON DELETE CASCADE,
  outcome_id TEXT REFERENCES outcomes(id),
  link_type TEXT NOT NULL CHECK(link_type IN ('EXAM','SOLUTION','TOPIC')),
  url TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  exam_id TEXT REFERENCES exams(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'EXTERNAL',
  status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK(status IN ('DRAFT','SCHEDULED','PUBLISHED','ARCHIVED')),
  publish_at TEXT,
  published_at TEXT,
  visibility TEXT NOT NULL DEFAULT 'STUDENT_TEACHER' CHECK(visibility IN ('SUPER_ADMIN','INSTITUTION_TEACHER','STUDENT_TEACHER','PUBLIC')),
  link_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(link_status IN ('UNKNOWN','OK','BROKEN')),
  last_checked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT '',
  description TEXT
);

INSERT INTO video_links_v2 (id,worksheet_id,exam_question_id,outcome_id,link_type,url,approved,title,exam_id,provider,status,publish_at,published_at,visibility,link_status,last_checked_at,updated_at)
SELECT id,worksheet_id,exam_question_id,outcome_id,link_type,url,approved,title,exam_id,provider,status,publish_at,published_at,visibility,link_status,last_checked_at,updated_at FROM video_links;

DROP TABLE video_links;
ALTER TABLE video_links_v2 RENAME TO video_links;

CREATE INDEX IF NOT EXISTS idx_video_links_exam_lifecycle ON video_links(exam_id, status, publish_at);
CREATE INDEX IF NOT EXISTS idx_video_links_exam_target ON video_links(exam_id, exam_question_id, outcome_id, link_type);

CREATE TRIGGER video_links_normalize_publish_at_insert
AFTER INSERT ON video_links
WHEN NEW.publish_at IS NOT NULL
  AND datetime(NEW.publish_at) IS NOT NULL
  AND NEW.publish_at <> datetime(NEW.publish_at)
BEGIN
  UPDATE video_links SET publish_at=datetime(NEW.publish_at) WHERE id=NEW.id;
END;

CREATE TRIGGER video_links_normalize_publish_at_update
AFTER UPDATE OF publish_at ON video_links
WHEN NEW.publish_at IS NOT NULL
  AND datetime(NEW.publish_at) IS NOT NULL
  AND NEW.publish_at <> datetime(NEW.publish_at)
BEGIN
  UPDATE video_links SET publish_at=datetime(NEW.publish_at) WHERE id=NEW.id;
END;

CREATE TRIGGER rev_video_links_insert AFTER INSERT ON video_links BEGIN UPDATE exam_revision_state SET revision=revision+1,changed_at=CURRENT_TIMESTAMP WHERE exam_id=NEW.exam_id; END;
CREATE TRIGGER rev_video_links_update AFTER UPDATE ON video_links BEGIN UPDATE exam_revision_state SET revision=revision+1,changed_at=CURRENT_TIMESTAMP WHERE exam_id=NEW.exam_id; END;
CREATE TRIGGER rev_video_links_delete AFTER DELETE ON video_links BEGIN UPDATE exam_revision_state SET revision=revision+1,changed_at=CURRENT_TIMESTAMP WHERE exam_id=OLD.exam_id; END;
