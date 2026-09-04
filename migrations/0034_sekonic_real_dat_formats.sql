PRAGMA foreign_keys = ON;

-- Real Sekonic FMT mapping supplied for Optik 129 (TYT).
INSERT OR IGNORE INTO optical_templates (id,name,vendor,status,active)
VALUES ('opt129','Optik 129 TYT','SEKONIC','NEEDS_DEFINITION',1);
UPDATE optical_templates
SET name='Optik 129 TYT',vendor='SEKONIC',active=1
WHERE id='opt129';

INSERT OR IGNORE INTO optical_template_versions (id,template_id,version,page_width_mm,page_height_mm,active)
VALUES ('v_opt129','opt129','sekonic-fmt-v1',210,297,1);
UPDATE optical_template_versions
SET version='sekonic-fmt-v1',
    parser_definition='{"type":"fixed-width","recordLength":222,"signature":"129","fields":{"student_number":{"start":11,"end":16},"name":{"start":16,"end":36},"class":{"start":48,"end":51},"booklet":{"start":55,"end":56}},"answers":{"TUR":{"start":56,"end":96},"SOS":{"start":96,"end":142},"MAT":{"start":142,"end":182},"FEN":{"start":182,"end":222}},"sourceFormat":"SEKONIC_FMT","sourceName":"OPTIK-129_SEKONIC.fmt"}',
    active=1
WHERE id='v_opt129';
UPDATE optical_template_versions SET active=0 WHERE template_id='opt129' AND id<>'v_opt129';

-- Real Sekonic FMT mapping supplied for Optik 7108 (LGS).
INSERT OR IGNORE INTO optical_templates (id,name,vendor,status,active)
VALUES ('opt7108','Optik 7108 LGS','SEKONIC','NEEDS_DEFINITION',1);
UPDATE optical_templates
SET name='Optik 7108 LGS',vendor='SEKONIC',active=1
WHERE id='opt7108';

INSERT OR IGNORE INTO optical_template_versions (id,template_id,version,page_width_mm,page_height_mm,active)
VALUES ('v_opt7108','opt7108','sekonic-fmt-v1',210,297,1);
UPDATE optical_template_versions
SET version='sekonic-fmt-v1',
    parser_definition='{"type":"fixed-width","recordLength":171,"signature":"7108","fields":{"student_number":{"start":10,"end":15},"name":{"start":15,"end":35},"class":{"start":35,"end":37},"booklet":{"start":50,"end":51}},"answers":{"TUR":{"start":51,"end":71},"SOS":{"start":71,"end":91},"DIN":{"start":91,"end":111},"ING":{"start":111,"end":131},"MAT":{"start":131,"end":151},"FEN":{"start":151,"end":171}},"sourceFormat":"SEKONIC_FMT","sourceName":"OPTIK-7108_SEKONIC.fmt"}',
    active=1
WHERE id='v_opt7108';
UPDATE optical_template_versions SET active=0 WHERE template_id='opt7108' AND id<>'v_opt7108';

-- Parser mapping is installed, but real DAT and physical print/camera verification remain separate gates.
INSERT OR IGNORE INTO optical_definition_validations (optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error)
VALUES ('v_opt129',0,0,NULL,'Sekonic FMT parser installed; real DAT smoke and physical verification pending.');
UPDATE optical_definition_validations
SET parser_test_passed=0,parser_test_record_count=0,parser_tested_at=NULL,last_error='Sekonic FMT parser installed; real DAT smoke and physical verification pending.',updated_at=CURRENT_TIMESTAMP
WHERE optical_template_version_id='v_opt129';

INSERT OR IGNORE INTO optical_definition_validations (optical_template_version_id,parser_test_passed,parser_test_record_count,parser_tested_at,last_error)
VALUES ('v_opt7108',0,0,NULL,'Sekonic FMT parser installed; real DAT smoke and physical verification pending.');
UPDATE optical_definition_validations
SET parser_test_passed=0,parser_test_record_count=0,parser_tested_at=NULL,last_error='Sekonic FMT parser installed; real DAT smoke and physical verification pending.',updated_at=CURRENT_TIMESTAMP
WHERE optical_template_version_id='v_opt7108';
