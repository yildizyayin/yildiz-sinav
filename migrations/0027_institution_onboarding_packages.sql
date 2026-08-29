PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO platform_features(feature_key,label,stage,enabled_default) VALUES
 ('OPTICAL','Optik Tanımlama ve Okuma','STANDARD',1),
 ('REPORTING','Ölçme ve Akademik Raporlar','STANDARD',1),
 ('NIBIRU_CORE','Nibiru Akademik Asistan','STANDARD',1),
 ('WORKSHEETS','Föy Merkezi','STANDARD',1),
 ('ASSIGNMENTS','Ödev Verme ve Takip','STANDARD',1),
 ('ATTENDANCE','Yoklama ve Devamsızlık','STANDARD',1);

CREATE TABLE IF NOT EXISTS product_packages (
  code TEXT PRIMARY KEY CHECK(code IN ('STANDARD','PREMIUM','CUSTOM')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO product_packages(code,name,description,sort_order) VALUES
 ('STANDARD','Standard','Ölçme-değerlendirme, optik, rapor, Nibiru, föy, ödev, yoklama, kişisel kitap ve Sıfır Hata çekirdeği.',10),
 ('PREMIUM','Premium','Standard paketin tamamı ile gelişmiş Nibiru, öğrenme grafiği, Recovery, Studio, video, akıllı tahta ve kurumsal özellikler.',20),
 ('CUSTOM','Kendi Paketini Oluştur','Kurumun ihtiyaç duyduğu modülleri tek tek seçtiği esnek lisans.',30);

CREATE TABLE IF NOT EXISTS product_package_features (
  package_code TEXT NOT NULL REFERENCES product_packages(code) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES platform_features(feature_key) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(package_code,feature_key)
);

INSERT OR IGNORE INTO product_package_features(package_code,feature_key) VALUES
 ('STANDARD','EXAM_CENTER'),('STANDARD','OPTICAL'),('STANDARD','REPORTING'),('STANDARD','NIBIRU_CORE'),
 ('STANDARD','WORKSHEETS'),('STANDARD','ASSIGNMENTS'),('STANDARD','ATTENDANCE'),('STANDARD','PERSONAL_BOOKS'),
 ('STANDARD','ZERO_ERROR_BOOKLET'),('STANDARD','GAMES');

INSERT OR IGNORE INTO product_package_features(package_code,feature_key)
SELECT 'PREMIUM',feature_key FROM platform_features WHERE feature_key<>'STANDARD_READINESS';

CREATE TABLE IF NOT EXISTS institution_onboarding_profiles (
  institution_id TEXT PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL DEFAULT 'STANDARD' REFERENCES product_packages(code),
  onboarding_status TEXT NOT NULL DEFAULT 'STARTED' CHECK(onboarding_status IN ('STARTED','MANAGER_CREATED','READY','COMPLETED')),
  address TEXT,
  website TEXT,
  logo_url TEXT,
  network_name TEXT,
  annual_consent_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(annual_consent_status IN ('PENDING','APPROVED','DECLINED')),
  annual_consent_by TEXT REFERENCES users(id),
  annual_consent_at TEXT,
  annual_consent_note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_onboarding_package ON institution_onboarding_profiles(package_code,onboarding_status);
