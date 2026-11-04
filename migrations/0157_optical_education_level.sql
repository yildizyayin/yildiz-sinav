-- 4 Nov (owner): optics are listed and filtered by school level (İlkokul / Ortaokul / Lise).
ALTER TABLE optical_templates ADD COLUMN education_level TEXT CHECK (education_level IS NULL OR education_level IN ('ILKOKUL','ORTAOKUL','LISE'));
-- Best guess for the optics already defined; anything unclear stays empty and is set on the edit form.
UPDATE optical_templates SET education_level='LISE' WHERE education_level IS NULL AND (upper(name) LIKE '%TYT%' OR upper(name) LIKE '%AYT%' OR upper(optical_code) LIKE '%TYT%' OR upper(optical_code) LIKE '%AYT%');
UPDATE optical_templates SET education_level='ORTAOKUL' WHERE education_level IS NULL AND (upper(name) LIKE '%LGS%' OR upper(optical_code) LIKE '%LGS%');
