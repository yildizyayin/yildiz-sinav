PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS optical_definition_validations (
  optical_template_version_id TEXT PRIMARY KEY REFERENCES optical_template_versions(id) ON DELETE CASCADE,
  parser_test_passed INTEGER NOT NULL DEFAULT 0,
  parser_test_record_count INTEGER NOT NULL DEFAULT 0,
  parser_tested_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS optical_template_assets (
  id TEXT PRIMARY KEY,
  optical_template_version_id TEXT NOT NULL REFERENCES optical_template_versions(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('BLANK_FORM','FMT_SAMPLE','PRINT_BASE')),
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  content_type TEXT,
  uploaded_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_optical_assets_version ON optical_template_assets(optical_template_version_id, asset_type, created_at);
