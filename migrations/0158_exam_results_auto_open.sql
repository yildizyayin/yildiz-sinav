-- Owner (4 Nov): "sınavı eklediğim anda yayınlansın" — a normal exam's results open by themselves as soon as they are
-- evaluated; only a Türkiye geneli exam (one with a national schedule) or a planned future result time waits.
-- Exams created from the exam form from now on carry the flag; the existing exams get it here unless they are national.
ALTER TABLE exams ADD COLUMN results_auto_open INTEGER NOT NULL DEFAULT 0 CHECK (results_auto_open IN (0,1));
UPDATE exams SET results_auto_open=1
WHERE status<>'ARCHIVED'
  AND owner_type IN ('CENTRAL','INSTITUTION')
  AND exam_type NOT LIKE 'SYNTHETIC%'
  AND NOT EXISTS (SELECT 1 FROM exam_administrations a WHERE a.exam_id=exams.id AND (a.result_release_at IS NOT NULL OR a.application_start_at IS NOT NULL OR a.application_end_at IS NOT NULL));
