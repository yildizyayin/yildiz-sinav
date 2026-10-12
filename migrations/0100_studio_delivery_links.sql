PRAGMA foreign_keys = ON;

-- Durable Studio routing ledger. This migration only creates schema;
-- no publication action or exam/assignment is created by migration.
CREATE TABLE IF NOT EXISTS studio_delivery_links (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES studio_documents(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  publication_revision INTEGER NOT NULL CHECK(publication_revision >= 1),
  delivery_kind TEXT NOT NULL CHECK(delivery_kind IN ('EXAM','HOMEWORK','MINI_TEST')),
  destination TEXT NOT NULL CHECK(destination IN ('EXAM_CENTER','ASSIGNMENTS','COACH_PRACTICE')),
  external_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id,publication_revision,delivery_kind),
  CHECK(
    (delivery_kind='EXAM' AND destination='EXAM_CENTER') OR
    (delivery_kind='HOMEWORK' AND destination='ASSIGNMENTS') OR
    (delivery_kind='MINI_TEST' AND destination='COACH_PRACTICE')
  )
);
CREATE INDEX IF NOT EXISTS studio_delivery_links_target_idx
  ON studio_delivery_links(destination,external_id);
