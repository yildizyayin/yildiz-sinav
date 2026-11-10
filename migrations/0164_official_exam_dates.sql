-- Owner (10 Nov 2026): the exam countdown is shown only to 8th grade (LGS) and 12th grade / graduates (YKS), and only
-- against the official date. Dates live here, not in code, so a new year or a changed date needs no release.
-- 2026-2027: LGS merkezî sınav 13 Haziran 2027 (MEB 2027 Sınav Uygulama Takvimi);
--            YKS 19-20 Haziran 2027, TYT 19 Haziran (ÖSYM 2027 Sınav Takvimi).
CREATE TABLE IF NOT EXISTS official_exam_dates (
  exam_code TEXT NOT NULL CHECK(exam_code IN ('LGS','YKS')),
  academic_year TEXT NOT NULL,
  exam_date TEXT NOT NULL CHECK(exam_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  label TEXT NOT NULL,
  source TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(exam_code,academic_year)
);
INSERT OR IGNORE INTO official_exam_dates(exam_code,academic_year,exam_date,label,source) VALUES
  ('LGS','2026-2027','2027-06-13','LGS','MEB 2027 Sınav Uygulama Takvimi'),
  ('YKS','2026-2027','2027-06-19','YKS (TYT)','ÖSYM 2027 Sınav Takvimi');

-- Interests (meslekler) are offered from 4th grade on; the catalogue started at 5th.
UPDATE profession_catalog SET min_grade=4 WHERE min_grade=5;
