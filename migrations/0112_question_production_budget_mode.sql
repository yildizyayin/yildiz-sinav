-- Preserve every paid reservation and the historical pilot cap. Default stays LIMITED.
DROP TRIGGER IF EXISTS question_agent_pilot_reserve_budget;
CREATE TABLE question_agent_pilot_budget_next (
 id TEXT PRIMARY KEY CHECK(id='pilot_50'),
 budget_mode TEXT NOT NULL DEFAULT 'LIMITED' CHECK(budget_mode IN ('LIMITED','UNLIMITED')),
 question_cap INTEGER,
 legacy_question_cap INTEGER NOT NULL CHECK(legacy_question_cap BETWEEN 1 AND 50),
 reserved_count INTEGER NOT NULL CHECK(reserved_count>=0),
 CHECK((budget_mode='LIMITED' AND question_cap IS NOT NULL AND question_cap>=reserved_count AND question_cap>0) OR (budget_mode='UNLIMITED' AND question_cap IS NULL))
);
INSERT INTO question_agent_pilot_budget_next(id,budget_mode,question_cap,legacy_question_cap,reserved_count)
 SELECT id,'LIMITED',question_cap,question_cap,reserved_count FROM question_agent_pilot_budget;
DROP TABLE question_agent_pilot_budget;
ALTER TABLE question_agent_pilot_budget_next RENAME TO question_agent_pilot_budget;
CREATE TRIGGER question_agent_pilot_reserve_budget
BEFORE INSERT ON question_agent_pilot_reservations
WHEN NOT EXISTS(SELECT 1 FROM question_agent_pilot_reservations WHERE job_id=NEW.job_id)
BEGIN
 UPDATE question_agent_pilot_budget SET reserved_count=reserved_count+NEW.question_count
 WHERE id='pilot_50' AND (budget_mode='UNLIMITED' OR reserved_count+NEW.question_count<=question_cap);
 SELECT RAISE(ABORT,'PILOT_BUDGET_EXHAUSTED') WHERE changes()<>1;
END;
