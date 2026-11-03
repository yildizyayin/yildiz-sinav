-- Owner (3 Nov): every exam produces a net and a puan; 5–7. sınıf exams get an LGS-type 100–500 estimate
-- (Türkçe, Matematik, Fen ×4; Sosyal, Din, Yabancı dil ×1). ANUNEX profile, not an MEB score.
INSERT OR IGNORE INTO scoring_rules(id,code,name,authority,official) VALUES('rule_anunex_lgs_type','ANUNEX_LGS_TYPE','5–7. Sınıf LGS Tipi Puan','ANUNEX',0);
INSERT OR IGNORE INTO scoring_rule_versions(id,rule_id,academic_year,version,verified,source_url,config_json) VALUES
 ('srv_anunex_lgs_type_2627','rule_anunex_lgs_type','2026-2027','v1',1,NULL,'{"profile":"ANUNEX_LGS_TYPE","mode":"LGS_STANDARD","wrongDivisor":3,"scoreScale":{"min":100,"max":500},"standardization":{"enabled":false},"subjectWeights":{"TUR":4,"MAT":4,"FEN":4,"SOS":1,"INK":1,"DIN":1,"YAB":1},"locked":true,"scoreModel":"LGS_ESTIMATE","scoreLabel":"Tahmini puan: 100 + 400 × ağırlıklı net oranı (Türkçe, Matematik, Fen ×4; Sosyal, Din, Yabancı dil ×1). MEB LGS puanı değildir."}');
