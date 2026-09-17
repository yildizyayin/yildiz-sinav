PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS academic_target_sources (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('MEB_ROTA_MAARIF','MEB_EOKUL','OSYM','YOK_ATLAS')),
  title TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 1,
  base_url TEXT NOT NULL,
  data_year INTEGER,
  last_verified_at TEXT,
  last_imported_at TEXT,
  import_status TEXT NOT NULL DEFAULT 'READY' CHECK(import_status IN ('READY','IMPORTING','CURRENT','STALE','FAILED')),
  note TEXT,
  UNIQUE(source_kind, data_year)
);

INSERT OR IGNORE INTO academic_target_sources(id,source_kind,title,base_url,data_year,last_verified_at,import_status,note) VALUES
 ('src_meb_rota_2026','MEB_ROTA_MAARIF','MEB Rota Maarif','https://rotamaarif.meb.gov.tr/',2026,'2026-08-22','READY','LGS okul bilgileri, taban puan, yüzdelik dilim ve yayımlandığı ölçüde net profilleri.'),
 ('src_meb_eokul_2026','MEB_EOKUL','MEB e-Okul 2026 Yerleştirme','https://e-okul.meb.gov.tr/',2026,'2026-08-22','READY','2026 merkezi yerleştirme taban puan, kontenjan ve yerleştirme verileri.'),
 ('src_osym_2026','OSYM','ÖSYM 2026-YKS','https://www.osym.gov.tr/',2026,'2026-08-22','READY','2026-YKS resmi yerleştirme sonuçları ve kılavuzları.'),
 ('src_yok_atlas_2026','YOK_ATLAS','YÖK Atlas','https://yokatlas.yok.gov.tr/',2026,'2026-08-22','READY','Program başarı sırası, taban puan ve TYT-AYT Net Sihirbazı verileri.');

CREATE TABLE IF NOT EXISTS secondary_school_targets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES academic_target_sources(id),
  external_code TEXT,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT,
  school_type TEXT,
  placement_type TEXT NOT NULL DEFAULT 'CENTRAL' CHECK(placement_type IN ('CENTRAL','LOCAL','TALENT')),
  source_year INTEGER NOT NULL,
  base_score REAL,
  percentile REAL,
  quota INTEGER,
  net_profile_json TEXT,
  source_url TEXT NOT NULL,
  source_verified_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, external_code, source_year)
);
CREATE INDEX IF NOT EXISTS idx_secondary_target_search ON secondary_school_targets(source_year,city,district,name);
CREATE INDEX IF NOT EXISTS idx_secondary_target_percentile ON secondary_school_targets(source_year,percentile);

CREATE TABLE IF NOT EXISTS university_program_targets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES academic_target_sources(id),
  program_code TEXT,
  university_name TEXT NOT NULL,
  faculty_name TEXT,
  program_name TEXT NOT NULL,
  university_type TEXT,
  scholarship TEXT,
  score_type TEXT NOT NULL,
  source_year INTEGER NOT NULL,
  base_score REAL,
  success_rank INTEGER,
  quota INTEGER,
  min_rank_rule INTEGER,
  net_profile_json TEXT,
  source_url TEXT NOT NULL,
  source_verified_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, program_code, source_year)
);
CREATE INDEX IF NOT EXISTS idx_university_target_search ON university_program_targets(source_year,score_type,university_name,program_name);
CREATE INDEX IF NOT EXISTS idx_university_target_rank ON university_program_targets(source_year,score_type,success_rank);

CREATE TABLE IF NOT EXISTS student_academic_targets (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK(target_type IN ('LGS_SCHOOL','YKS_PROGRAM')),
  secondary_school_target_id TEXT REFERENCES secondary_school_targets(id),
  university_program_target_id TEXT REFERENCES university_program_targets(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ACHIEVED','ARCHIVED')),
  set_by_user_id TEXT NOT NULL REFERENCES users(id),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_one_active_target ON student_academic_targets(student_id) WHERE status='ACTIVE';

CREATE TABLE IF NOT EXISTS target_analysis_snapshots (
  id TEXT PRIMARY KEY,
  target_id TEXT NOT NULL REFERENCES student_academic_targets(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  exam_count INTEGER NOT NULL DEFAULT 0,
  latest_exam_id TEXT REFERENCES exams(id),
  current_metric_json TEXT,
  target_metric_json TEXT,
  gap_json TEXT,
  weak_outcomes_json TEXT,
  trend TEXT CHECK(trend IN ('RISING','STABLE','FALLING','INSUFFICIENT')),
  explanation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_target_snapshots_student ON target_analysis_snapshots(student_id,created_at DESC);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  announcement_type TEXT NOT NULL CHECK(announcement_type IN ('GENERAL','MEETING','EXAM','RESULT','WORKSHEET','URGENT')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  audience_type TEXT NOT NULL CHECK(audience_type IN ('ALL','ROLE','GRADE','CLASS','SELECTED')),
  audience_json TEXT NOT NULL DEFAULT '{}',
  channels_json TEXT NOT NULL DEFAULT '["PANEL"]',
  sms_fallback INTEGER NOT NULL DEFAULT 0,
  whatsapp_template_name TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SCHEDULED','SENDING','SENT','CANCELLED')),
  scheduled_at TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_announcements_scope ON announcements(institution_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
  id TEXT PRIMARY KEY,
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('PANEL','WHATSAPP','SMS')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','DELIVERED','SKIPPED','FAILED')),
  provider_message_id TEXT,
  failure_code TEXT,
  attempted_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(announcement_id,recipient_user_id,channel)
);
CREATE INDEX IF NOT EXISTS idx_announcement_delivery_status ON announcement_deliveries(announcement_id,channel,status);

CREATE TABLE IF NOT EXISTS worksheet_calendar_entries (
  id TEXT PRIMARY KEY,
  worksheet_id TEXT NOT NULL REFERENCES worksheets(id) ON DELETE CASCADE,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  planned_date TEXT NOT NULL,
  planned_week INTEGER,
  actual_date TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','ASSIGNED','APPLIED','SKIPPED','CANCELLED')),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_worksheet_calendar_scope ON worksheet_calendar_entries(institution_id,class_id,planned_date);
CREATE INDEX IF NOT EXISTS idx_worksheet_calendar_worksheet ON worksheet_calendar_entries(worksheet_id,planned_date);

CREATE TABLE IF NOT EXISTS communication_settings (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  panel_enabled INTEGER NOT NULL DEFAULT 1,
  whatsapp_enabled INTEGER NOT NULL DEFAULT 1,
  sms_fallback_enabled INTEGER NOT NULL DEFAULT 0,
  sms_provider TEXT,
  sms_sender TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
