-- Application practice directions; these are not invented official MEB descriptors.
ALTER TABLE question_generation_jobs ADD COLUMN task_focus TEXT NOT NULL DEFAULT 'GENERIC'
 CHECK(task_focus IN ('GENERIC','READ_ZERO_PERIODS','NAT_COMPARE_OFFERS','NAT_INVERSE_STEPS'));
ALTER TABLE question_generation_jobs ADD COLUMN instruction_note TEXT NOT NULL DEFAULT '' CHECK(length(instruction_note)<=1000);
ALTER TABLE question_generation_jobs ADD COLUMN priority INTEGER NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 2);
CREATE TRIGGER question_generation_focus_immutable BEFORE UPDATE OF task_focus,instruction_note,priority ON question_generation_jobs
WHEN OLD.task_focus IS NOT NEW.task_focus OR OLD.instruction_note IS NOT NEW.instruction_note OR OLD.priority IS NOT NEW.priority
BEGIN SELECT RAISE(ABORT,'GENERATION_DIRECTION_IMMUTABLE'); END;
