CREATE TABLE private_rubric_export_jobs (
 id TEXT PRIMARY KEY,
 actor_user_id TEXT NOT NULL REFERENCES users(id),
 request_id TEXT NOT NULL,
 actor_scope_json TEXT NOT NULL CHECK(json_valid(actor_scope_json)),
 selection_json TEXT NOT NULL CHECK(json_valid(selection_json)),
 status TEXT NOT NULL CHECK(status IN ('QUEUED','RUNNING','READY','FAILED','REVOKED','EXPIRED')),
 cursor TEXT,
 part_count INTEGER NOT NULL DEFAULT 0,
 observation_count INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until TEXT,
 error_code TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TEXT NOT NULL,
 cleanup_done INTEGER NOT NULL DEFAULT 0,
 UNIQUE(actor_user_id,request_id)
);
CREATE INDEX rubric_export_actor ON private_rubric_export_jobs(actor_user_id,created_at DESC);
CREATE INDEX rubric_export_dispatch ON private_rubric_export_jobs(status,lease_until,expires_at);
CREATE TABLE private_rubric_export_parts (
 job_id TEXT NOT NULL REFERENCES private_rubric_export_jobs(id),
 part_no INTEGER NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 observation_ids_json TEXT NOT NULL CHECK(json_valid(observation_ids_json)),
 observation_count INTEGER NOT NULL,
 byte_count INTEGER NOT NULL,
 PRIMARY KEY(job_id,part_no)
);
