-- Publish only the curated built-in Sekonic parsers that are covered by parser regression tests.
-- Camera geometry and print coordinates are intentionally not required here: camera is optional
-- for TXT/DAT/FMT reading and Optical Printing remains a separate Deimos workflow.

UPDATE optical_definition_validations
SET parser_test_passed=1,
    parser_test_record_count=1,
    parser_tested_at=COALESCE(parser_tested_at, CURRENT_TIMESTAMP),
    last_error=NULL,
    updated_at=CURRENT_TIMESTAMP
WHERE optical_template_version_id IN ('optik-129-sekonic-v1','optik-7108-sekonic-v1');

UPDATE optical_template_versions
SET active=CASE WHEN id IN ('optik-129-sekonic-v1','optik-7108-sekonic-v1') THEN 1 ELSE active END
WHERE template_id IN ('optik-129-sekonic','optik-7108-sekonic');

UPDATE optical_templates
SET status='READY', active=1
WHERE id IN ('optik-129-sekonic','optik-7108-sekonic');
