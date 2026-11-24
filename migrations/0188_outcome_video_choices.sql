CREATE TABLE IF NOT EXISTS outcome_video_choices (
  outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  start_seconds INTEGER NOT NULL CHECK (start_seconds >= 0),
  end_seconds INTEGER NOT NULL CHECK (end_seconds - start_seconds BETWEEN 45 AND 325),
  curated INTEGER NOT NULL DEFAULT 0 CHECK (curated IN (0, 1)),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  PRIMARY KEY (outcome_id, youtube_video_id)
);

ALTER TABLE outcome_video_queue ADD COLUMN choices_checked_at TEXT;

ALTER TABLE outcome_video_choices ADD COLUMN channel_title TEXT;
ALTER TABLE outcome_video_choices ADD COLUMN checked_at TEXT;
CREATE INDEX IF NOT EXISTS idx_outcome_video_choices_checked ON outcome_video_choices(checked_at);

-- Publisher chapter boundaries confirmed on 2026-11-24. Resolve canonical school
-- outcomes in each verified edition, with no title or topic fallback.
WITH clips(code, grade, outcome_title, video_id, label, channel, start_at, end_at) AS (
  VALUES
    ('MAT.5.1.2',5,'Doğal sayılar ve işlemler içeren gerçek yaşam problemlerini çözebilme',
     '1jHK9ZvcAF4','Zaman hesabı yapılan problemler','Nagehan Hoca ile Matematik',2124,2433),
    ('MAT.6.1.4',6,'Günlük hayat problemleri ya da matematiksel durumlar üzerinden ortak kat ve ortak böleni yorumlayabilme',
     'dwrIijmCeEQ','Ortak kat ve ortak bölen','Ortaokul Matematik-İMT Hoca',195,500),
    ('BİY.9.2.4',9,'Canlıları sınıflandırabilme',
     'xjo4mqtMPHY','Canlıların sınıflandırılmasına giriş','Hocalara Geldik 9. Sınıf',0,325)
)
INSERT INTO outcome_video_choices(outcome_id,youtube_video_id,title,start_seconds,end_seconds,position,channel_title,checked_at,curated)
SELECT o.id,c.video_id,c.label,c.start_at,c.end_at,0,c.channel,'2026-11-24 08:00:00',1
FROM clips c
JOIN outcomes o ON o.code=c.code AND o.grade_level=c.grade AND trim(o.title)=c.outcome_title
JOIN curriculum_versions v ON v.id=o.curriculum_version_id AND v.grade_level=c.grade
WHERE o.active=1 AND coalesce(o.node_type,'OUTCOME')='OUTCOME' AND v.verified=1
  AND v.authority='MEB' AND v.program_code='SCHOOL' AND v.academic_year IN ('2026-2027','2027-2028')
  AND NOT EXISTS (SELECT 1 FROM outcome_video_blocks b WHERE b.outcome_id=o.id AND b.youtube_video_id=c.video_id)
ON CONFLICT(outcome_id,youtube_video_id) DO NOTHING;
