-- ANUNEX internal practice scoring presets.
-- These rules provide versioned net calculations for institutional trials.
-- They are deliberately not marked as official MEB/ÖSYM score conversions.

INSERT OR IGNORE INTO scoring_rules(id,code,name,authority,official) VALUES
  ('rule_anunex_standard_net','ANUNEX_STANDARD_NET','5–12. Sınıf Standart Net','ANUNEX',0),
  ('rule_anunex_lgs_practice','ANUNEX_LGS_PRACTICE','LGS Deneme Neti','ANUNEX',0),
  ('rule_anunex_tyt_practice','ANUNEX_TYT_PRACTICE','TYT Deneme Neti','ANUNEX',0),
  ('rule_anunex_ayt_practice','ANUNEX_AYT_PRACTICE','AYT Deneme Neti','ANUNEX',0),
  ('rule_anunex_yks_composite','ANUNEX_YKS_COMPOSITE','TYT + AYT Bileşik Deneme','ANUNEX',0);

INSERT OR IGNORE INTO scoring_rule_versions(id,rule_id,academic_year,version,verified,source_url,config_json) VALUES
  ('srv_anunex_standard_2627','rule_anunex_standard_net','2026-2027','v1',1,NULL,'{"mode":"net","defaultWrongDivisor":4,"officialConversion":false}'),
  ('srv_anunex_lgs_2627','rule_anunex_lgs_practice','2026-2027','v1',1,NULL,'{"mode":"net","defaultWrongDivisor":3,"sessions":["SOZEL","SAYISAL"],"mergeKey":"institutionId+studentNumber","officialConversion":false}'),
  ('srv_anunex_tyt_2627','rule_anunex_tyt_practice','2026-2027','v1',1,NULL,'{"mode":"net","defaultWrongDivisor":4,"session":"TYT","officialConversion":false}'),
  ('srv_anunex_ayt_2627','rule_anunex_ayt_practice','2026-2027','v1',1,NULL,'{"mode":"net","defaultWrongDivisor":4,"session":"AYT","officialConversion":false}'),
  ('srv_anunex_yks_composite_2627','rule_anunex_yks_composite','2026-2027','v1',1,NULL,'{"mode":"net","defaultWrongDivisor":4,"sessions":["TYT","AYT"],"mergeKey":"institutionId+studentNumber","officialConversion":false}');

-- TYT and AYT use separate subject codes so two uploaded sessions never
-- overwrite one another when they are combined on the same student.
INSERT OR IGNORE INTO subjects(id,code,name,category) VALUES
  ('sub_tyt_tur','TYT_TUR','TYT Türkçe','VERBAL'),
  ('sub_tyt_sos','TYT_SOS','TYT Sosyal Bilimler','VERBAL'),
  ('sub_tyt_mat','TYT_MAT','TYT Temel Matematik','NUMERIC'),
  ('sub_tyt_fen','TYT_FEN','TYT Fen Bilimleri','NUMERIC'),
  ('sub_ayt_mat','AYT_MAT','AYT Matematik','NUMERIC'),
  ('sub_ayt_fiz','AYT_FIZ','AYT Fizik','NUMERIC'),
  ('sub_ayt_kim','AYT_KIM','AYT Kimya','NUMERIC'),
  ('sub_ayt_biy','AYT_BIY','AYT Biyoloji','NUMERIC'),
  ('sub_ayt_tde','AYT_TDE','AYT Türk Dili ve Edebiyatı','VERBAL'),
  ('sub_ayt_tar1','AYT_TAR1','AYT Tarih-1','VERBAL'),
  ('sub_ayt_cog1','AYT_COG1','AYT Coğrafya-1','VERBAL'),
  ('sub_ayt_tar2','AYT_TAR2','AYT Tarih-2','VERBAL'),
  ('sub_ayt_cog2','AYT_COG2','AYT Coğrafya-2','VERBAL'),
  ('sub_ayt_fel','AYT_FEL','AYT Felsefe Grubu','VERBAL'),
  ('sub_ayt_din','AYT_DIN','AYT Din Kültürü','VERBAL');
