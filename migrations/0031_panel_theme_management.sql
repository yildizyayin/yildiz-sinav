PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS panel_themes (
  theme_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  is_standard INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO panel_themes(theme_key,name,description,active,is_standard,sort_order) VALUES
  ('ANUNEX_STANDARD','ANUNEX Standard','Onaylı açık zemin, lacivert-mavi kurumsal tema.',1,1,1),
  ('ANUNEX_COSMIC','Kozmik','Koyu uzay zemini ve yaşayan Nibiru vurgusu.',0,0,2),
  ('ANUNEX_NEON','Neon','Öğrenci motivasyonu ve oyunlaştırma için enerjik görünüm.',0,0,3),
  ('ANUNEX_FOCUS','Odak','Sınav dönemleri için dikkat dağıtmayan yalın görünüm.',0,0,4);

CREATE TABLE IF NOT EXISTS institution_panel_theme_access (
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  theme_key TEXT NOT NULL REFERENCES panel_themes(theme_key) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT')),
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(institution_id,theme_key,role)
);
CREATE INDEX IF NOT EXISTS idx_panel_theme_access_scope ON institution_panel_theme_access(institution_id,role,enabled);

CREATE TABLE IF NOT EXISTS special_day_experiences (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  short_message TEXT NOT NULL,
  theme_key TEXT REFERENCES panel_themes(theme_key),
  accent_color TEXT NOT NULL DEFAULT '#C51F2E',
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  role TEXT CHECK(role IS NULL OR role IN ('INSTITUTION_MANAGER','TEACHER','GUIDANCE_TEACHER','STUDENT','PARENT')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_special_day_active_range ON special_day_experiences(active,starts_at,ends_at,priority DESC);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('DRAFT','COMPLETED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,attendance_date)
);

CREATE TABLE IF NOT EXISTS attendance_records (
  session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  attendance_status TEXT NOT NULL CHECK(attendance_status IN ('PRESENT','ABSENT','LATE','EXCUSED')),
  note TEXT,
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(session_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON attendance_records(student_id,recorded_at DESC);
