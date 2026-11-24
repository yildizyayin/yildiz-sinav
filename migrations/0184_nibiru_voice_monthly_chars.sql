-- 13 Nov 2026 (owner): Nibiru's natural Google WaveNet voice comes back inside Google's free monthly allowance.
-- One row per month counts the characters sent to Google for the whole platform; at the ceiling the device voice is used.
CREATE TABLE IF NOT EXISTS nibiru_voice_monthly_chars (
  month TEXT PRIMARY KEY,
  chars INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
