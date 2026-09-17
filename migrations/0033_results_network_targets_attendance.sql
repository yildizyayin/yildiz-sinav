PRAGMA foreign_keys = ON;

-- ANUNEX national reference directory. A directory row is not a tenant or a licence.
CREATE TABLE IF NOT EXISTS national_institution_directory (
  meb_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  institution_type TEXT,
  ownership TEXT CHECK(ownership IS NULL OR ownership IN ('PUBLIC','PRIVATE')),
  education_level TEXT,
  official_url TEXT,
  source_url TEXT NOT NULL,
  source_updated_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CLOSED','UNVERIFIED')),
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_national_institution_location ON national_institution_directory(city,district,name);
CREATE INDEX IF NOT EXISTS idx_national_institution_name ON national_institution_directory(normalized_name);

CREATE TABLE IF NOT EXISTS institution_directory_sync_runs (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL CHECK(source_type IN ('MEB_OFFICIAL_EXPORT','MEB_PUBLIC_DIRECTORY','MANUAL_VERIFIED')),
  source_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREVIEW','RUNNING','COMPLETED','FAILED')),
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_upserted INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_by TEXT REFERENCES users(id),
  summary_json TEXT
);

-- Controlled career catalogue and up to three student choices.
CREATE TABLE IF NOT EXISTS profession_catalog (
  code TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  motivation_title TEXT NOT NULL,
  category TEXT NOT NULL,
  min_grade INTEGER NOT NULL DEFAULT 5,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO profession_catalog(code,title,motivation_title,category,min_grade,sort_order) VALUES
 ('DOCTOR','Doktor','Geleceğin doktoru','Sağlık',5,10),
 ('DENTIST','Diş Hekimi','Geleceğin diş hekimi','Sağlık',5,20),
 ('LAWYER','Avukat','Geleceğin hukukçusu','Hukuk',5,30),
 ('ENGINEER','Mühendis','Geleceğin mühendisi','Mühendislik',5,40),
 ('SOFTWARE','Yazılım Geliştirici','Geleceğin yazılım geliştiricisi','Teknoloji',5,50),
 ('ARCHITECT','Mimar','Geleceğin mimarı','Tasarım',5,60),
 ('TEACHER','Öğretmen','Geleceğin öğretmeni','Eğitim',5,70),
 ('PSYCHOLOGIST','Psikolog','Geleceğin psikoloğu','Sosyal Bilimler',5,80),
 ('FARMER','Çiftçi / Tarım Uzmanı','Geleceğin üreticisi','Tarım',5,90),
 ('ARTIST','Sanatçı / Tasarımcı','Geleceğin sanatçısı','Sanat',5,100);

CREATE TABLE IF NOT EXISTS student_profession_targets (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  profession_code TEXT NOT NULL REFERENCES profession_catalog(code),
  priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 3),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profession_priority ON student_profession_targets(student_id,priority) WHERE status='ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_profession_unique ON student_profession_targets(student_id,profession_code) WHERE status='ACTIVE';

ALTER TABLE student_experience_preferences ADD COLUMN motivation_frequency TEXT NOT NULL DEFAULT 'MILESTONES' CHECK(motivation_frequency IN ('OFF','MILESTONES','BALANCED'));

-- Exam catalogue metadata stays; each administration/cohort has its own retention clock.
ALTER TABLE exams ADD COLUMN publisher_name TEXT;
ALTER TABLE exams ADD COLUMN catalog_code TEXT;
ALTER TABLE exams ADD COLUMN catalogue_retention TEXT NOT NULL DEFAULT 'PERMANENT';
CREATE INDEX IF NOT EXISTS idx_exam_catalogue_tree ON exams(publisher_name,academic_year,exam_type,title);

CREATE TABLE IF NOT EXISTS exam_administrations (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id),
  academic_year TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('LICENSED','RESULT_NETWORK')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','UPLOADING','EVALUATING','READY','PUBLISHED','ARCHIVED','PURGED')),
  published_at TEXT,
  retention_due_at TEXT,
  ranking_frozen_at TEXT,
  participant_count INTEGER NOT NULL DEFAULT 0,
  institution_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_administration_retention ON exam_administrations(channel,status,retention_due_at);

CREATE TABLE IF NOT EXISTS result_network_institutions (
  id TEXT PRIMARY KEY,
  administration_id TEXT NOT NULL REFERENCES exam_administrations(id) ON DELETE CASCADE,
  meb_code TEXT NOT NULL REFERENCES national_institution_directory(meb_code),
  licensed_institution_id TEXT REFERENCES institutions(id),
  dealer_id TEXT,
  display_name_snapshot TEXT NOT NULL,
  city_snapshot TEXT,
  district_snapshot TEXT,
  access_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(access_status IN ('ACTIVE','LOCKED','PURGED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(administration_id,meb_code)
);
CREATE INDEX IF NOT EXISTS idx_result_network_institution_dealer ON result_network_institutions(dealer_id,administration_id);

-- Only keyed lookup tokens are kept for TCKN/student-number discovery; raw TCKN is never stored here.
CREATE TABLE IF NOT EXISTS result_access_identities (
  id TEXT PRIMARY KEY,
  administration_id TEXT NOT NULL REFERENCES exam_administrations(id) ON DELETE CASCADE,
  result_institution_id TEXT NOT NULL REFERENCES result_network_institutions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  grade_level INTEGER,
  normalized_name TEXT NOT NULL,
  student_number_lookup_token TEXT,
  tckn_lookup_token TEXT,
  access_code_hash TEXT NOT NULL,
  access_code_salt TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(administration_id,participant_id)
);
CREATE INDEX IF NOT EXISTS idx_result_lookup_student ON result_access_identities(result_institution_id,grade_level,student_number_lookup_token);
CREATE INDEX IF NOT EXISTS idx_result_lookup_tckn ON result_access_identities(result_institution_id,tckn_lookup_token);

CREATE TABLE IF NOT EXISTS result_lookup_challenges (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES result_access_identities(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_result_challenge_expiry ON result_lookup_challenges(expires_at);

CREATE TABLE IF NOT EXISTS result_portal_sessions (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL REFERENCES result_access_identities(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS result_ai_tips (
  identity_id TEXT PRIMARY KEY REFERENCES result_access_identities(id) ON DELETE CASCADE,
  tips_json TEXT NOT NULL,
  generator_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS result_retention_events (
  id TEXT PRIMARY KEY,
  administration_id TEXT NOT NULL REFERENCES exam_administrations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('NOTICE_90','NOTICE_60','NOTICE_15','PURGE_STARTED','PURGE_COMPLETED','PURGE_FAILED')),
  event_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  summary_json TEXT
);

-- Lesson-period attendance without breaking the existing daily attendance table.
CREATE TABLE IF NOT EXISTS attendance_period_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,
  session_type TEXT NOT NULL DEFAULT 'DAILY' CHECK(session_type IN ('DAILY','PERIOD')),
  period_no INTEGER NOT NULL DEFAULT 0 CHECK(period_no BETWEEN 0 AND 20),
  subject_id TEXT REFERENCES subjects(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','COMPLETED','CORRECTION_PENDING','CORRECTED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,attendance_date,session_type,period_no)
);

CREATE TABLE IF NOT EXISTS attendance_period_records (
  session_id TEXT NOT NULL REFERENCES attendance_period_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('PRESENT','ABSENT','LATE','EXCUSED','MEDICAL')),
  minutes_late INTEGER NOT NULL DEFAULT 0 CHECK(minutes_late BETWEEN 0 AND 180),
  note TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(session_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_period_student ON attendance_period_records(student_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_period_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  requested_status TEXT NOT NULL CHECK(requested_status IN ('PRESENT','ABSENT','LATE','EXCUSED','MEDICAL')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED')),
  requested_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_notification_outbox (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_period_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('WHATSAPP','IN_APP')),
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','SKIPPED','FAILED')),
  scheduled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  error_code TEXT,
  UNIQUE(session_id,student_id,channel)
);

-- Capacity proof now supports the three agreed profiles, including one million synthetic rows.
ALTER TABLE capacity_test_runs ADD COLUMN institution_target_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE capacity_test_runs ADD COLUMN profile_key TEXT NOT NULL DEFAULT 'CUSTOM';

CREATE TABLE IF NOT EXISTS capacity_benchmark_runs (
  id TEXT PRIMARY KEY,
  profile_key TEXT NOT NULL CHECK(profile_key IN ('SMALL','REGIONAL','NATIONAL')),
  institution_target_count INTEGER NOT NULL CHECK(institution_target_count BETWEEN 1 AND 15000),
  student_target_count INTEGER NOT NULL CHECK(student_target_count BETWEEN 1 AND 1000000),
  chunk_size INTEGER NOT NULL CHECK(chunk_size BETWEEN 100 AND 1000),
  total_chunks INTEGER NOT NULL,
  completed_chunks INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_chunks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('ENQUEUEING','QUEUED','RUNNING','COMPLETED','FAILED')),
  environment TEXT NOT NULL,
  started_by TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS capacity_benchmark_chunks (
  run_id TEXT NOT NULL REFERENCES capacity_benchmark_runs(id) ON DELETE CASCADE,
  chunk_no INTEGER NOT NULL,
  start_no INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  duration_ms INTEGER,
  PRIMARY KEY(run_id,chunk_no)
);
CREATE TABLE IF NOT EXISTS capacity_benchmark_rows (
  run_id TEXT NOT NULL REFERENCES capacity_benchmark_runs(id) ON DELETE CASCADE,
  synthetic_number INTEGER NOT NULL,
  institution_shard INTEGER NOT NULL,
  result_shard INTEGER NOT NULL,
  compact_answer_hash TEXT NOT NULL,
  PRIMARY KEY(run_id,synthetic_number)
);
CREATE INDEX IF NOT EXISTS idx_capacity_benchmark_shards ON capacity_benchmark_rows(run_id,result_shard,institution_shard,synthetic_number);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('RESULT_NETWORK','Lisanssız Sonuç Ağı','STANDARD',1),
 ('NATIONAL_INSTITUTION_DIRECTORY','MEB Kurum Referans Dizini','STANDARD',1),
 ('PROFESSION_TARGETS','Meslek Hedefleri','STANDARD',1),
 ('PERIOD_ATTENDANCE','Ders Bazlı Yoklama','STANDARD',1);
