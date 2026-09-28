-- Schoolizyon-style form metadata belongs to the optical definition itself.
ALTER TABLE optical_templates ADD COLUMN form_type TEXT NOT NULL DEFAULT 'FMT'
  CHECK(form_type IN ('FMT','TXT','PHOTO','MANUAL'));

ALTER TABLE optical_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_optical_templates_form_order
  ON optical_templates(owner_type, owner_id, sort_order, name);
