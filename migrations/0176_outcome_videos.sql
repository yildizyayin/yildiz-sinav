-- Kazanım videosu (owner, 12 Nov 2026): a learner sees, for an outcome, 1) the system's approved video, 2) a link
-- the school's teacher added, 3) otherwise a YouTube video found automatically — without waiting for approval — but
-- only as a real segment of that outcome (start/end seconds), found by Gemini watching the public video or by the
-- video's own chapter list. Each outcome is searched once and the result is kept. Only the video link and the
-- outcome text ever leave ANUNEX; no student data is sent anywhere.
CREATE TABLE IF NOT EXISTS outcome_auto_videos (
  id TEXT PRIMARY KEY,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  channel_title TEXT,
  duration_seconds INTEGER,
  start_seconds INTEGER NOT NULL DEFAULT 0,
  end_seconds INTEGER,
  method TEXT NOT NULL CHECK(method IN ('GEMINI','CHAPTER','SHORT_TITLE')),
  confidence REAL,
  search_query TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REMOVED')),
  removed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  removed_reason TEXT,
  found_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outcome_auto_video_active ON outcome_auto_videos(outcome_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS idx_outcome_auto_video_outcome ON outcome_auto_videos(outcome_id, status);

-- a video removed for an outcome never comes back for it
CREATE TABLE IF NOT EXISTS outcome_video_blocks (
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(outcome_id, youtube_video_id)
);

-- "Bu video konuyla ilgili değil": one per student and video; three different students remove it automatically
CREATE TABLE IF NOT EXISTS outcome_video_reports (
  auto_video_id TEXT NOT NULL REFERENCES outcome_auto_videos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(auto_video_id, user_id)
);

-- the school's own link for an outcome (a teacher adds it; it is shown at once to that school's students)
CREATE TABLE IF NOT EXISTS outcome_teacher_videos (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  start_seconds INTEGER NOT NULL DEFAULT 0,
  end_seconds INTEGER,
  added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outcome_teacher_video ON outcome_teacher_videos(institution_id, outcome_id, active);

-- the search queue: outcomes a learner needed come first; every outcome is tried once, a miss is tried again later
CREATE TABLE IF NOT EXISTS outcome_video_queue (
  outcome_id TEXT PRIMARY KEY REFERENCES outcomes(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','FOUND','NOT_FOUND','ERROR')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_reason TEXT,
  next_try_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_outcome_video_queue ON outcome_video_queue(status, priority DESC, next_try_at);

-- daily use of the free quotas (YouTube search units, Gemini video seconds)
CREATE TABLE IF NOT EXISTS outcome_video_usage (
  day TEXT PRIMARY KEY,
  searches INTEGER NOT NULL DEFAULT 0,
  gemini_calls INTEGER NOT NULL DEFAULT 0,
  gemini_seconds INTEGER NOT NULL DEFAULT 0
);
