-- D-S039 (owner, 28 Oct): an upload on sonuc can be deleted (with a reason once evaluated) and restored for 7 days.
-- The batch row and its read sheets stay until purge_after; its results are removed at once. scan_batches.status has
-- a CHECK that predates this, so the deletion is its own row and every listing leaves deleted uploads out.
CREATE TABLE IF NOT EXISTS scan_batch_deletions (
  batch_id TEXT PRIMARY KEY REFERENCES scan_batches(id) ON DELETE CASCADE,
  deleted_by TEXT REFERENCES users(id),
  reason TEXT,
  prior_status TEXT NOT NULL,
  participants_removed INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purge_after TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_batch_deletions_purge ON scan_batch_deletions(purge_after);
