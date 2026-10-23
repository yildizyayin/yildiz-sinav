-- A066: paid speech and transcription are capped per user and day (Türkiye date); the Super Admin is not capped.
CREATE TABLE nibiru_voice_daily_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('SPEAK','TRANSCRIBE')),
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, usage_date, kind)
);
