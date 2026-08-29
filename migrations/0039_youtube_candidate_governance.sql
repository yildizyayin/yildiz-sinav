PRAGMA foreign_keys = ON;

ALTER TABLE youtube_micro_video_candidates ADD COLUMN channel_id TEXT;
ALTER TABLE youtube_micro_video_candidates ADD COLUMN embeddable INTEGER NOT NULL DEFAULT 0 CHECK(embeddable IN (0,1));
ALTER TABLE youtube_micro_video_candidates ADD COLUMN privacy_status TEXT;
ALTER TABLE youtube_micro_video_candidates ADD COLUMN age_restricted INTEGER NOT NULL DEFAULT 0 CHECK(age_restricted IN (0,1));
ALTER TABLE youtube_micro_video_candidates ADD COLUMN policy_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(policy_status IN ('PENDING','PASSED','REJECTED'));
ALTER TABLE youtube_micro_video_candidates ADD COLUMN policy_flags_json TEXT;
ALTER TABLE youtube_micro_video_candidates ADD COLUMN human_review_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK(human_review_status IN ('PENDING','APPROVED','REJECTED'));
ALTER TABLE youtube_micro_video_candidates ADD COLUMN reviewed_by TEXT REFERENCES users(id);
ALTER TABLE youtube_micro_video_candidates ADD COLUMN reviewed_at TEXT;
ALTER TABLE youtube_micro_video_candidates ADD COLUMN review_note TEXT;
ALTER TABLE youtube_micro_video_candidates ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1));
ALTER TABLE youtube_micro_video_candidates ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Legacy AI-ranked candidates are not grandfathered into student visibility.
UPDATE youtube_micro_video_candidates
SET policy_status='PENDING',human_review_status='PENDING',active=1;

CREATE INDEX IF NOT EXISTS idx_youtube_candidate_review
  ON youtube_micro_video_candidates(human_review_status,policy_status,active,fetched_at DESC);
