PRAGMA foreign_keys = ON;

-- Platform feature gates keep Standard stable while the expanded modules are developed and enabled per institution.
CREATE TABLE IF NOT EXISTS platform_features (
  feature_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'NEXT' CHECK(stage IN ('STANDARD','NEXT','EXPERIMENTAL')),
  enabled_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institution_feature_overrides (
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES platform_features(feature_key) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(institution_id, feature_key)
);

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('EXAM_CENTER','Sınav Merkezi','STANDARD',1),
 ('LEARNING_GRAPH','Learning Graph','NEXT',0),
 ('QUESTION_BANK','Soru Havuzu','NEXT',0),
 ('RECOVERY','Recovery','NEXT',0),
 ('RBA','Rasyonel Beyin Analizi','NEXT',0),
 ('MEMBERSHIP','Gold / Premium','NEXT',0),
 ('LIVE','Canlı Destek','NEXT',0),
 ('STUDIO','Sınav & Yazılı Studio','NEXT',0),
 ('PHYSICAL_BRIDGE','Fiziksel İçerik Köprüsü','NEXT',0),
 ('GAMES','Mini Oyunlar','NEXT',0),
 ('CAMPUS','Campus / White Label','NEXT',0),
 ('ENTERPRISE','Zincir Kurum Yönetimi','NEXT',0),
 ('PUBLISHER','Yayınevi Analitiği','NEXT',0),
 ('ADMISSIONS','Bursluluk / Kabul','NEXT',0),
 ('GUIDANCE_TESTS','Rehberlik Testleri','NEXT',0),
 ('BOARD','Akıllı Tahta','NEXT',0),
 ('MOBILE_API','Mobil Uygulama API','NEXT',0),
 ('VIDEO_LIBRARY','Video Kütüphanesi','NEXT',0);

-- Exam Center: one engine, three scopes.
CREATE TABLE IF NOT EXISTS institution_networks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  headquarters_institution_id TEXT REFERENCES institutions(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institution_network_members (
  network_id TEXT NOT NULL REFERENCES institution_networks(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  region_label TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(network_id, institution_id)
);
CREATE INDEX IF NOT EXISTS idx_network_members_institution ON institution_network_members(institution_id, active);

CREATE TABLE IF NOT EXISTS network_user_roles (
  network_id TEXT NOT NULL REFERENCES institution_networks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'NETWORK_VIEWER' CHECK(role IN ('NETWORK_ADMIN','NETWORK_VIEWER')),
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(network_id,user_id)
);

CREATE TABLE IF NOT EXISTS publishers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS publisher_user_access (
  publisher_id TEXT NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level TEXT NOT NULL DEFAULT 'ANALYTICS' CHECK(access_level IN ('ANALYTICS','EDITOR','ADMIN')),
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(publisher_id,user_id)
);

CREATE TABLE IF NOT EXISTS exam_delivery_profiles (
  exam_id TEXT PRIMARY KEY REFERENCES exams(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'INSTITUTION' CHECK(scope IN ('INSTITUTION','NETWORK','CENTRAL')),
  publisher_id TEXT REFERENCES publishers(id),
  network_id TEXT REFERENCES institution_networks(id),
  catalog_code TEXT,
  verified_catalog INTEGER NOT NULL DEFAULT 0,
  result_freeze_status TEXT NOT NULL DEFAULT 'OPEN' CHECK(result_freeze_status IN ('OPEN','FROZEN','PUBLISHED')),
  freeze_at TEXT,
  published_at TEXT,
  snapshot_version INTEGER NOT NULL DEFAULT 0,
  expected_participants INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_delivery_scope ON exam_delivery_profiles(scope, verified_catalog, result_freeze_status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_catalog_code ON exam_delivery_profiles(catalog_code) WHERE catalog_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS exam_result_snapshots (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES exam_participants(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL,
  student_id TEXT REFERENCES student_entities(id),
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  network_id TEXT REFERENCES institution_networks(id),
  city TEXT,
  district TEXT,
  grade_level INTEGER,
  class_snapshot TEXT,
  score REAL,
  net REAL NOT NULL DEFAULT 0,
  national_rank INTEGER,
  national_count INTEGER,
  city_rank INTEGER,
  city_count INTEGER,
  district_rank INTEGER,
  district_count INTEGER,
  network_rank INTEGER,
  network_count INTEGER,
  institution_rank INTEGER,
  institution_count INTEGER,
  grade_rank INTEGER,
  grade_count INTEGER,
  class_rank INTEGER,
  class_count INTEGER,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_id,participant_id,snapshot_version)
);
CREATE INDEX IF NOT EXISTS idx_result_snapshot_student ON exam_result_snapshots(student_id,exam_id,snapshot_version);
CREATE INDEX IF NOT EXISTS idx_result_snapshot_exam ON exam_result_snapshots(exam_id,snapshot_version,national_rank);
CREATE INDEX IF NOT EXISTS idx_result_snapshot_city ON exam_result_snapshots(exam_id,snapshot_version,city,city_rank);
CREATE INDEX IF NOT EXISTS idx_result_snapshot_network ON exam_result_snapshots(exam_id,snapshot_version,network_id,network_rank);

CREATE TABLE IF NOT EXISTS exam_publication_stats (
  exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL,
  institution_count INTEGER NOT NULL DEFAULT 0,
  participant_count INTEGER NOT NULL DEFAULT 0,
  city_count INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(exam_id,snapshot_version)
);

-- Learning Graph / Deep Academic Map.
CREATE TABLE IF NOT EXISTS learning_nodes (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK(node_type IN ('SUBJECT','TOPIC','SUBTOPIC','OUTCOME','SKILL','QUESTION_TYPE')),
  subject_id TEXT REFERENCES subjects(id),
  grade_level INTEGER,
  code TEXT,
  title TEXT NOT NULL,
  parent_id TEXT REFERENCES learning_nodes(id),
  official INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(academic_year,node_type,code)
);
CREATE INDEX IF NOT EXISTS idx_learning_nodes_scope ON learning_nodes(academic_year,grade_level,subject_id,node_type);

CREATE TABLE IF NOT EXISTS learning_edges (
  from_node_id TEXT NOT NULL REFERENCES learning_nodes(id) ON DELETE CASCADE,
  to_node_id TEXT NOT NULL REFERENCES learning_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(relation IN ('PARENT','PREREQUISITE','RELATED','EVIDENCE_FOR')),
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(from_node_id,to_node_id,relation)
);

CREATE TABLE IF NOT EXISTS student_learning_state (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES learning_nodes(id) ON DELETE CASCADE,
  mastery REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  last_evidence_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id,node_id)
);

CREATE TABLE IF NOT EXISTS learning_evidence (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES learning_nodes(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('EXAM','ASSIGNMENT','RECOVERY','GAME','VIDEO_CHECK','MANUAL')),
  source_id TEXT,
  result REAL NOT NULL,
  weight REAL NOT NULL DEFAULT 1,
  observed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_learning_evidence_student ON learning_evidence(student_id,node_id,observed_at);

-- Question and content operations.
CREATE TABLE IF NOT EXISTS question_bank (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL DEFAULT 'PLATFORM' CHECK(owner_type IN ('PLATFORM','INSTITUTION','PUBLISHER','USER')),
  owner_id TEXT,
  academic_year TEXT,
  grade_level INTEGER,
  subject_id TEXT REFERENCES subjects(id),
  topic TEXT,
  subtopic TEXT,
  question_type TEXT NOT NULL DEFAULT 'MULTIPLE_CHOICE' CHECK(question_type IN ('MULTIPLE_CHOICE','OPEN_ENDED','TRUE_FALSE','MATCHING','OTHER')),
  difficulty INTEGER NOT NULL DEFAULT 3 CHECK(difficulty BETWEEN 1 AND 5),
  stem_text TEXT NOT NULL,
  options_json TEXT,
  correct_answer TEXT,
  solution_text TEXT,
  source_label TEXT,
  copyright_status TEXT NOT NULL DEFAULT 'OWNED' CHECK(copyright_status IN ('OWNED','LICENSED','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED')),
  review_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(review_status IN ('DRAFT','REVIEW','APPROVED','REJECTED','ARCHIVED')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_question_bank_search ON question_bank(grade_level,subject_id,difficulty,review_status);

CREATE TABLE IF NOT EXISTS question_learning_links (
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES learning_nodes(id) ON DELETE CASCADE,
  weight REAL NOT NULL DEFAULT 1,
  PRIMARY KEY(question_id,node_id)
);

CREATE TABLE IF NOT EXISTS question_assets (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('IMAGE','PDF','AUDIO','VIDEO','SOLUTION_VIDEO')),
  r2_key TEXT,
  external_url TEXT,
  title TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS learning_videos (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'YOUTUBE' CHECK(provider IN ('YOUTUBE','R2','EXTERNAL')),
  external_id TEXT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  grade_level INTEGER,
  subject_id TEXT REFERENCES subjects(id),
  node_id TEXT REFERENCES learning_nodes(id),
  duration_seconds INTEGER,
  approved INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider,url)
);

-- Assignment engine.
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  season_id TEXT REFERENCES institution_seasons(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  assignment_type TEXT NOT NULL DEFAULT 'TEACHER' CHECK(assignment_type IN ('TEACHER','NIBIRU','RECOVERY')),
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ASSIGNED','CLOSED','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assignment_items (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('QUESTION','WORKSHEET','VIDEO','BOOK_PAGE','TASK')),
  reference_id TEXT,
  payload_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS assignment_recipients (
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','STARTED','COMPLETED','EXCUSED')),
  progress REAL NOT NULL DEFAULT 0,
  completed_at TEXT,
  PRIMARY KEY(assignment_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_student ON assignment_recipients(student_id,status);

CREATE TABLE IF NOT EXISTS assignment_attempts (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES assignment_items(id) ON DELETE CASCADE,
  answer_json TEXT,
  score REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Recovery / Zero Gap.
CREATE TABLE IF NOT EXISTS recovery_plans (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  source_exam_id TEXT REFERENCES exams(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETED','ARCHIVED')),
  generated_by TEXT NOT NULL DEFAULT 'SYSTEM' CHECK(generated_by IN ('SYSTEM','NIBIRU','TEACHER')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS recovery_steps (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES recovery_plans(id) ON DELETE CASCADE,
  node_id TEXT REFERENCES learning_nodes(id),
  step_type TEXT NOT NULL CHECK(step_type IN ('EXPLAIN','VIDEO','PRACTICE','RETEST','REVIEW')),
  reference_id TEXT,
  difficulty INTEGER,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','AVAILABLE','DONE','SKIPPED')),
  score REAL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- RBA educational learning-behaviour profile; not a medical/psychological diagnosis.
CREATE TABLE IF NOT EXISTS rba_profiles (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  analytical_score REAL,
  verbal_processing_score REAL,
  numeric_processing_score REAL,
  consistency_score REAL,
  error_repetition_score REAL,
  pace_score REAL,
  plan_adherence_score REAL,
  persistence_score REAL,
  performance_stability_score REAL,
  confidence REAL NOT NULL DEFAULT 0,
  evidence_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rba_assessments (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  instrument_version TEXT NOT NULL,
  response_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Membership / entitlements / live credits.
CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tier INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  entitlement_json TEXT NOT NULL,
  monthly_live_credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO membership_plans(id,code,name,tier,entitlement_json,monthly_live_credits) VALUES
 ('plan_standard','STANDARD','Standard',0,'{"basic_results":true,"basic_target":true,"basic_nibiru":true}',0),
 ('plan_gold','GOLD','Gold',1,'{"advanced_nibiru":true,"ai_guidance":true,"ai_coach":true,"rba":true,"recovery":true,"extended_question_bank":true}',0),
 ('plan_premium','PREMIUM','Premium',2,'{"advanced_nibiru":true,"ai_guidance":true,"ai_coach":true,"rba":true,"recovery":true,"full_question_bank":true,"premium_reports":true}',3);

CREATE TABLE IF NOT EXISTS student_memberships (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED','CANCELLED','SUSPENDED')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  source TEXT NOT NULL DEFAULT 'INSTITUTION' CHECK(source IN ('INSTITUTION','PURCHASE','PROMO','ADMIN')),
  external_payment_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_membership_student ON student_memberships(student_id,status,ends_at);

CREATE TABLE IF NOT EXISTS live_credit_wallets (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_credit_ledger (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_providers (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  provider_type TEXT NOT NULL CHECK(provider_type IN ('GUIDANCE','COACH','LESSON')),
  display_name TEXT NOT NULL,
  subjects_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS live_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id),
  provider_id TEXT REFERENCES live_providers(id),
  session_type TEXT NOT NULL CHECK(session_type IN ('GUIDANCE','COACH','LESSON')),
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 20,
  credit_cost INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN ('RESERVED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
  meeting_provider TEXT,
  meeting_ref TEXT,
  private_note TEXT,
  action_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_sessions_student ON live_sessions(student_id,scheduled_at,status);

-- Studio: written exams / practice exams / print documents.
CREATE TABLE IF NOT EXISTS studio_documents (
  id TEXT PRIMARY KEY,
  institution_id TEXT REFERENCES institutions(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  document_type TEXT NOT NULL CHECK(document_type IN ('WRITTEN_EXAM','PRACTICE_EXAM','WORKSHEET','PERSONAL_BOOK')),
  title TEXT NOT NULL,
  grade_level INTEGER,
  subject_id TEXT REFERENCES subjects(id),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEW','READY','PUBLISHED','ARCHIVED')),
  config_json TEXT,
  pdf_r2_key TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS studio_document_items (
  document_id TEXT NOT NULL REFERENCES studio_documents(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES question_bank(id),
  booklet_code TEXT NOT NULL DEFAULT 'A',
  sort_order INTEGER NOT NULL,
  points REAL,
  PRIMARY KEY(document_id,question_id,booklet_code)
);

-- Physical book <-> digital learning bridge.
CREATE TABLE IF NOT EXISTS physical_content_items (
  id TEXT PRIMARY KEY,
  publisher_id TEXT REFERENCES publishers(id),
  isbn_or_code TEXT,
  title TEXT NOT NULL,
  grade_level INTEGER,
  academic_year TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS physical_content_links (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES physical_content_items(id) ON DELETE CASCADE,
  page_from INTEGER,
  page_to INTEGER,
  external_key TEXT NOT NULL UNIQUE,
  reference_type TEXT NOT NULL CHECK(reference_type IN ('QUESTION_SET','VIDEO','ASSIGNMENT','WORKSHEET','TEST')),
  reference_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Gamification / mini games.
CREATE TABLE IF NOT EXISTS gamification_profiles (
  student_id TEXT PRIMARY KEY REFERENCES student_entities(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  streak_days INTEGER NOT NULL DEFAULT 0,
  last_activity_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  rule_json TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS student_achievements (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id),
  earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id,achievement_id)
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  game_code TEXT NOT NULL,
  node_id TEXT REFERENCES learning_nodes(id),
  score REAL NOT NULL DEFAULT 0,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER,
  payload_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO achievements(id,code,title,description,xp_reward) VALUES
 ('ach_first_recovery','FIRST_RECOVERY','İlk Açık Kapatıldı','İlk Recovery planını tamamladı.',100),
 ('ach_streak_7','STREAK_7','7 Günlük Seri','Yedi gün düzenli çalışma.',150),
 ('ach_exam_growth','EXAM_GROWTH','Yükseliş','Ardışık merkezi sınavlarda gelişim gösterdi.',100);

-- Campus / white-label config. Logo/name assets deliberately left empty until final branding decision.
CREATE TABLE IF NOT EXISTS campus_branding (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  subdomain TEXT UNIQUE,
  custom_domain TEXT UNIQUE,
  primary_color TEXT,
  secondary_color TEXT,
  logo_r2_key TEXT,
  welcome_text TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admissions / bursary / placement campaigns.
CREATE TABLE IF NOT EXISTS admissions_campaigns (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK(campaign_type IN ('SCHOLARSHIP','PLACEMENT','ADMISSION')),
  exam_id TEXT REFERENCES exams(id),
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','OPEN','CLOSED','ARCHIVED')),
  config_json TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admissions_candidates (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES admissions_campaigns(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  grade_level INTEGER,
  external_student_ref TEXT,
  application_status TEXT NOT NULL DEFAULT 'APPLIED' CHECK(application_status IN ('APPLIED','EXAM_READY','EXAMINED','OFFERED','ENROLLED','DECLINED')),
  scholarship_rate REAL,
  participant_id TEXT REFERENCES exam_participants(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Guidance instruments are educational, not diagnostic.
CREATE TABLE IF NOT EXISTS guidance_instruments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'STUDENT',
  questions_json TEXT NOT NULL,
  scoring_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  disclaimer TEXT NOT NULL DEFAULT 'Bu çalışma eğitsel rehberlik amaçlıdır; psikolojik veya tıbbi tanı değildir.'
);

CREATE TABLE IF NOT EXISTS guidance_responses (
  id TEXT PRIMARY KEY,
  instrument_id TEXT NOT NULL REFERENCES guidance_instruments(id),
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  response_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO guidance_instruments(id,code,title,purpose,questions_json,scoring_json) VALUES
 ('guide_study_habits','STUDY_HABITS','Çalışma Alışkanlıkları','Öğrencinin çalışma rutini hakkında eğitsel farkındalık oluşturmak','[{"id":"q1","text":"Çalışmaya başlamadan önce günlük hedef belirlerim."},{"id":"q2","text":"Yanlış yaptığım sorulara tekrar dönerim."},{"id":"q3","text":"Çalışma planımı çoğu gün uygularım."}]','{"scale":"1-5","dimensions":["planning","review","consistency"]}'),
 ('guide_goal_clarity','GOAL_CLARITY','Hedef Netliği','Akademik hedef ve plan netliğini değerlendirmek','[{"id":"q1","text":"Ulaşmak istediğim akademik hedefi biliyorum."},{"id":"q2","text":"Hedefime ulaşmak için hangi derslerde gelişmem gerektiğini biliyorum."},{"id":"q3","text":"Hedefimi düzenli olarak gözden geçiririm."}]','{"scale":"1-5","dimensions":["clarity","awareness","review"]}');

-- Smart board sessions use the same content engine; no second content silo.
CREATE TABLE IF NOT EXISTS board_sessions (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id),
  class_id TEXT REFERENCES classes(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED','ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
