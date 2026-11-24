-- Nibiru Öğrenme Evreni, PR-1 (owner, 11 Nov 2026): one game engine for grades 4–12.
-- GameTemplate → LearningContent → StudentSession → VerifiedResult. Logic, content and look are kept apart:
--   lu_game_templates  the ten game kinds (logic lives in code, switches and limits live here);
--   lu_game_contents   teacher-approved content that is not a plain multiple-choice question (pairs, sequences,
--                      cloze, image regions, audio questions, math steps). Multiple-choice items come straight from
--                      question_bank and are never copied here;
--   lu_sessions / lu_session_items  one play; the answer key stays on the server, results are graded here;
--   lu_xp_ledger       every XP grant once (replaying or resending never pays twice); XP is never accuracy;
--   lu_content_gaps    what the selector could not fill (grade → subject → outcome → game kind), for the Super Admin.
-- Nothing here changes existing tables or earlier evidence.

CREATE TABLE IF NOT EXISTS lu_game_templates (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE CHECK(kind IN ('CHOICE','MATCH','ORDER','FILL','MEMORY','VISUAL','LISTEN','MATH_STEPS','TIMED','FINAL')),
  title TEXT NOT NULL,
  description TEXT,
  content_kind TEXT NOT NULL CHECK(content_kind IN ('QUESTION','PAIRS','SEQUENCE','CLOZE','HOTSPOT','AUDIO_QUESTION','STEPS','MIXED')),
  min_grade INTEGER NOT NULL DEFAULT 4 CHECK(min_grade BETWEEN 1 AND 12),
  max_grade INTEGER NOT NULL DEFAULT 12 CHECK(max_grade BETWEEN 1 AND 12),
  min_items INTEGER NOT NULL DEFAULT 3 CHECK(min_items BETWEEN 1 AND 20),
  max_items INTEGER NOT NULL DEFAULT 8 CHECK(max_items BETWEEN 1 AND 20),
  seconds_per_item INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO lu_game_templates(code,kind,title,description,content_kind,min_items,max_items,seconds_per_item,sort_order) VALUES
 ('LU_CHOICE','CHOICE','Bilgi Görevi','3, 4 ya da 5 seçenekli onaylı sorular.','QUESTION',3,8,NULL,10),
 ('LU_MATCH','MATCH','Kavram Eşleştirme','Kavram, tanım ve açıklama kartlarını eşleştir.','PAIRS',1,4,NULL,20),
 ('LU_ORDER','ORDER','Sırala','İşlem adımlarını, olayları ya da süreçleri doğru sıraya koy.','SEQUENCE',1,4,NULL,30),
 ('LU_FILL','FILL','Boşluk Doldurma','Metni, işlemi ya da kavramı tamamla.','CLOZE',2,6,NULL,40),
 ('LU_MEMORY','MEMORY','Hafıza Kartları','Terim ve tanım kartlarını bul; aralıklı tekrar planına bağlıdır.','PAIRS',1,3,NULL,50),
 ('LU_VISUAL','VISUAL','Görsel Keşif','Görsel üzerinde doğru bölgeyi seç.','HOTSPOT',2,6,NULL,60),
 ('LU_LISTEN','LISTEN','Dinle ve Cevapla','Yönergeyi dinle, sonra cevapla. Yazılı hâli her zaman vardır.','AUDIO_QUESTION',2,6,NULL,70),
 ('LU_MATH_STEPS','MATH_STEPS','İşlem Yolculuğu','Problemi adım adım çöz; ara adımlar da kontrol edilir.','STEPS',1,4,NULL,80),
 ('LU_TIMED','TIMED','Süreli Meydan Okuma','Kısa süreli tekrar. Süre kapatılabilir; hız başarı sayılmaz.','QUESTION',5,10,45,90),
 ('LU_FINAL','FINAL','Kazanım Finali','Aynı kazanımı farklı etkinliklerle uygula.','MIXED',4,10,NULL,100);

CREATE TABLE IF NOT EXISTS lu_game_contents (
  id TEXT PRIMARY KEY,
  content_kind TEXT NOT NULL CHECK(content_kind IN ('PAIRS','SEQUENCE','CLOZE','HOTSPOT','AUDIO_QUESTION','STEPS')),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 1 AND 12),
  subject_id TEXT REFERENCES subjects(id),
  title TEXT,
  public_json TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  difficulty INTEGER CHECK(difficulty BETWEEN 1 AND 5),
  owner_type TEXT NOT NULL DEFAULT 'PLATFORM' CHECK(owner_type IN ('PLATFORM','INSTITUTION')),
  owner_id TEXT,
  copyright_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN','RESTRICTED','UNKNOWN')),
  review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(review_status IN ('DRAFT','REVIEW','APPROVED','REJECTED')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lu_contents_pick ON lu_game_contents(outcome_id,content_kind,review_status);
CREATE INDEX IF NOT EXISTS idx_lu_contents_scope ON lu_game_contents(academic_year,grade_level,subject_id);

CREATE TABLE IF NOT EXISTS lu_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  template_code TEXT NOT NULL REFERENCES lu_game_templates(code),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  curriculum_version_id TEXT,
  mode TEXT NOT NULL DEFAULT 'PRACTICE' CHECK(mode IN ('PRACTICE','REVIEW','FINAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','SUBMITTED','EXPIRED')),
  timed INTEGER NOT NULL DEFAULT 0,
  item_count INTEGER NOT NULL,
  answered_count INTEGER,
  correct_count INTEGER,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  client_key TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  expires_at TEXT NOT NULL,
  UNIQUE(student_id,client_key)
);
CREATE INDEX IF NOT EXISTS idx_lu_sessions_student ON lu_sessions(student_id,outcome_id,started_at);

CREATE TABLE IF NOT EXISTS lu_session_items (
  session_id TEXT NOT NULL REFERENCES lu_sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('QUESTION','PAIRS','SEQUENCE','CLOZE','HOTSPOT','AUDIO_QUESTION','STEPS')),
  source TEXT NOT NULL CHECK(source IN ('QUESTION_BANK','GAME_CONTENT')),
  ref_id TEXT NOT NULL,
  repeat INTEGER NOT NULL DEFAULT 0,
  public_json TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  response_json TEXT,
  correct INTEGER,
  partial REAL,
  answered_at TEXT,
  PRIMARY KEY(session_id,seq)
);
CREATE INDEX IF NOT EXISTS idx_lu_items_ref ON lu_session_items(source,ref_id);

CREATE TABLE IF NOT EXISTS lu_xp_ledger (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  xp INTEGER NOT NULL CHECK(xp >= 0),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id,source_type,source_id)
);

CREATE TABLE IF NOT EXISTS lu_content_gaps (
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  subject_id TEXT,
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  template_kind TEXT NOT NULL,
  needed INTEGER NOT NULL,
  available INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(academic_year,outcome_id,template_kind)
);
CREATE INDEX IF NOT EXISTS idx_lu_gaps_scope ON lu_content_gaps(academic_year,grade_level,subject_id);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES ('LEARNING_UNIVERSE','Nibiru Öğrenme Evreni','NEXT',0);
