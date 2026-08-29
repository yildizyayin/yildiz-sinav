PRAGMA foreign_keys = ON;

-- Operational governance for publisher solution and topic-support links.
ALTER TABLE video_links ADD COLUMN provider TEXT NOT NULL DEFAULT 'PUBLISHER'
  CHECK(provider IN ('ANUNEX','PUBLISHER','EXTERNAL'));
ALTER TABLE video_links ADD COLUMN source_label TEXT;
ALTER TABLE video_links ADD COLUMN duration_seconds INTEGER;
ALTER TABLE video_links ADD COLUMN safety_review_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(safety_review_status IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE video_links ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE video_links ADD COLUMN created_by TEXT REFERENCES users(id);
ALTER TABLE video_links ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE video_links ADD COLUMN approved_at TEXT;
ALTER TABLE video_links ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE video_links ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE video_links
SET safety_review_status=CASE WHEN approved=1 THEN 'APPROVED' ELSE 'PENDING' END,
    approved_at=CASE WHEN approved=1 THEN CURRENT_TIMESTAMP ELSE NULL END;

CREATE INDEX IF NOT EXISTS idx_video_links_question_support
  ON video_links(exam_question_id,link_type,approved,active,safety_review_status);
CREATE INDEX IF NOT EXISTS idx_video_links_outcome_support
  ON video_links(outcome_id,link_type,approved,active,safety_review_status);
