-- Owner decision (12 Nov 2026): RBA = "Rehberlik Bilgi Anketi" (no "beyin" claim). Labels only; codes unchanged.
UPDATE platform_features SET label='RBA · Rehberlik Bilgi Anketi' WHERE feature_key='RBA';
UPDATE guidance_assessment_instruments SET title=replace(title,'RBA Öğrenme ve Çalışma Profili','RBA (Rehberlik Bilgi Anketi) · Öğrenme ve Çalışma Profili') WHERE code LIKE 'RBA_EDU%' AND title LIKE 'RBA Öğrenme ve Çalışma Profili%';
