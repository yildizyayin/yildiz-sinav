CREATE TABLE question_ai_budget_days (
 day TEXT PRIMARY KEY,
 limit_neurons INTEGER NOT NULL CHECK(limit_neurons BETWEEN 1 AND 1000000000),
 held_neurons INTEGER NOT NULL DEFAULT 0 CHECK(held_neurons>=0),
 charged_neurons INTEGER NOT NULL DEFAULT 0 CHECK(charged_neurons>=0)
);
CREATE TABLE question_ai_budget_calls (
 id TEXT PRIMARY KEY,
 day TEXT NOT NULL REFERENCES question_ai_budget_days(day),
 model TEXT NOT NULL,
 reserved_neurons INTEGER NOT NULL CHECK(reserved_neurons>0),
 charged_neurons INTEGER,
 status TEXT NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','SETTLED','UNKNOWN')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX question_ai_budget_calls_day ON question_ai_budget_calls(day,status);
CREATE TRIGGER question_ai_budget_reserve BEFORE INSERT ON question_ai_budget_calls BEGIN
 UPDATE question_ai_budget_days SET held_neurons=held_neurons+NEW.reserved_neurons
 WHERE day=NEW.day AND held_neurons+charged_neurons+NEW.reserved_neurons<=limit_neurons;
 SELECT RAISE(ABORT,'QUESTION_DAILY_AI_BUDGET_EXHAUSTED') WHERE changes()<>1;
END;
CREATE TABLE question_verifier_calibrations (
 id TEXT PRIMARY KEY,
 status TEXT NOT NULL CHECK(status IN ('RUNNING','PASS','BLOCKED')),
 findings_json TEXT,
 verification_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT
);
