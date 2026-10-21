-- A024 (user approval 21 Oct 2026 19:17): estimated ÖSYM scores from the published test weights.
-- 100 + 400 × Σ weight × (net / question count); a perfect sheet is 500. OBP is not added. Estimates only.
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','WEIGHTED_ESTIMATE',
  '$.estimateWeights',json('{"TYT_TUR":33,"TYT_SOS":17,"TYT_MAT":33,"TYT_FEN":17}'),
  '$.scoreLabel','Tahmini TYT puanı: 100 + 400 × (Türkçe %33, Sosyal %17, Temel Matematik %33, Fen %17 ağırlıklı net oranı). ÖSYM test ağırlıklarından türetilmiş tahmindir; resmî puan değildir.')
WHERE id='srv_osym_tyt_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','WEIGHTED_ESTIMATE',
  '$.estimateWeights',json('{"TYT_TUR":13,"TYT_SOS":7,"TYT_MAT":13,"TYT_FEN":7,"AYT_MAT":30,"AYT_FIZ":10,"AYT_KIM":10,"AYT_BIY":10}'),
  '$.scoreLabel','Tahmini SAY puanı: TYT %40 + AYT Matematik %30, Fizik %10, Kimya %10, Biyoloji %10 ağırlıklı net oranı; OBP eklenmez. Resmî puan değildir.')
WHERE id='srv_osym_yks_say_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','WEIGHTED_ESTIMATE',
  '$.estimateWeights',json('{"TYT_TUR":13,"TYT_SOS":7,"TYT_MAT":13,"TYT_FEN":7,"AYT_MAT":30,"AYT_TDE":18,"AYT_TAR1":7,"AYT_COG1":5}'),
  '$.scoreLabel','Tahmini EA puanı: TYT %40 + AYT Matematik %30, Edebiyat %18, Tarih-1 %7, Coğrafya-1 %5; OBP eklenmez. Resmî puan değildir.')
WHERE id='srv_osym_yks_ea_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','WEIGHTED_ESTIMATE',
  '$.estimateWeights',json('{"TYT_TUR":13,"TYT_SOS":7,"TYT_MAT":13,"TYT_FEN":7,"AYT_TDE":18,"AYT_TAR1":7,"AYT_COG1":5,"AYT_TAR2":8,"AYT_COG2":8,"AYT_FEL":9,"AYT_DIN":5}'),
  '$.scoreLabel','Tahmini SÖZ puanı: TYT %40 + AYT Edebiyat %18, Tarih-1 %7, Coğrafya-1 %5, Tarih-2 %8, Coğrafya-2 %8, Felsefe Grubu %9, Din %5; OBP eklenmez. Resmî puan değildir.')
WHERE id='srv_osym_yks_soz_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','WEIGHTED_ESTIMATE',
  '$.estimateWeights',json('{"TYT_TUR":13,"TYT_SOS":7,"TYT_MAT":13,"TYT_FEN":7,"YDT_DIL":60}'),
  '$.scoreLabel','Tahmini DİL puanı: TYT %40 + YDT %60; OBP eklenmez. Resmî puan değildir.')
WHERE id='srv_osym_yks_dil_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreLabel','Yalnız AYT/YDT oturumu puan türü vermez (TYT gerekir). Net ve başarı yüzdesi hesaplanır; birleşik sınavda YKS SAY/EA/SÖZ/DİL profilini seçin.')
WHERE id IN ('srv_osym_ayt_2627','srv_osym_ydt_2627');
