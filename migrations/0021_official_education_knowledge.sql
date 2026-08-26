PRAGMA foreign_keys = ON;

-- Central provenance registry for official education data. Existing curriculum and target
-- tables remain authoritative for their domains; this layer records where verified data came from.
ALTER TABLE curriculum_import_jobs ADD COLUMN source_kind TEXT;
ALTER TABLE curriculum_versions ADD COLUMN source_kind TEXT;

CREATE TABLE IF NOT EXISTS official_knowledge_sources (
  source_kind TEXT PRIMARY KEY,
  authority TEXT NOT NULL,
  title TEXT NOT NULL,
  base_url TEXT NOT NULL,
  allowed_hosts_json TEXT NOT NULL,
  domains_json TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 1 CHECK(official IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS official_knowledge_events (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL REFERENCES official_knowledge_sources(source_kind),
  authority TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  academic_year TEXT,
  data_year INTEGER,
  source_url TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_published_at TEXT,
  source_verified_at TEXT NOT NULL,
  content_hash TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  verification_method TEXT NOT NULL DEFAULT 'DOMAIN_POLICY_AND_HUMAN_CONFIRMATION',
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_official_knowledge_event_source ON official_knowledge_events(source_kind,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_knowledge_event_entity ON official_knowledge_events(entity_type,entity_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_official_knowledge_event_year ON official_knowledge_events(data_year,academic_year,source_kind);

INSERT OR REPLACE INTO official_knowledge_sources(source_kind,authority,title,base_url,allowed_hosts_json,domains_json,official,active,note) VALUES
('MEB_GENERAL','MEB','Millî Eğitim Bakanlığı','https://www.meb.gov.tr/','["meb.gov.tr","www.meb.gov.tr"]','["CURRICULUM","GUIDANCE","POLICY"]',1,1,'Genel MEB resmî yayınları. Alt alan adları kod seviyesinde ayrıca doğrulanır.'),
('MEB_TYMM','MEB','Türkiye Yüzyılı Maarif Modeli','https://tymm.meb.gov.tr/','["tymm.meb.gov.tr"]','["CURRICULUM","ANNUAL_PLAN","PEDAGOGY"]',1,1,'TYMM öğretim programları, ortak yaklaşım ve yıllık plan kaynakları.'),
('MEB_MUFREDAT','TTKB','TTKB Öğretim Programları','https://mufredat.meb.gov.tr/','["mufredat.meb.gov.tr"]','["CURRICULUM"]',1,1,'Talim ve Terbiye Kurulu Başkanlığı resmî öğretim programları.'),
('TTKB','TTKB','Talim ve Terbiye Kurulu Başkanlığı','https://ttkb.meb.gov.tr/','["ttkb.meb.gov.tr"]','["CURRICULUM","BOARD_DECISION","POLICY"]',1,1,'TTKB kurul kararları ve resmî program açıklamaları.'),
('MEB_ROTA_MAARIF','MEB','MEB Rota Maarif','https://rotamaarif.meb.gov.tr/','["rotamaarif.meb.gov.tr"]','["LGS_TARGET"]',1,1,'LGS okul/hedef verileri için MEB kaynağı.'),
('MEB_EOKUL','MEB','MEB e-Okul','https://e-okul.meb.gov.tr/','["e-okul.meb.gov.tr"]','["LGS_TARGET"]',1,1,'Yerleştirme ve okul verileri için MEB e-Okul kaynağı.'),
('OSYM','ÖSYM','Ölçme, Seçme ve Yerleştirme Merkezi','https://www.osym.gov.tr/','["osym.gov.tr","www.osym.gov.tr"]','["YKS_TARGET","EXAM_GUIDE","OFFICIAL_QUESTION"]',1,1,'ÖSYM kılavuz, sonuç ve resmî sınav yayınları.'),
('YOK_ATLAS','YÖK','YÖK Atlas','https://yokatlas.yok.gov.tr/','["yokatlas.yok.gov.tr"]','["YKS_TARGET"]',1,1,'Üniversite programı, başarı sırası, taban puan ve yayımlandığı ölçüde net profilleri.');
