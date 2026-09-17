-- Seed parser-ready Sekonic catalogue templates without storing uploaded student records.
-- Camera geometry, fiducials and print coordinates remain institution-specific and must be
-- completed in the Optical Definition Center before publication.

INSERT OR IGNORE INTO optical_templates (id,name,vendor,status,active)
VALUES
  ('optik-129-sekonic','Optik 129 · Sekonic','Sekonic','NEEDS_DEFINITION',1),
  ('optik-7108-sekonic','Optik 7108 · Sekonic','Sekonic','NEEDS_DEFINITION',1);

INSERT OR IGNORE INTO optical_template_versions
  (id,template_id,version,page_width_mm,page_height_mm,parser_definition,camera_geometry,print_fields,fiducials,active)
VALUES
  (
    'optik-129-sekonic-v1',
    'optik-129-sekonic',
    '1.0',
    210,
    297,
    '{"type":"fixed-width","recordLength":222,"signature":"129","fields":{"student_number":{"start":11,"end":16},"name":{"start":16,"end":36},"class":{"start":48,"end":51},"booklet":{"start":55,"end":56}},"answers":{"TYT_TUR":{"start":56,"end":96},"TYT_SOS":{"start":96,"end":142},"TYT_MAT":{"start":142,"end":182},"TYT_FEN":{"start":182,"end":222}}}',
    NULL,
    NULL,
    NULL,
    1
  ),
  (
    'optik-7108-sekonic-v1',
    'optik-7108-sekonic',
    '1.0',
    210,
    297,
    '{"type":"fixed-width","recordLength":171,"signature":"7108","fields":{"student_number":{"start":10,"end":15},"name":{"start":15,"end":35},"class":{"start":35,"end":37},"booklet":{"start":50,"end":51}},"answers":{"TUR":{"start":51,"end":71},"SOS":{"start":71,"end":91},"DIN":{"start":91,"end":111},"ING":{"start":111,"end":131},"MAT":{"start":131,"end":151},"FEN":{"start":151,"end":171}}}',
    NULL,
    NULL,
    NULL,
    1
  );

INSERT OR IGNORE INTO optical_definition_validations (optical_template_version_id)
VALUES ('optik-129-sekonic-v1'), ('optik-7108-sekonic-v1');
