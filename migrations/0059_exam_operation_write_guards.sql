CREATE TABLE IF NOT EXISTS exam_operation_write_guards (
  owner_token TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS validate_exam_operation_write_guard
BEFORE INSERT ON exam_operation_write_guards
BEGIN
  SELECT RAISE(ABORT,'EXAM_OPERATION_OWNERSHIP_LOST')
  WHERE NOT EXISTS (
    SELECT 1 FROM exam_operation_locks
    WHERE exam_id=NEW.exam_id AND owner_token=NEW.owner_token
  );
END;
