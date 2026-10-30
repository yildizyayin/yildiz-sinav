-- LGS/YKS sayacı (owner, 30 Oct): the national exam dates the sonuc student panel counts down to (8th grade → LGS,
-- 12th grade → YKS). Only dates the Super Admin records (with their source) are shown; an unannounced date stays
-- PENDING and the panel says so instead of guessing.
CREATE TABLE IF NOT EXISTS national_exam_dates (
  code TEXT PRIMARY KEY CHECK(code IN ('LGS','YKS')),
  title TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK(grade_level IN (8,12)),
  exam_date TEXT CHECK(exam_date IS NULL OR exam_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  exam_time TEXT CHECK(exam_time IS NULL OR exam_time GLOB '[0-2][0-9]:[0-5][0-9]'),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','OFFICIAL')),
  source_label TEXT,
  source_url TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- YKS 2027: ÖSYM 2027 calendar as reported on 28 Oct 2026 (TYT 19 June 2027). The session time is not recorded until
-- ÖSYM's guide gives it. LGS 2027: not announced by MEB yet.
INSERT OR IGNORE INTO national_exam_dates(code,title,grade_level,exam_date,exam_time,status,source_label,source_url) VALUES
  ('YKS','YKS 2027 · TYT',12,'2027-06-19',NULL,'OFFICIAL','ÖSYM 2027 sınav takvimi (A Haber, 28 Ekim 2026)','https://ahaber.com.tr/egitim/osym-2027-sinav-takvimi-aciklandi-yks-kpss-msu-ve-ales-hangi-tarihlerde-yapilacak-6542157'),
  ('LGS','LGS 2027',8,NULL,NULL,'PENDING',NULL,NULL);
