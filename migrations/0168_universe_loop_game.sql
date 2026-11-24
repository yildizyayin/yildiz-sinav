-- Öğrenme Evreni PR-4 (owner, 11 Nov 2026): the Nibiru outcome loop's game step plays an Öğrenme Evreni game when the
-- outcome has approved activity content; otherwise the earlier question round (nibiru_game_rounds) is used as before.
ALTER TABLE nibiru_outcome_loops ADD COLUMN lu_session_id TEXT REFERENCES lu_sessions(id);
CREATE INDEX IF NOT EXISTS idx_nibiru_loops_lu_session ON nibiru_outcome_loops(lu_session_id);
