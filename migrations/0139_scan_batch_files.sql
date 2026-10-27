-- S036 (owner decision 27 Oct): the uploaded TXT/DAT is kept as it was for one academic year, so schools and dealers
-- can download it from Veri Merkezi. Deleted with its R2 object after retain_until by the result worker's schedule.
CREATE TABLE scan_batch_files (
  batch_id TEXT PRIMARY KEY REFERENCES scan_batches(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  retain_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_scan_batch_files_retain ON scan_batch_files(retain_until);
