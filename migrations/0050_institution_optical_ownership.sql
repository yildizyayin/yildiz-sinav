-- Institution-owned optical definitions and tenant-local identity decisions.
-- Existing seeded templates remain CENTRAL and continue to be shared.
ALTER TABLE optical_templates ADD COLUMN owner_type TEXT NOT NULL DEFAULT 'CENTRAL'
  CHECK(owner_type IN ('CENTRAL','INSTITUTION'));
ALTER TABLE optical_templates ADD COLUMN owner_id TEXT REFERENCES institutions(id);

CREATE INDEX IF NOT EXISTS idx_optical_templates_scope
  ON optical_templates(owner_type, owner_id, active, name);

CREATE TRIGGER IF NOT EXISTS trg_optical_template_owner_insert
BEFORE INSERT ON optical_templates
WHEN NEW.owner_type='INSTITUTION' AND NEW.owner_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'INSTITUTION_OPTICAL_OWNER_REQUIRED');
END;

CREATE TRIGGER IF NOT EXISTS trg_optical_template_owner_update
BEFORE UPDATE OF owner_type, owner_id ON optical_templates
WHEN NEW.owner_type='INSTITUTION' AND NEW.owner_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'INSTITUTION_OPTICAL_OWNER_REQUIRED');
END;

ALTER TABLE student_entities ADD COLUMN tckn TEXT;
CREATE INDEX IF NOT EXISTS idx_student_entities_tckn ON student_entities(tckn);

-- Keep the original scan status check backwards compatible on D1/SQLite.
ALTER TABLE scan_records ADD COLUMN resolution_status TEXT NOT NULL DEFAULT 'PENDING';
CREATE INDEX IF NOT EXISTS idx_scan_records_resolution ON scan_records(batch_id, resolution_status, match_status);
