-- A009: last autonomous scheduler tick outcome, so the Super Admin panel shows
-- why the agent is or is not producing instead of failing silently.
-- Single row, overwritten each tick; holds no question content or personal data.
CREATE TABLE IF NOT EXISTS question_scheduler_status (
 id TEXT PRIMARY KEY CHECK(id='autonomous'),
 last_tick_at TEXT NOT NULL,
 outcome TEXT NOT NULL,
 job_id TEXT,
 detail_json TEXT
);
