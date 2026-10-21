-- A083.4: saved Studio templates and per-user favourite documents.
CREATE TABLE IF NOT EXISTS studio_templates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('TOPIC_SCAN','PRACTICE_EXAM','HOMEWORK','REMEDIAL','OTHER')),
  shared INTEGER NOT NULL DEFAULT 0 CHECK(shared IN (0,1)),
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS studio_templates_scope ON studio_templates(institution_id,owner_user_id);
CREATE TABLE IF NOT EXISTS studio_document_favorites (
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL REFERENCES studio_documents(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,document_id)
);
CREATE INDEX IF NOT EXISTS studio_documents_institution_created ON studio_documents(institution_id,created_at);
