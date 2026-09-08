PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS result_network_permission_profiles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  permissions_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS result_network_user_permission_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES result_network_permission_profiles(id),
  scope_type TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(scope_type IN ('ASSIGNED','NATIONAL','CITY','DISTRICT','INSTITUTION')),
  city TEXT,
  district TEXT,
  institution_id TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  assigned_by TEXT NOT NULL REFERENCES users(id),
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO result_network_permission_profiles(id,code,name,description,permissions_json) VALUES
 ('rnp_viewer','VIEWER','Rapor Kullanıcısı','Sonuçları ve raporları görüntüler.','{"view":true,"create":false,"edit":false,"publish":false,"report":true,"export":false}'),
 ('rnp_operator','OPERATOR','Sınav Operatörü','Dosya, optik ve değerlendirme işlemlerini yürütür.','{"view":true,"create":true,"edit":true,"publish":false,"report":true,"export":true}'),
 ('rnp_manager','MANAGER','Kurum Yönetici','Kurum ve kullanıcı operasyonunu yönetir.','{"view":true,"create":true,"edit":true,"publish":true,"report":true,"export":true}'),
 ('rnp_dealer_admin','DEALER_ADMIN','Bayi Yönetici','Bayi kapsamındaki kurum ve sınav operasyonunu yönetir.','{"view":true,"create":true,"edit":true,"publish":true,"report":true,"export":true}');
