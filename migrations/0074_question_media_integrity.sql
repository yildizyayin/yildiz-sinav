-- Immutable media evidence for reviewed questions.
-- Local question media is copied to a content-addressed R2 key before approval.
ALTER TABLE question_assets ADD COLUMN byte_sha256 TEXT
  CHECK(byte_sha256 IS NULL OR (length(byte_sha256)=64 AND byte_sha256=lower(byte_sha256)));
ALTER TABLE question_assets ADD COLUMN byte_size INTEGER
  CHECK(byte_size IS NULL OR byte_size>=0);
ALTER TABLE question_assets ADD COLUMN sealed_at TEXT;

CREATE INDEX question_assets_sealed_question
  ON question_assets(question_id,sealed_at,byte_sha256);
