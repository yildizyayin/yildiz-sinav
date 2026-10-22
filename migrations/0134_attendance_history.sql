-- A061: attendance corrections keep their history. Every change of a saved record (status, minutes late, note)
-- writes the previous value, who changed it, when and why into an append-only table.
ALTER TABLE attendance_period_records ADD COLUMN change_reason TEXT;
CREATE TABLE attendance_record_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  previous_minutes_late INTEGER NOT NULL,
  previous_note TEXT,
  previous_recorded_by TEXT NOT NULL,
  previous_recorded_at TEXT NOT NULL,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX attendance_record_history_student ON attendance_record_history(student_id, changed_at DESC);
CREATE INDEX attendance_record_history_session ON attendance_record_history(session_id, student_id);
CREATE TRIGGER attendance_record_history_no_update BEFORE UPDATE ON attendance_record_history BEGIN SELECT RAISE(ABORT,'ATTENDANCE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER attendance_record_history_no_delete BEFORE DELETE ON attendance_record_history BEGIN SELECT RAISE(ABORT,'ATTENDANCE_HISTORY_IMMUTABLE'); END;
CREATE TRIGGER attendance_record_keep_history BEFORE UPDATE ON attendance_period_records
WHEN OLD.attendance_status IS NOT NEW.attendance_status OR OLD.minutes_late IS NOT NEW.minutes_late OR OLD.note IS NOT NEW.note
BEGIN
  INSERT INTO attendance_record_history(session_id,student_id,previous_status,previous_minutes_late,previous_note,previous_recorded_by,previous_recorded_at,new_status,changed_by,change_reason)
  VALUES(OLD.session_id,OLD.student_id,OLD.attendance_status,OLD.minutes_late,OLD.note,OLD.recorded_by,OLD.recorded_at,NEW.attendance_status,NEW.recorded_by,NEW.change_reason);
END;
