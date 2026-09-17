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

-- Official archive URL trust is enforced in worker/content-question-backbone-entry.ts before writes.
-- The Worker validates root sources, discovered anchors, sourceUrl and documentUrl; remote D1
-- incompatible trigger blocks are intentionally omitted from this migration.
