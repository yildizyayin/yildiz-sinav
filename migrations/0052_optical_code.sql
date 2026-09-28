ALTER TABLE optical_templates ADD COLUMN optical_code TEXT;

CREATE INDEX IF NOT EXISTS idx_optical_templates_code
  ON optical_templates(owner_type, owner_id, optical_code);
