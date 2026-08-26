PRAGMA foreign_keys = ON;

-- Commercial package contract: Free/Standard + Gold 100 TRY/year + Premium 300 TRY/year.
ALTER TABLE membership_plans ADD COLUMN annual_price_try INTEGER NOT NULL DEFAULT 0;
ALTER TABLE membership_plans ADD COLUMN billing_period TEXT NOT NULL DEFAULT 'YEAR' CHECK(billing_period IN ('YEAR'));

UPDATE membership_plans SET name='Ücretsiz / Standard',annual_price_try=0 WHERE code='STANDARD';
UPDATE membership_plans SET annual_price_try=100 WHERE code='GOLD';
UPDATE membership_plans SET annual_price_try=300 WHERE code='PREMIUM';

CREATE TABLE IF NOT EXISTS membership_order_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES membership_plans(id),
  amount_try INTEGER NOT NULL CHECK(amount_try >= 0),
  payment_method TEXT NOT NULL DEFAULT 'BANK_TRANSFER' CHECK(payment_method IN ('BANK_TRANSFER','IYZICO','PAYTR','APPLE','GOOGLE','MANUAL')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','REJECTED','CANCELLED','FAILED')),
  provider_reference TEXT,
  receipt_note TEXT,
  requested_by TEXT NOT NULL REFERENCES users(id),
  decided_by TEXT REFERENCES users(id),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT,
  membership_id TEXT REFERENCES student_memberships(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_membership_order_one_pending
  ON membership_order_requests(student_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_membership_orders_admin
  ON membership_order_requests(status,requested_at DESC);

CREATE TABLE IF NOT EXISTS membership_monthly_credit_grants (
  membership_id TEXT NOT NULL REFERENCES student_memberships(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  credit_amount INTEGER NOT NULL CHECK(credit_amount > 0),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(membership_id,period_key)
);
CREATE INDEX IF NOT EXISTS idx_membership_credit_grants_student
  ON membership_monthly_credit_grants(student_id,period_key);

-- Existing active memberships were already credited by their original grant.
-- Mark the current period so the new scheduler does not duplicate that credit.
INSERT OR IGNORE INTO membership_monthly_credit_grants(membership_id,period_key,student_id,credit_amount)
SELECT sm.id,strftime('%Y-%m','now'),sm.student_id,p.monthly_live_credits
FROM student_memberships sm JOIN membership_plans p ON p.id=sm.plan_id
WHERE sm.status='ACTIVE' AND p.monthly_live_credits>0;

CREATE TABLE IF NOT EXISTS platform_integrations (
  integration_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('CONTENT','COMMUNICATION','VOICE','PAYMENT','MOBILE','LIVE')),
  enabled INTEGER NOT NULL DEFAULT 0,
  required_secrets_json TEXT NOT NULL DEFAULT '[]',
  last_verified_at TEXT,
  verification_note TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO platform_integrations(integration_key,label,category,required_secrets_json) VALUES
 ('YOUTUBE','YouTube kısa konu videosu','CONTENT','["YOUTUBE_API_KEY"]'),
 ('WHATSAPP','WhatsApp akademik kanal','COMMUNICATION','["WHATSAPP_VERIFY_TOKEN","WHATSAPP_APP_SECRET","WHATSAPP_ACCESS_TOKEN","WHATSAPP_PHONE_NUMBER_ID"]'),
 ('NIBIRU_VOICE','Nibiru ses','VOICE','["GOOGLE_TTS_SERVICE_ACCOUNT_JSON veya OPENAI_TTS_API_KEY"]'),
 ('TELEGRAM','Telegram akademik kanal','COMMUNICATION','["TELEGRAM_BOT_TOKEN","TELEGRAM_WEBHOOK_SECRET"]'),
 ('IYZICO','iyzico ödeme','PAYMENT','["IYZICO_API_KEY","IYZICO_SECRET_KEY"]'),
 ('PAYTR','PayTR ödeme','PAYMENT','["PAYTR_MERCHANT_ID","PAYTR_MERCHANT_KEY","PAYTR_MERCHANT_SALT"]'),
 ('IOS','iOS uygulaması','MOBILE','["APPLE_TEAM_ID","APPLE_BUNDLE_ID","APNS_KEY"]'),
 ('ANDROID','Android uygulaması','MOBILE','["ANDROID_PACKAGE_ID","FCM_SERVICE_ACCOUNT_JSON"]'),
 ('LIVE_MEETING','Canlı görüşme sağlayıcısı','LIVE','["LIVE_MEETING_PROVIDER_KEY"]');

-- Keep later curriculum imports connected to the Learning Graph. The original
-- bridge migration only covered outcomes that existed at migration time.
INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title,parent_id,official,source_url,active)
SELECT 'ln_'||o.id,COALESCE(cv.academic_year,'2026-2027'),'OUTCOME',o.subject_id,o.grade_level,
       COALESCE(NULLIF(o.code,''),'OUTCOME:'||o.id),o.title,NULL,o.official,cv.source_url,o.active
FROM outcomes o LEFT JOIN curriculum_versions cv ON cv.id=o.curriculum_version_id;

CREATE TRIGGER IF NOT EXISTS trg_outcome_learning_node_insert
AFTER INSERT ON outcomes
BEGIN
  INSERT OR IGNORE INTO learning_nodes(id,academic_year,node_type,subject_id,grade_level,code,title,parent_id,official,source_url,active)
  VALUES('ln_'||NEW.id,COALESCE((SELECT academic_year FROM curriculum_versions WHERE id=NEW.curriculum_version_id),'2026-2027'),'OUTCOME',NEW.subject_id,NEW.grade_level,
         COALESCE(NULLIF(NEW.code,''),'OUTCOME:'||NEW.id),NEW.title,NULL,NEW.official,(SELECT source_url FROM curriculum_versions WHERE id=NEW.curriculum_version_id),NEW.active);
END;

CREATE TRIGGER IF NOT EXISTS trg_outcome_learning_node_update
AFTER UPDATE OF subject_id,grade_level,code,title,official,active,curriculum_version_id ON outcomes
BEGIN
  UPDATE learning_nodes SET
    academic_year=COALESCE((SELECT academic_year FROM curriculum_versions WHERE id=NEW.curriculum_version_id),'2026-2027'),
    subject_id=NEW.subject_id,grade_level=NEW.grade_level,code=COALESCE(NULLIF(NEW.code,''),'OUTCOME:'||NEW.id),
    title=NEW.title,official=NEW.official,source_url=(SELECT source_url FROM curriculum_versions WHERE id=NEW.curriculum_version_id),active=NEW.active
  WHERE id='ln_'||NEW.id;
END;

CREATE TABLE IF NOT EXISTS annual_content_plans (
  id TEXT PRIMARY KEY,
  academic_year TEXT NOT NULL,
  grade_level INTEGER NOT NULL CHECK(grade_level BETWEEN 5 AND 12),
  week_count INTEGER NOT NULL DEFAULT 36 CHECK(week_count BETWEEN 1 AND 52),
  questions_per_subject INTEGER NOT NULL DEFAULT 20 CHECK(questions_per_subject BETWEEN 5 AND 100),
  curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','IN_PROGRESS','READY','ARCHIVED')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(academic_year,grade_level,curriculum_version_id)
);

CREATE TABLE IF NOT EXISTS annual_content_plan_slots (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES annual_content_plans(id) ON DELETE CASCADE,
  week_no INTEGER NOT NULL CHECK(week_no BETWEEN 1 AND 52),
  track TEXT NOT NULL CHECK(track IN ('NUMERIC','VERBAL')),
  subject_id TEXT NOT NULL REFERENCES subjects(id),
  outcome_id TEXT NOT NULL REFERENCES outcomes(id),
  required_question_count INTEGER NOT NULL DEFAULT 20,
  approved_question_count INTEGER NOT NULL DEFAULT 0,
  worksheet_id TEXT REFERENCES worksheets(id),
  status TEXT NOT NULL DEFAULT 'CONTENT_REQUIRED' CHECK(status IN ('CONTENT_REQUIRED','QUESTION_READY','PUBLISHED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id,week_no,subject_id)
);
CREATE INDEX IF NOT EXISTS idx_annual_content_slots_status
  ON annual_content_plan_slots(plan_id,status,week_no);

UPDATE platform_features SET stage='STANDARD',enabled_default=1 WHERE feature_key='MEMBERSHIP';
UPDATE educational_game_catalog SET max_grade=12
WHERE game_code IN ('MATH_SPEED','TURKISH_WORD_HUNT','SCIENCE_PLANET','MEMORY_CARDS','SIXTY_SECONDS');
INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('MEMBERSHIP_ORDERING','Gold / Premium Satın Alma ve Aktivasyon','STANDARD',1),
 ('ANNUAL_CONTENT_PLANNER','Tam Yıllık Föy İçerik Planı','STANDARD',1),
 ('PWA_MOBILE','Yüklenebilir Mobil Web Uygulaması','STANDARD',1);
