PRAGMA foreign_keys = ON;

-- S047: the text of each KVKK aydınlatma metni version, managed by the Super Admin (draft -> legal review ->
-- active). privacy_notice_versions.content_hash is the SHA-256 of this body, so a receipt proves which text was read.
CREATE TABLE IF NOT EXISTS privacy_notice_contents (
  notice_version_id TEXT PRIMARY KEY REFERENCES privacy_notice_versions(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
