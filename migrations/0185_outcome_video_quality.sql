-- Kazanım videosu kalite denetimi (owner, 23 Nov 2026): each automatic clip is checked once by the new rules
-- (other grade, other subject, entertainment channel, title not naming the outcome); a failing clip is removed and
-- the outcome is searched again.
ALTER TABLE outcome_auto_videos ADD COLUMN quality_checked_at TEXT;
