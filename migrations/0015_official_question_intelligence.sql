PRAGMA foreign_keys = ON;

-- Question-bank difficulty is intentionally presentation-safe and independent from source copyright.
ALTER TABLE question_bank ADD COLUMN difficulty_band TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE question_bank ADD COLUMN difficulty_color TEXT NOT NULL DEFAULT 'GREEN';
ALTER TABLE question_bank ADD COLUMN source_url TEXT;
ALTER TABLE question_bank ADD COLUMN source_authority TEXT;
ALTER TABLE question_bank ADD COLUMN license_code TEXT;

UPDATE question_bank
SET difficulty_band = CASE WHEN difficulty <= 2 THEN 'EASY' WHEN difficulty = 3 THEN 'MEDIUM' ELSE 'HARD' END,
    difficulty_color = CASE WHEN difficulty <= 2 THEN 'BLUE' WHEN difficulty = 3 THEN 'GREEN' ELSE 'RED' END;

CREATE TRIGGER IF NOT EXISTS trg_question_bank_difficulty_insert
AFTER INSERT ON question_bank
BEGIN
  UPDATE question_bank
  SET difficulty_band = CASE WHEN NEW.difficulty <= 2 THEN 'EASY' WHEN NEW.difficulty = 3 THEN 'MEDIUM' ELSE 'HARD' END,
      difficulty_color = CASE WHEN NEW.difficulty <= 2 THEN 'BLUE' WHEN NEW.difficulty = 3 THEN 'GREEN' ELSE 'RED' END
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_question_bank_difficulty_update
AFTER UPDATE OF difficulty ON question_bank
BEGIN
  UPDATE question_bank
  SET difficulty_band = CASE WHEN NEW.difficulty <= 2 THEN 'EASY' WHEN NEW.difficulty = 3 THEN 'MEDIUM' ELSE 'HARD' END,
      difficulty_color = CASE WHEN NEW.difficulty <= 2 THEN 'BLUE' WHEN NEW.difficulty = 3 THEN 'GREEN' ELSE 'RED' END
  WHERE id = NEW.id;
END;

-- Official source registry. Publicly accessible does NOT mean public-domain.
CREATE TABLE IF NOT EXISTS official_question_sources (
  source_key TEXT PRIMARY KEY,
  authority TEXT NOT NULL,
  label TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('OFFICIAL_EXAM_ARCHIVE','QUESTION_RESOURCE','CURRICULUM_RESOURCE')),
  exam_family TEXT,
  index_url TEXT NOT NULL,
  rights_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK(rights_status IN ('RIGHTS_RESERVED','OPEN_LICENSE','PUBLIC_DOMAIN','LICENSED','UNKNOWN')),
  ingestion_policy TEXT NOT NULL DEFAULT 'REFERENCE_ONLY' CHECK(ingestion_policy IN ('REFERENCE_ONLY','METADATA_ONLY','FULL_CONTENT_ALLOWED')),
  active INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_success_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO official_question_sources(source_key,authority,label,source_kind,exam_family,index_url,rights_status,ingestion_policy,notes) VALUES
 ('MEB_LGS_ARCHIVE','MEB','MEB LGS Yayımlanmış Sorular','OFFICIAL_EXAM_ARCHIVE','LGS','https://karabukodm.meb.gov.tr/www/lgs-yayimlanmis-sorular/icerik/213','RIGHTS_RESERVED','METADATA_ONLY','MEB alan adındaki resmî arşiv; soru metni kopyalanmaz, referans ve kazanım istatistiği tutulur.'),
 ('OSYM_YKS_GROUP','OSYM','ÖSYM YKS Resmî Sınav Grubu','OFFICIAL_EXAM_ARCHIVE','YKS','https://www.osym.gov.tr/SinavGrubu/Menu/314','RIGHTS_RESERVED','METADATA_ONLY','ÖSYM soruları teliflidir; soru metni çoğaltılmaz.'),
 ('MEB_OGM_MATERIAL','MEB','OGM Materyal / Soru Bankası','QUESTION_RESOURCE',NULL,'https://ogmmateryal.eba.gov.tr/','RIGHTS_RESERVED','REFERENCE_ONLY','Kaynak keşfi ve yönlendirme için; içerik ancak açık lisans/izin varsa tam havuza alınır.'),
 ('EBA_RESOURCE','MEB','EBA Eğitim İçerikleri','QUESTION_RESOURCE',NULL,'https://www.eba.gov.tr/','RIGHTS_RESERVED','REFERENCE_ONLY','EBA içerikleri otomatik olarak telifsiz kabul edilmez.');

CREATE TABLE IF NOT EXISTS official_exam_archives (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL REFERENCES official_question_sources(source_key) ON DELETE CASCADE,
  authority TEXT NOT NULL,
  exam_family TEXT NOT NULL,
  exam_year INTEGER NOT NULL,
  session_code TEXT NOT NULL DEFAULT 'GENERAL',
  title TEXT NOT NULL,
  landing_url TEXT NOT NULL,
  document_url TEXT,
  rights_status TEXT NOT NULL,
  ingestion_policy TEXT NOT NULL,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(source_key, exam_family, exam_year, session_code, landing_url)
);
CREATE INDEX IF NOT EXISTS idx_official_exam_archive_family_year ON official_exam_archives(exam_family,exam_year,session_code,active);

-- Stores only factual mapping/analytics metadata for protected official questions.
-- The copyrighted question stem/options are deliberately NOT stored here.
CREATE TABLE IF NOT EXISTS official_question_outcome_facts (
  id TEXT PRIMARY KEY,
  archive_id TEXT NOT NULL REFERENCES official_exam_archives(id) ON DELETE CASCADE,
  exam_family TEXT NOT NULL,
  exam_year INTEGER NOT NULL,
  session_code TEXT NOT NULL DEFAULT 'GENERAL',
  subject_id TEXT REFERENCES subjects(id),
  subject_name TEXT,
  question_no INTEGER NOT NULL,
  outcome_id TEXT REFERENCES outcomes(id),
  outcome_code_snapshot TEXT,
  outcome_title_snapshot TEXT,
  difficulty_band TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(difficulty_band IN ('EASY','MEDIUM','HARD')),
  difficulty_color TEXT NOT NULL DEFAULT 'GREEN' CHECK(difficulty_color IN ('BLUE','GREEN','RED')),
  mapping_method TEXT NOT NULL DEFAULT 'MANUAL' CHECK(mapping_method IN ('MANUAL','AI_ASSISTED','OFFICIAL_METADATA','IMPORT')),
  mapping_confidence REAL NOT NULL DEFAULT 0,
  verification_status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(verification_status IN ('REVIEW','VERIFIED','REJECTED')),
  source_page INTEGER,
  source_anchor TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(archive_id,session_code,subject_name,question_no,outcome_code_snapshot)
);
CREATE INDEX IF NOT EXISTS idx_official_fact_outcome ON official_question_outcome_facts(outcome_id,exam_family,exam_year,verification_status);
CREATE INDEX IF NOT EXISTS idx_official_fact_snapshot_code ON official_question_outcome_facts(outcome_code_snapshot,exam_family,exam_year);

-- Maps historic curriculum labels/codes to a current official outcome without rewriting history.
CREATE TABLE IF NOT EXISTS official_outcome_equivalences (
  id TEXT PRIMARY KEY,
  exam_family TEXT NOT NULL,
  from_year INTEGER NOT NULL,
  from_outcome_code TEXT,
  from_outcome_title TEXT NOT NULL,
  current_outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL DEFAULT 'EQUIVALENT' CHECK(relation IN ('SAME','EQUIVALENT','PARTIAL')),
  confidence REAL NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  source_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(exam_family,from_year,from_outcome_code,current_outcome_id)
);
CREATE INDEX IF NOT EXISTS idx_outcome_equiv_current ON official_outcome_equivalences(current_outcome_id,exam_family,from_year,verified);

CREATE TABLE IF NOT EXISTS official_question_sync_runs (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL REFERENCES official_question_sources(source_key),
  sync_kind TEXT NOT NULL CHECK(sync_kind IN ('DISCOVER','REFRESH','MAPPING_IMPORT','STATS_REFRESH')),
  requested_by TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'RUNNING' CHECK(status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  discovered_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  mapped_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  details_json TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_official_sync_runs_source ON official_question_sync_runs(source_key,started_at);

CREATE TABLE IF NOT EXISTS official_outcome_stats_cache (
  current_outcome_id TEXT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
  exam_family TEXT NOT NULL,
  from_year INTEGER NOT NULL,
  to_year INTEGER NOT NULL,
  total_question_count INTEGER NOT NULL DEFAULT 0,
  last_year_question_count INTEGER NOT NULL DEFAULT 0,
  years_appeared INTEGER NOT NULL DEFAULT 0,
  years_analyzed INTEGER NOT NULL DEFAULT 0,
  recency_score REAL NOT NULL DEFAULT 0,
  recurrence_band TEXT NOT NULL DEFAULT 'LOW' CHECK(recurrence_band IN ('LOW','MEDIUM','HIGH')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(current_outcome_id,exam_family,from_year,to_year)
);
