-- A025: real ÇAP TYT files (Sekonic 129) carry the optional philosophy answers in Sosyal positions 21–25
-- and the TC/phone field at 36–48. The built-in definition exposed neither, so optional philosophy was never scored.
UPDATE optical_template_versions SET parser_definition='{"type":"fixed-width","recordLength":222,"signature":"129","fields":{"student_number":{"start":11,"end":16},"name":{"start":16,"end":36},"tckn":{"start":36,"end":48},"class":{"start":48,"end":51},"booklet":{"start":55,"end":56}},"answers":{"TYT_TUR":{"start":56,"end":96},"TYT_SOS":{"start":96,"end":142},"TYT_MAT":{"start":142,"end":182},"TYT_FEN":{"start":182,"end":222},"TYT_FEL":{"start":116,"end":121}}}'
WHERE id='optik-129-sekonic-v1';
