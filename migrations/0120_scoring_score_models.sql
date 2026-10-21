-- A024: say what the score actually is. Official MEB/ÖSYM scores need national cohort statistics;
-- practice exams cannot reproduce them. Net rules (wrong divisor, test weights) stay verified.
UPDATE scoring_rule_versions SET config_json=json_set(config_json,
  '$.standardization', json('{"enabled":false}'),
  '$.scoreModel','LGS_ESTIMATE',
  '$.scoreLabel','Tahmini LGS puanı: 100 + 400 × (4·Türkçe + 4·Matematik + 4·Fen + İnkılap + Din + Yabancı dil netleri) / ağırlıklı en yüksek net. MEB standart puanı değildir.')
WHERE id='srv_meb_lgs_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,
  '$.standardization', json('{"enabled":false}'),
  '$.scoreModel','NONE',
  '$.scoreLabel','Net ve başarı yüzdesi hesaplanır; tahmini ÖSYM puanı katsayıları onaylanınca eklenecek. Sıralama nete göredir.')
WHERE id IN ('srv_osym_tyt_2627','srv_osym_ayt_2627','srv_osym_ydt_2627','srv_osym_yks_say_2627','srv_osym_yks_ea_2627','srv_osym_yks_soz_2627','srv_osym_yks_dil_2627');
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','PERCENT','$.scoreLabel','Puan = toplam netin en yüksek nete oranı × 100 (yanlış götürmez).') WHERE id='srv_school_100_2627';
UPDATE scoring_rule_versions SET config_json=json_set(config_json,'$.scoreModel','CUSTOM','$.scoreLabel','Kurumun seçtiği yanlış kuralı ve ölçekle: ölçek × (ağırlıklı net / ağırlıklı en yüksek net).') WHERE id='srv_custom_exam_2627';
