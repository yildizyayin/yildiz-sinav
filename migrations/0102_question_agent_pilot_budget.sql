-- Pilot budget reservations are monotonic: failures never silently refund quotas.
CREATE TABLE IF NOT EXISTS question_agent_pilot_budget (
 id TEXT PRIMARY KEY CHECK(id='pilot_50'),
 question_cap INTEGER NOT NULL DEFAULT 50 CHECK(question_cap BETWEEN 1 AND 50),
 reserved_count INTEGER NOT NULL DEFAULT 0 CHECK(reserved_count>=0 AND reserved_count<=question_cap)
);
INSERT OR IGNORE INTO question_agent_pilot_budget(id) VALUES('pilot_50');
CREATE TABLE IF NOT EXISTS question_agent_pilot_reservations (
 job_id TEXT PRIMARY KEY REFERENCES question_generation_jobs(id),
 question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 10),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS question_agent_pilot_reserve_budget
BEFORE INSERT ON question_agent_pilot_reservations
WHEN NOT EXISTS(SELECT 1 FROM question_agent_pilot_reservations WHERE job_id=NEW.job_id)
BEGIN
 UPDATE question_agent_pilot_budget SET reserved_count=reserved_count+NEW.question_count
 WHERE id='pilot_50' AND reserved_count+NEW.question_count<=question_cap;
 SELECT CASE WHEN changes()<>1 THEN RAISE(ABORT,'PILOT_BUDGET_EXHAUSTED') END;
END;
