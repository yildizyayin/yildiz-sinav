PRAGMA foreign_keys = ON;

-- Extend the shared official source registry to MEB EBA/OGM resources.
INSERT OR REPLACE INTO official_knowledge_sources(source_kind,authority,title,base_url,allowed_hosts_json,domains_json,official,active,note) VALUES
('MEB_EBA','MEB','MEB EBA / OGM Materyal','https://www.eba.gov.tr/','["eba.gov.tr","www.eba.gov.tr","ogmmateryal.eba.gov.tr"]','["QUESTION_RESOURCE","LEARNING_RESOURCE","YKS_PREP"]',1,1,'EBA ve OGM Materyal resmî eğitim kaynakları. Tam soru içeriği ancak hak/lisans doğrulaması sonrası soru havuzuna alınabilir.');

ALTER TABLE official_question_sources ADD COLUMN knowledge_source_kind TEXT REFERENCES official_knowledge_sources(source_kind);
ALTER TABLE official_exam_archives ADD COLUMN source_verified_at TEXT;

UPDATE official_question_sources SET knowledge_source_kind='MEB_GENERAL' WHERE source_key='MEB_LGS_ARCHIVE';
UPDATE official_question_sources SET knowledge_source_kind='OSYM' WHERE source_key='OSYM_YKS_GROUP';
UPDATE official_question_sources SET knowledge_source_kind='MEB_EBA' WHERE source_key IN ('MEB_OGM_MATERIAL','EBA_RESOURCE');

-- Rights/provenance for full question content. Official copyrighted exam questions remain metadata-only
-- and must never enter this table as printable content merely because they are publicly reachable.
CREATE TABLE IF NOT EXISTS question_provenance_records (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
  rights_basis TEXT NOT NULL CHECK(rights_basis IN ('OWNED','WRITTEN_LICENSE','PUBLIC_DOMAIN','USER_PROVIDED','RESTRICTED_REFERENCE')),
  source_authority TEXT,
  source_url TEXT,
  license_reference TEXT,
  evidence_note TEXT,
  evidence_hash TEXT,
  source_verified_at TEXT,
  verification_status TEXT NOT NULL DEFAULT 'DECLARED' CHECK(verification_status IN ('DECLARED','VERIFIED','REJECTED')),
  created_by TEXT REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_question_provenance_question ON question_provenance_records(question_id,verification_status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_provenance_rights ON question_provenance_records(rights_basis,verification_status,created_at DESC);

-- Prevent official exam archive links from escaping the source's declared official domain.
CREATE TRIGGER IF NOT EXISTS trg_official_archive_insert_trust
BEFORE INSERT ON official_exam_archives
BEGIN
  SELECT CASE
    WHEN EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='OSYM')
      AND lower(NEW.landing_url) NOT GLOB 'https://osym.gov.tr/*'
      AND lower(NEW.landing_url) NOT GLOB 'https://*.osym.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOMAIN_BLOCKED')
    WHEN EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_GENERAL')
      AND lower(NEW.landing_url) NOT GLOB 'https://meb.gov.tr/*'
      AND lower(NEW.landing_url) NOT GLOB 'https://*.meb.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOMAIN_BLOCKED')
    WHEN EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_EBA')
      AND lower(NEW.landing_url) NOT GLOB 'https://eba.gov.tr/*'
      AND lower(NEW.landing_url) NOT GLOB 'https://*.eba.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOMAIN_BLOCKED')
  END;
  SELECT CASE
    WHEN NEW.document_url IS NOT NULL AND EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='OSYM')
      AND lower(NEW.document_url) NOT GLOB 'https://osym.gov.tr/*'
      AND lower(NEW.document_url) NOT GLOB 'https://*.osym.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOCUMENT_DOMAIN_BLOCKED')
    WHEN NEW.document_url IS NOT NULL AND EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_GENERAL')
      AND lower(NEW.document_url) NOT GLOB 'https://meb.gov.tr/*'
      AND lower(NEW.document_url) NOT GLOB 'https://*.meb.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOCUMENT_DOMAIN_BLOCKED')
    WHEN NEW.document_url IS NOT NULL AND EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_EBA')
      AND lower(NEW.document_url) NOT GLOB 'https://eba.gov.tr/*'
      AND lower(NEW.document_url) NOT GLOB 'https://*.eba.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOCUMENT_DOMAIN_BLOCKED')
  END;
END;

CREATE TRIGGER IF NOT EXISTS trg_official_archive_update_trust
BEFORE UPDATE OF landing_url,document_url,source_key ON official_exam_archives
BEGIN
  SELECT CASE
    WHEN EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='OSYM')
      AND lower(NEW.landing_url) NOT GLOB 'https://osym.gov.tr/*'
      AND lower(NEW.landing_url) NOT GLOB 'https://*.osym.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOMAIN_BLOCKED')
    WHEN EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_GENERAL')
      AND lower(NEW.landing_url) NOT GLOB 'https://meb.gov.tr/*'
      AND lower(NEW.landing_url) NOT GLOB 'https://*.meb.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOMAIN_BLOCKED')
    WHEN EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_EBA')
      AND lower(NEW.landing_url) NOT GLOB 'https://eba.gov.tr/*'
      AND lower(NEW.landing_url) NOT GLOB 'https://*.eba.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOMAIN_BLOCKED')
  END;
  SELECT CASE
    WHEN NEW.document_url IS NOT NULL AND EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='OSYM')
      AND lower(NEW.document_url) NOT GLOB 'https://osym.gov.tr/*'
      AND lower(NEW.document_url) NOT GLOB 'https://*.osym.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOCUMENT_DOMAIN_BLOCKED')
    WHEN NEW.document_url IS NOT NULL AND EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_GENERAL')
      AND lower(NEW.document_url) NOT GLOB 'https://meb.gov.tr/*'
      AND lower(NEW.document_url) NOT GLOB 'https://*.meb.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOCUMENT_DOMAIN_BLOCKED')
    WHEN NEW.document_url IS NOT NULL AND EXISTS(SELECT 1 FROM official_question_sources s WHERE s.source_key=NEW.source_key AND s.knowledge_source_kind='MEB_EBA')
      AND lower(NEW.document_url) NOT GLOB 'https://eba.gov.tr/*'
      AND lower(NEW.document_url) NOT GLOB 'https://*.eba.gov.tr/*'
    THEN RAISE(ABORT,'OFFICIAL_ARCHIVE_DOCUMENT_DOMAIN_BLOCKED')
  END;
END;
