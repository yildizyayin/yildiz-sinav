-- A028b: in the Sekonic 129 layout position 47 is the ALAN grid, not part of TC/phone (36–47, 11 characters).
-- 0121 read 36–48, so a filled ALAN digit turned an 11-digit TC into 12 digits and the TC never matched.
UPDATE optical_template_versions
SET parser_definition = REPLACE(parser_definition, '"tckn":{"start":36,"end":48}', '"tckn":{"start":36,"end":47}')
WHERE id = 'optik-129-sekonic-v1';
