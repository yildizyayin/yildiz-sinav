-- Bireysel ilerleme (owner, 26 Nov 2026): öğrenciler birbiriyle kıyaslanmaz.
--  reflection: the student's own one-tap "Ne öğrendim?" after a play (Kolaydı / Biraz zorlandım / Tekrar etmeliyim);
--    it nudges the next play's difficulty and brings the outcome back as a review suggestion.
--  lu_daily_goals: the daily goal the student chose for themselves (1, 2 or 3 plays); missing a day removes nothing.
ALTER TABLE lu_sessions ADD COLUMN reflection TEXT CHECK(reflection IN ('EASY','HARD','AGAIN'));
CREATE TABLE IF NOT EXISTS lu_daily_goals (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id) ON DELETE CASCADE,
  plays INTEGER NOT NULL CHECK(plays BETWEEN 1 AND 3),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
