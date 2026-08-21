PRAGMA foreign_keys = ON;

-- Every optical version starts with a usable print-field draft. The administrator
-- only fine-tunes these coordinates against the real blank form.
UPDATE optical_template_versions
SET print_fields = '{"fields":[{"key":"studentName","xMm":15,"yMm":15},{"key":"studentNumber","xMm":125,"yMm":15},{"key":"class","xMm":165,"yMm":15},{"key":"bookletCode","xMm":190,"yMm":15},{"key":"institutionCode","xMm":15,"yMm":27},{"key":"examTitle","xMm":70,"yMm":27}]}'
WHERE print_fields IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_optical_version_default_print_fields
AFTER INSERT ON optical_template_versions
WHEN NEW.print_fields IS NULL
BEGIN
  UPDATE optical_template_versions
  SET print_fields = '{"fields":[{"key":"studentName","xMm":15,"yMm":15},{"key":"studentNumber","xMm":125,"yMm":15},{"key":"class","xMm":165,"yMm":15},{"key":"bookletCode","xMm":190,"yMm":15},{"key":"institutionCode","xMm":15,"yMm":27},{"key":"examTitle","xMm":70,"yMm":27}]}'
  WHERE id = NEW.id;
END;
