PRAGMA foreign_keys = ON;

UPDATE nibiru_settings
SET transparency_text='Ben Nibiru, Anunex’in yapay zekâ akademik asistanıyım.',
    updated_at=CURRENT_TIMESTAMP
WHERE id='platform';

-- Verified 2026 release registry. A verified release is not considered imported data;
-- actual rows still have to pass the existing source URL and human confirmation gates.
CREATE TABLE IF NOT EXISTS official_data_releases (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL REFERENCES official_knowledge_sources(source_kind),
  data_domain TEXT NOT NULL CHECK(data_domain IN ('CURRICULUM','LGS_TARGET','YKS_TARGET')),
  academic_year TEXT,
  data_year INTEGER,
  title TEXT NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  published_at TEXT,
  verified_at TEXT NOT NULL,
  import_status TEXT NOT NULL DEFAULT 'SOURCE_VERIFIED'
    CHECK(import_status IN ('SOURCE_VERIFIED','FILE_REQUIRED','IMPORTED','SUPERSEDED')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO official_data_releases
  (id,source_kind,data_domain,academic_year,data_year,title,source_url,published_at,verified_at,import_status,note)
VALUES
  ('rel_tymm_basic_2026','MEB_TYMM','CURRICULUM','2026-2027',2026,'TYMM Temel Eğitim Öğretim Programları','https://tymm.meb.gov.tr/ogretim-programlari/temel-egitim',NULL,'2026-08-26','FILE_REQUIRED','Program metadata and outcomes must be imported from an official export or a reviewed extraction.'),
  ('rel_tymm_secondary_2026','MEB_TYMM','CURRICULUM','2026-2027',2026,'TYMM Ortaöğretim Öğretim Programları','https://tymm.meb.gov.tr/ogretim-programlari',NULL,'2026-08-26','FILE_REQUIRED','Program metadata and outcomes must be imported from an official export or a reviewed extraction.'),
  ('rel_lgs_guide_2026','MEB_GENERAL','LGS_TARGET',NULL,2026,'2026 Ortaöğretime Geçiş Tercih ve Yerleştirme Kılavuzu','https://www.meb.gov.tr/2026-ortaogretime-gecis-tercih-ve-yerlestirme-kilavuzu-yayimlandi/haber/41329/tr',NULL,'2026-08-26','FILE_REQUIRED','School-level placement rows require the official e-Okul export.'),
  ('rel_lgs_eokul_2026','MEB_EOKUL','LGS_TARGET',NULL,2026,'2026 Merkezî Sınavla Öğrenci Alan Okullar Tercih Rehberi','https://e-okul.meb.gov.tr/SinavIslemleri/BasvuruIslemleri/OKSTERCIH/SNV08008.aspx',NULL,'2026-08-26','FILE_REQUIRED','Source verified; structured school rows have not been fabricated.'),
  ('rel_yks_guide_2026','OSYM','YKS_TARGET',NULL,2026,'2026-YKS Yükseköğretim Programları ve Kontenjanları Kılavuzu','https://osym.gov.tr/2026-yuksekogretim-kurumlari-sinavi-yks-yuksekogretim-programlari-ve-kontenjanlari-kilavuzu',NULL,'2026-08-26','FILE_REQUIRED','Program rows require the official guide tables.'),
  ('rel_yks_results_2026','OSYM','YKS_TARGET',NULL,2026,'2026-YKS Yerleştirme Sonuçlarına İlişkin Sayısal Bilgiler','https://www.osym.gov.tr/2026-yks-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler',NULL,'2026-08-26','FILE_REQUIRED','Placement min/max tables are the official target source.' );

UPDATE academic_target_sources
SET base_url='https://www.meb.gov.tr/2026-ortaogretime-gecis-tercih-ve-yerlestirme-kilavuzu-yayimlandi/haber/41329/tr',
    last_verified_at='2026-08-26',import_status=CASE WHEN last_imported_at IS NULL THEN 'READY' ELSE import_status END
WHERE id='src_meb_rota_2026';
UPDATE academic_target_sources
SET base_url='https://e-okul.meb.gov.tr/SinavIslemleri/BasvuruIslemleri/OKSTERCIH/SNV08008.aspx',
    last_verified_at='2026-08-26',import_status=CASE WHEN last_imported_at IS NULL THEN 'READY' ELSE import_status END
WHERE id='src_meb_eokul_2026';
UPDATE academic_target_sources
SET base_url='https://www.osym.gov.tr/2026-yks-yerlestirme-sonuclarina-iliskin-sayisal-bilgiler',
    last_verified_at='2026-08-26',import_status=CASE WHEN last_imported_at IS NULL THEN 'READY' ELSE import_status END
WHERE id='src_osym_2026';

-- Vendor-specific mappings are deliberately blocked until a real anonymized export
-- is fingerprinted and reviewed. Generic CSV parsing remains available separately.
CREATE TABLE IF NOT EXISTS transfer_adapter_profiles (
  source_system TEXT PRIMARY KEY CHECK(source_system IN ('EDESIS','OKULIZYON')),
  status TEXT NOT NULL DEFAULT 'REAL_SAMPLE_REQUIRED'
    CHECK(status IN ('REAL_SAMPLE_REQUIRED','UNDER_REVIEW','VERIFIED','RETIRED')),
  sample_sha256 TEXT,
  sample_file_name TEXT,
  header_fingerprint TEXT,
  mapping_json TEXT,
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO transfer_adapter_profiles(source_system,note) VALUES
  ('EDESIS','Anonimleştirilmiş gerçek Edesis export dosyası olmadan özel alan eşlemesi yayımlanmaz.'),
  ('OKULIZYON','Anonimleştirilmiş gerçek Okulizyon export dosyası olmadan özel alan eşlemesi yayımlanmaz.');

-- Capacity tests never touch student_entities or student_enrollments.
CREATE TABLE IF NOT EXISTS capacity_test_runs (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  target_count INTEGER NOT NULL CHECK(target_count BETWEEN 1 AND 100000),
  chunk_size INTEGER NOT NULL CHECK(chunk_size BETWEEN 10 AND 500),
  total_chunks INTEGER NOT NULL,
  completed_chunks INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_chunks INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('ENQUEUEING','QUEUED','RUNNING','COMPLETED','FAILED')),
  started_by TEXT NOT NULL REFERENCES users(id),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_capacity_runs_status ON capacity_test_runs(status,started_at DESC);

CREATE TABLE IF NOT EXISTS capacity_test_chunks (
  run_id TEXT NOT NULL REFERENCES capacity_test_runs(id) ON DELETE CASCADE,
  chunk_no INTEGER NOT NULL,
  start_no INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','RUNNING','COMPLETED','FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  PRIMARY KEY(run_id,chunk_no)
);

CREATE TABLE IF NOT EXISTS capacity_test_rows (
  run_id TEXT NOT NULL REFERENCES capacity_test_runs(id) ON DELETE CASCADE,
  synthetic_number INTEGER NOT NULL,
  shard INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(run_id,synthetic_number)
);
CREATE INDEX IF NOT EXISTS idx_capacity_rows_shard ON capacity_test_rows(run_id,shard,synthetic_number);
