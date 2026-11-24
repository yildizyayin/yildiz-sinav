CREATE TABLE IF NOT EXISTS outcome_video_choices (
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_seconds INTEGER NOT NULL CHECK (start_seconds >= 0),
  end_seconds INTEGER NOT NULL CHECK (end_seconds - start_seconds BETWEEN 180 AND 300),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  PRIMARY KEY (outcome_id, youtube_video_id)
);

ALTER TABLE outcome_video_queue ADD COLUMN choices_checked_at TEXT;
