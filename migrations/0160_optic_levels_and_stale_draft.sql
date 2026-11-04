-- Owner (4 Nov): the built-in Sekonic optics get their school level (129 carries the TYT tests → Lise; 7108 carries
-- the LGS tests → Ortaokul), and the empty September draft "optik 7108" (no fields, no exam) is archived, as the
-- optics screen's Sil does for an optic.
UPDATE optical_templates SET education_level='LISE' WHERE id='optik-129-sekonic' AND education_level IS NULL;
UPDATE optical_templates SET education_level='ORTAOKUL' WHERE id='optik-7108-sekonic' AND education_level IS NULL;
UPDATE optical_templates SET status='ARCHIVED',active=0
WHERE id='opt_729f50c4-bd8f-49cc-8e9f-af809f4bc618' AND status='NEEDS_DEFINITION'
  AND NOT EXISTS (SELECT 1 FROM optical_template_versions v WHERE v.template_id=optical_templates.id AND v.parser_definition IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM exam_optical_bindings b JOIN optical_template_versions v ON v.id=b.optical_template_version_id WHERE v.template_id=optical_templates.id);
INSERT INTO audit_logs(id,actor_user_id,institution_id,action,entity_type,entity_id,details_json)
SELECT 'aud_mig0160_optik7108',NULL,NULL,'OPTICAL_TEMPLATE_DELETED','optical_template',id,'{"name":"optik 7108","mode":"ARCHIVE","reason":"Sahip kararı 4 Kasım: boş taslak","migration":"0160"}'
FROM optical_templates WHERE id='opt_729f50c4-bd8f-49cc-8e9f-af809f4bc618' AND status='ARCHIVED' AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE id='aud_mig0160_optik7108');
