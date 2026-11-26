-- İçerik paketleri (owner, 26 Nov 2026): a ready-made package (questions + images + solution videos + topic videos)
-- enters the bank through the Super Admin package importer. Questions stay REVIEW; media are content-addressed and
-- sealed at upload. The package's own question id (e.g. FB511-01) is kept so a re-upload adds nothing, and every
-- question / topic gets a short random code for its permanent video page and printed QR.
CREATE TABLE IF NOT EXISTS content_package_items (
  external_id TEXT PRIMARY KEY,
  package TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  hint TEXT,
  video_code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_content_package_items_question ON content_package_items(question_id);
CREATE INDEX IF NOT EXISTS idx_content_package_items_package ON content_package_items(package, outcome_id);

CREATE TABLE IF NOT EXISTS content_package_topics (
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  package TEXT NOT NULL,
  learning_video_id TEXT NOT NULL REFERENCES learning_videos(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  byte_sha256 TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  video_code TEXT NOT NULL UNIQUE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (outcome_id, package)
);
