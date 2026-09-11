PRAGMA foreign_keys = ON;

-- V1 exam card metadata. The exam remains the single canonical record shared by
-- app.anunex.com and sonuc.anunex.com; result publication is an explicit choice.
ALTER TABLE exams ADD COLUMN session_label TEXT;
ALTER TABLE exams ADD COLUMN description TEXT;
ALTER TABLE exams ADD COLUMN result_network_enabled INTEGER NOT NULL DEFAULT 0 CHECK(result_network_enabled IN (0,1));
ALTER TABLE exams ADD COLUMN scoring_override_json TEXT;
ALTER TABLE exams ADD COLUMN scoring_settings_json TEXT;
CREATE INDEX IF NOT EXISTS idx_exams_result_publication ON exams(result_network_enabled,status,academic_year);

-- A subject/test can use a non-1 starting number (for example a section that
-- begins at question 41). The generated question rows remain canonical.
ALTER TABLE exam_subjects ADD COLUMN question_start INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exam_subjects ADD COLUMN question_end INTEGER;
ALTER TABLE exam_subjects ADD COLUMN option_count INTEGER NOT NULL DEFAULT 5 CHECK(option_count IN (4,5));
UPDATE exam_subjects SET question_end=question_start+question_count-1 WHERE question_end IS NULL;

-- Option count and question disposition belong to the question definition, not
-- to the later optical/import operation.
ALTER TABLE exam_questions ADD COLUMN option_count INTEGER NOT NULL DEFAULT 5 CHECK(option_count IN (4,5));
ALTER TABLE exam_questions ADD COLUMN question_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(question_status IN ('ACTIVE','CANCELLED','EXCLUDED'));
ALTER TABLE answer_keys ADD COLUMN option_count INTEGER NOT NULL DEFAULT 5 CHECK(option_count IN (4,5));
ALTER TABLE answer_keys ADD COLUMN accepted_answers TEXT NOT NULL DEFAULT '';
ALTER TABLE answer_keys ADD COLUMN question_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(question_status IN ('ACTIVE','CANCELLED','EXCLUDED'));
UPDATE answer_keys SET accepted_answers=correct_answer WHERE accepted_answers='';

-- Definition templates use stable subject codes so they can be applied in a
-- fresh tenant as well as in an existing database.
INSERT OR IGNORE INTO subjects(id,code,name,category) VALUES
  ('sub_tur','TUR','Türkçe','VERBAL'),
  ('sub_ink','INK','İnkılap Tarihi','VERBAL'),
  ('sub_din','DIN','Din Kültürü','VERBAL'),
  ('sub_yab','YAB','Yabancı Dil','VERBAL'),
  ('sub_mat','MAT','Matematik','NUMERIC'),
  ('sub_fen','FEN','Fen Bilimleri','NUMERIC'),
  ('sub_sos','SOS','Sosyal Bilgiler','VERBAL'),
  ('sub_ydt_dil','YDT_DIL','YDT Yabancı Dil','VERBAL');

-- Locked profile catalog used by the exam-definition screen. The configs are
-- declarative: the evaluation layer can apply cohort statistics/OBP later
-- without changing the exam definition contract.
INSERT OR IGNORE INTO scoring_rules(id,code,name,authority,official) VALUES
  ('rule_meb_lgs','MEB_LGS','LGS — MEB','MEB',1),
  ('rule_osym_tyt','OSYM_TYT','TYT — ÖSYM','ÖSYM',1),
  ('rule_osym_ayt','OSYM_AYT','AYT — ÖSYM','ÖSYM',1),
  ('rule_osym_ydt','OSYM_YDT','YDT — ÖSYM','ÖSYM',1),
  ('rule_osym_yks_say','OSYM_YKS_SAY','YKS SAY — ÖSYM','ÖSYM',1),
  ('rule_osym_yks_ea','OSYM_YKS_EA','YKS EA — ÖSYM','ÖSYM',1),
  ('rule_osym_yks_soz','OSYM_YKS_SOZ','YKS SÖZ — ÖSYM','ÖSYM',1),
  ('rule_osym_yks_dil','OSYM_YKS_DIL','YKS DİL — ÖSYM','ÖSYM',1),
  ('rule_school_100','SCHOOL_100','100''lük Okul Sınavı','ANUNEX',0),
  ('rule_custom_exam','CUSTOM_EXAM','Özel Deneme / Kurum Standardı','ANUNEX',0);

INSERT OR IGNORE INTO scoring_rule_versions(id,rule_id,academic_year,version,verified,source_url,config_json) VALUES
  ('srv_meb_lgs_2627','rule_meb_lgs','2026-2027','v1',1,'https://www.meb.gov.tr/','{"profile":"MEB_LGS","mode":"LGS_STANDARD","wrongDivisor":3,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"MEB_LGS_STANDARD"},"subjectWeights":{"TUR":4,"MAT":4,"FEN":4,"INK":1,"DIN":1,"YAB":1},"locked":true}'),
  ('srv_osym_tyt_2627','rule_osym_tyt','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_TYT","mode":"TYT","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"tytContribution":1,"locked":true}'),
  ('srv_osym_ayt_2627','rule_osym_ayt','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_AYT","mode":"AYT","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"tytContribution":0.4,"requiresTytContribution":true,"locked":true}'),
  ('srv_osym_ydt_2627','rule_osym_ydt','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_YDT","mode":"YDT","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"tytContribution":0.4,"requiresTytContribution":true,"locked":true}'),
  ('srv_osym_yks_say_2627','rule_osym_yks_say','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_YKS_SAY","mode":"YKS_SAY","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"tytContribution":0.4,"requiresObp":true,"locked":true}'),
  ('srv_osym_yks_ea_2627','rule_osym_yks_ea','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_YKS_EA","mode":"YKS_EA","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"tytContribution":0.4,"requiresObp":true,"locked":true}'),
  ('srv_osym_yks_soz_2627','rule_osym_yks_soz','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_YKS_SOZ","mode":"YKS_SOZ","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"tytContribution":0.4,"requiresObp":true,"locked":true}'),
  ('srv_osym_yks_dil_2627','rule_osym_yks_dil','2026-2027','v1',1,'https://www.osym.gov.tr/','{"profile":"OSYM_YKS_DIL","mode":"YKS_DIL","wrongDivisor":4,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":true,"method":"OSYM_COHORT_STANDARD"},"requiresObp":true,"locked":true}'),
  ('srv_school_100_2627','rule_school_100','2026-2027','v1',1,NULL,'{"profile":"SCHOOL_100","mode":"WEIGHTED_PERCENT","wrongDivisor":0,"scoreScale":{"min":0,"max":100},"standardization":{"enabled":false},"locked":true}'),
  ('srv_custom_exam_2627','rule_custom_exam','2026-2027','v1',1,NULL,'{"profile":"CUSTOM_EXAM","mode":"CUSTOM","wrongDivisor":0,"scoreScale":{"min":0,"max":100},"standardization":{"enabled":false},"allowCustomWrongDivisor":true,"allowCustomWeights":true,"locked":false}');
