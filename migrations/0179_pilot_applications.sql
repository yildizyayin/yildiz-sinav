-- Pilot okul başvurusu (owner, 12 Nov 2026): the "Pilot okul başvurusu" form on anunex.com. Only what is needed to call
-- the school back; the applicant agrees to the KVKK notice shown under the form. No student data is ever asked.
CREATE TABLE IF NOT EXISTS pilot_applications (
  id TEXT PRIMARY KEY,
  institution_name TEXT NOT NULL,
  city TEXT NOT NULL,
  institution_type TEXT NOT NULL CHECK(institution_type IN ('DEVLET_OKULU','OZEL_OKUL','KURS','ETUT_MERKEZI','DIGER')),
  student_count TEXT,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  message TEXT,
  kvkk_version TEXT NOT NULL,
  ip_hash TEXT,
  status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','CONTACTED','PILOT','DECLINED')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pilot_applications_phone ON pilot_applications(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_pilot_applications_ip ON pilot_applications(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_pilot_applications_status ON pilot_applications(status, created_at);
