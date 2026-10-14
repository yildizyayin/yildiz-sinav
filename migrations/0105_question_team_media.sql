CREATE TABLE question_team_control (
 id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 0,updated_by TEXT REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO question_team_control(id) VALUES(1);
CREATE TABLE question_team_agent_control (
 agent_key TEXT PRIMARY KEY CHECK(agent_key IN ('GENERATOR','VERIFIER','ORIGINALITY','MEDIA','VIDEO')),
 paused INTEGER NOT NULL DEFAULT 0 CHECK(paused IN (0,1)),revision INTEGER NOT NULL DEFAULT 0,
 updated_by TEXT REFERENCES users(id),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO question_team_agent_control(agent_key) VALUES('GENERATOR'),('VERIFIER'),('ORIGINALITY'),('MEDIA'),('VIDEO');
CREATE TABLE question_media_jobs (
 id TEXT PRIMARY KEY,request_key TEXT NOT NULL UNIQUE,question_id TEXT REFERENCES question_bank(id),
 source_revision INTEGER NOT NULL,source_snapshot_json TEXT NOT NULL CHECK(json_valid(source_snapshot_json)),
 source_sha256 TEXT NOT NULL,plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
 synthetic INTEGER NOT NULL DEFAULT 0 CHECK(synthetic IN (0,1)),
 narration_mode TEXT NOT NULL CHECK(narration_mode IN ('CAPTIONS','NARRATED')),
 instruction_note TEXT NOT NULL DEFAULT '' CHECK(length(instruction_note)<=1000),
 status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','BLOCKED','PREPARING','READY_TO_RENDER','RENDERING','REVIEW','APPROVED','FAILED','CANCELLED')),
 attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 lease_hash TEXT,lease_until TEXT,error_code TEXT,
 narration_key TEXT,narration_sha256 TEXT,narration_mime TEXT,narration_bytes INTEGER,narration_provider TEXT,
 output_key TEXT,output_sha256 TEXT,output_bytes INTEGER,duration_seconds REAL,has_audio INTEGER,
 created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,approved_by TEXT REFERENCES users(id),approved_at TEXT,
 attached_asset_id TEXT REFERENCES question_assets(id),
 CHECK((synthetic=1 AND question_id IS NULL) OR (synthetic=0 AND question_id IS NOT NULL)),
 CHECK((status IN ('PREPARING','RENDERING') AND lease_hash IS NOT NULL AND lease_until IS NOT NULL)
 OR (status NOT IN ('PREPARING','RENDERING') AND lease_hash IS NULL AND lease_until IS NULL))
);
CREATE INDEX question_media_queue ON question_media_jobs(status,created_at,id);
CREATE TRIGGER question_media_source_immutable BEFORE UPDATE OF question_id,source_revision,source_snapshot_json,source_sha256,plan_json,synthetic,narration_mode,instruction_note ON question_media_jobs
WHEN OLD.question_id IS NOT NEW.question_id OR OLD.source_revision IS NOT NEW.source_revision
 OR OLD.source_snapshot_json IS NOT NEW.source_snapshot_json OR OLD.source_sha256 IS NOT NEW.source_sha256
 OR OLD.plan_json IS NOT NEW.plan_json OR OLD.synthetic IS NOT NEW.synthetic OR OLD.narration_mode IS NOT NEW.narration_mode
 OR OLD.instruction_note IS NOT NEW.instruction_note
BEGIN SELECT RAISE(ABORT,'MEDIA_SOURCE_IMMUTABLE'); END;
CREATE TABLE question_team_control_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT,agent_key TEXT NOT NULL,paused INTEGER NOT NULL,
 revision INTEGER NOT NULL,actor_id TEXT REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER question_team_global_event AFTER UPDATE ON question_team_control BEGIN
 INSERT INTO question_team_control_events(agent_key,paused,revision,actor_id) VALUES('TEAM',NEW.paused,NEW.revision,NEW.updated_by);END;
CREATE TRIGGER question_team_agent_event AFTER UPDATE ON question_team_agent_control BEGIN
 INSERT INTO question_team_control_events(agent_key,paused,revision,actor_id) VALUES(NEW.agent_key,NEW.paused,NEW.revision,NEW.updated_by);END;
CREATE TRIGGER question_team_event_immutable_update BEFORE UPDATE ON question_team_control_events BEGIN SELECT RAISE(ABORT,'TEAM_EVENT_IMMUTABLE');END;
CREATE TRIGGER question_team_event_immutable_delete BEFORE DELETE ON question_team_control_events BEGIN SELECT RAISE(ABORT,'TEAM_EVENT_IMMUTABLE');END;
