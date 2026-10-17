CREATE TABLE question_production_campaigns (
 id TEXT PRIMARY KEY,
 academic_year TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PAUSED' CHECK(status IN ('PAUSED','ACTIVE')),
 actor_id TEXT REFERENCES users(id),
 target_accepted INTEGER NOT NULL DEFAULT 500000,
 draft_cap INTEGER NOT NULL DEFAULT 500000 CHECK(draft_cap BETWEEN 1 AND 500000),
 reserved_questions INTEGER NOT NULL DEFAULT 0,
 next_slot INTEGER NOT NULL DEFAULT 0,
 daily_question_cap INTEGER NOT NULL DEFAULT 10000,
 review_queue_cap INTEGER NOT NULL DEFAULT 50,
 max_workers INTEGER NOT NULL DEFAULT 4 CHECK(max_workers BETWEEN 1 AND 4),
 revision INTEGER NOT NULL DEFAULT 0,
 last_tick_at TEXT,
 last_result_json TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO question_production_campaigns(id,academic_year) VALUES('editorial-20261015','2026-2027');
CREATE TABLE question_production_days (
 campaign_id TEXT NOT NULL REFERENCES question_production_campaigns(id),
 day TEXT NOT NULL,
 question_cap INTEGER NOT NULL,
 reserved_questions INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(campaign_id,day)
);
CREATE TABLE question_production_slots (
 id TEXT PRIMARY KEY,
 campaign_id TEXT NOT NULL REFERENCES question_production_campaigns(id),
 sequence INTEGER NOT NULL,
 day TEXT NOT NULL,
 outcome_id TEXT NOT NULL REFERENCES outcomes(id),
 question_count INTEGER NOT NULL CHECK(question_count BETWEEN 1 AND 3),
 job_id TEXT UNIQUE REFERENCES question_generation_jobs(id),
 status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','REVIEW_READY','FAILED')),
 lease_until TEXT NOT NULL,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 UNIQUE(campaign_id,sequence)
);
CREATE INDEX question_production_slots_running ON question_production_slots(campaign_id,status,lease_until);
CREATE TRIGGER question_production_reserve BEFORE INSERT ON question_production_slots BEGIN
 SELECT RAISE(ABORT,'PRODUCTION_CONCURRENCY_LIMIT') WHERE
 (SELECT count(*) FROM question_production_slots WHERE campaign_id=NEW.campaign_id AND status='RUNNING' AND lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now')) >= (SELECT max_workers FROM question_production_campaigns WHERE id=NEW.campaign_id);
 SELECT RAISE(ABORT,'PRODUCTION_REVIEW_QUEUE_FULL') WHERE
 (SELECT count(*) FROM question_bank WHERE owner_type='PLATFORM' AND origin_kind='AI_GENERATED' AND review_status='REVIEW')
 +(SELECT COALESCE(sum(question_count),0) FROM question_production_slots WHERE status='RUNNING' AND lease_until>strftime('%Y-%m-%dT%H:%M:%fZ','now'))+NEW.question_count
 >(SELECT review_queue_cap FROM question_production_campaigns WHERE id=NEW.campaign_id);
 UPDATE question_production_campaigns SET reserved_questions=reserved_questions+NEW.question_count,next_slot=NEW.sequence
 WHERE id=NEW.campaign_id AND status='ACTIVE' AND next_slot=NEW.sequence-1 AND reserved_questions+NEW.question_count<=draft_cap;
 SELECT RAISE(ABORT,'PRODUCTION_CAMPAIGN_LIMIT') WHERE changes()<>1;
 UPDATE question_production_days SET reserved_questions=reserved_questions+NEW.question_count
 WHERE campaign_id=NEW.campaign_id AND day=NEW.day AND reserved_questions+NEW.question_count<=question_cap;
 SELECT RAISE(ABORT,'PRODUCTION_DAY_LIMIT') WHERE changes()<>1;
END;
CREATE TRIGGER question_production_campaign_monotonic BEFORE UPDATE ON question_production_campaigns
 WHEN NEW.reserved_questions<OLD.reserved_questions OR NEW.next_slot<OLD.next_slot OR NEW.draft_cap<>OLD.draft_cap OR NEW.target_accepted<>OLD.target_accepted
 BEGIN SELECT RAISE(ABORT,'PRODUCTION_CAMPAIGN_IMMUTABLE_LIMIT'); END;
CREATE TRIGGER question_production_slot_source_immutable BEFORE UPDATE ON question_production_slots
 WHEN NEW.campaign_id<>OLD.campaign_id OR NEW.sequence<>OLD.sequence OR NEW.question_count<>OLD.question_count OR NEW.outcome_id<>OLD.outcome_id OR (OLD.job_id IS NOT NULL AND NEW.job_id IS NOT OLD.job_id)
 BEGIN SELECT RAISE(ABORT,'PRODUCTION_SLOT_SOURCE_IMMUTABLE'); END;
