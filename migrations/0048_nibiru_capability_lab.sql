PRAGMA foreign_keys = ON;

-- Nibiru Capability Lab: production-safe, synthetic-only academic evidence.
-- This migration intentionally creates no user account and no login credential.
-- The lab is visible only to SUPER_ADMIN and is never used by tenant queries
-- unless an explicit, server-validated labStudentId is supplied.

INSERT OR IGNORE INTO institutions
  (id,name,code,city,district,status,demo_mode)
VALUES
  ('inst_nibiru_lab','ANUNEX Nibiru Yetenek Laboratuvarı','NIBIRU-LAB','Sentetik','Veri Laboratuvarı','ACTIVE',1);

INSERT OR IGNORE INTO institution_seasons
  (id,institution_id,academic_year,status,started_at)
VALUES
  ('season_nibiru_lab_2627','inst_nibiru_lab','2026-2027','ACTIVE','2026-09-01');

INSERT OR IGNORE INTO classes
  (id,institution_id,season_id,grade_level,section,name,active)
VALUES
  ('class_nibiru_lab_7a','inst_nibiru_lab','season_nibiru_lab_2627',7,'A','Nibiru Laboratuvarı 7/A',1);

INSERT OR IGNORE INTO subjects (id,code,name,category) VALUES
  ('sub_nbl_mat','NBL-MAT','Matematik','NUMERIC'),
  ('sub_nbl_tur','NBL-TUR','Türkçe','VERBAL'),
  ('sub_nbl_fen','NBL-FEN','Fen Bilimleri','NUMERIC');

INSERT OR IGNORE INTO student_entities
  (id,first_name,last_name,normalized_name,status,activated_at)
VALUES
  ('stu_nibiru_lab_001','Deniz','Laboratuvar Öğrencisi','deniz laboratuvar ogrencisi','ACTIVE','2026-09-01');

INSERT OR IGNORE INTO student_enrollments
  (id,student_id,institution_id,season_id,class_id,student_number,grade_level,section,status)
VALUES
  ('enr_nibiru_lab_001','stu_nibiru_lab_001','inst_nibiru_lab','season_nibiru_lab_2627','class_nibiru_lab_7a','NBL-001',7,'A','ACTIVE');

INSERT OR IGNORE INTO curriculum_versions
  (id,academic_year,grade_level,program_version,authority,verified,source_url)
VALUES
  ('cv_nibiru_lab_2627','2026-2027',7,'ANUNEX-NIBIRU-SYNTHETIC','ANUNEX',0,NULL);

INSERT OR IGNORE INTO outcomes
  (id,curriculum_version_id,subject_id,grade_level,code,topic,subtopic,title,official,active)
VALUES
  ('out_nbl_mat_ratio','cv_nibiru_lab_2627','sub_nbl_mat',7,'NBL.MAT.01','Oran ve Orantı','Oran','Oran problemlerinde birim oranı yorumlar',0,1),
  ('out_nbl_mat_integer','cv_nibiru_lab_2627','sub_nbl_mat',7,'NBL.MAT.02','Tam Sayılar','İşlemler','Tam sayılarla işlemleri doğru uygular',0,1),
  ('out_nbl_tur_paragraph','cv_nibiru_lab_2627','sub_nbl_tur',7,'NBL.TUR.01','Anlam','Parçada Anlam','Parçanın ana düşüncesini ve yardımcı düşüncelerini ayırt eder',0,1),
  ('out_nbl_tur_verb','cv_nibiru_lab_2627','sub_nbl_tur',7,'NBL.TUR.02','Dil Bilgisi','Fiiller','Fiillerde zaman ve anlam ilişkisini kurar',0,1),
  ('out_nbl_fen_cell','cv_nibiru_lab_2627','sub_nbl_fen',7,'NBL.FEN.01','Canlılar','Hücre','Hücrenin temel yapılarını ve görevlerini açıklar',0,1),
  ('out_nbl_fen_force','cv_nibiru_lab_2627','sub_nbl_fen',7,'NBL.FEN.02','Fizik','Kuvvet ve Enerji','Kuvvetin hareket ve enerji üzerindeki etkisini açıklar',0,1);

INSERT OR IGNORE INTO learning_nodes
  (id,academic_year,node_type,subject_id,grade_level,code,title,parent_id,official,source_url,active)
VALUES
  ('ln_nbl_mat_ratio','2026-2027','OUTCOME','sub_nbl_mat',7,'NBL.MAT.01','Oran problemlerinde birim oranı yorumlar',NULL,0,NULL,1),
  ('ln_nbl_mat_integer','2026-2027','OUTCOME','sub_nbl_mat',7,'NBL.MAT.02','Tam sayılarla işlemleri doğru uygular',NULL,0,NULL,1),
  ('ln_nbl_tur_paragraph','2026-2027','OUTCOME','sub_nbl_tur',7,'NBL.TUR.01','Ana düşünce ve yardımcı düşünceyi ayırt eder',NULL,0,NULL,1),
  ('ln_nbl_tur_verb','2026-2027','OUTCOME','sub_nbl_tur',7,'NBL.TUR.02','Fiillerde zaman ve anlam ilişkisini kurar',NULL,0,NULL,1),
  ('ln_nbl_fen_cell','2026-2027','OUTCOME','sub_nbl_fen',7,'NBL.FEN.01','Hücrenin temel yapılarını açıklar',NULL,0,NULL,1),
  ('ln_nbl_fen_force','2026-2027','OUTCOME','sub_nbl_fen',7,'NBL.FEN.02','Kuvvetin hareket ve enerji üzerindeki etkisini açıklar',NULL,0,NULL,1);

INSERT OR IGNORE INTO exams
  (id,owner_type,institution_id,academic_year,title,exam_type,grade_level,exam_date,status,sponsor_mode)
VALUES
  ('exam_nibiru_lab_baseline','INSTITUTION','inst_nibiru_lab','2026-2027','Nibiru Laboratuvarı Başlangıç Ölçümü','SYNTHETIC_BASELINE',7,'2026-09-10','CLOSED','ADMIN_SPONSORED'),
  ('exam_nibiru_lab_latest','INSTITUTION','inst_nibiru_lab','2026-2027','Nibiru Laboratuvarı Son Ölçümü','SYNTHETIC_LATEST',7,'2026-09-12','CLOSED','ADMIN_SPONSORED');

INSERT OR IGNORE INTO exam_institutions (id,exam_id,institution_id,enabled) VALUES
  ('ei_nibiru_lab_baseline','exam_nibiru_lab_baseline','inst_nibiru_lab',1),
  ('ei_nibiru_lab_latest','exam_nibiru_lab_latest','inst_nibiru_lab',1);

INSERT OR IGNORE INTO exam_subjects
  (id,exam_id,subject_id,question_count,sort_order,wrong_divisor)
VALUES
  ('es_nbl_b_mat','exam_nibiru_lab_baseline','sub_nbl_mat',10,1,4),
  ('es_nbl_b_tur','exam_nibiru_lab_baseline','sub_nbl_tur',10,2,4),
  ('es_nbl_b_fen','exam_nibiru_lab_baseline','sub_nbl_fen',10,3,4),
  ('es_nbl_l_mat','exam_nibiru_lab_latest','sub_nbl_mat',10,1,4),
  ('es_nbl_l_tur','exam_nibiru_lab_latest','sub_nbl_tur',10,2,4),
  ('es_nbl_l_fen','exam_nibiru_lab_latest','sub_nbl_fen',10,3,4);

INSERT OR IGNORE INTO exam_booklets (id,exam_id,code,active) VALUES
  ('book_nbl_baseline_a','exam_nibiru_lab_baseline','A',1),
  ('book_nbl_latest_a','exam_nibiru_lab_latest','A',1);

INSERT OR IGNORE INTO exam_participants
  (id,exam_id,institution_id,season_id,student_id,student_number_snapshot,name_snapshot,class_snapshot,booklet_code,participant_status)
VALUES
  ('part_nibiru_lab_baseline','exam_nibiru_lab_baseline','inst_nibiru_lab','season_nibiru_lab_2627','stu_nibiru_lab_001','NBL-001','Deniz Laboratuvar Öğrencisi','Nibiru Laboratuvarı 7/A','A','ACTIVE'),
  ('part_nibiru_lab_latest','exam_nibiru_lab_latest','inst_nibiru_lab','season_nibiru_lab_2627','stu_nibiru_lab_001','NBL-001','Deniz Laboratuvar Öğrencisi','Nibiru Laboratuvarı 7/A','A','ACTIVE');

INSERT OR IGNORE INTO exam_results
  (id,participant_id,correct_count,wrong_count,blank_count,net,score,success_percent,institution_rank,grade_rank,class_rank,general_rank)
VALUES
  ('result_nibiru_lab_baseline','part_nibiru_lab_baseline',18,9,3,15.75,52.5,60,1,1,1,1),
  ('result_nibiru_lab_latest','part_nibiru_lab_latest',24,4,2,23,76.67,80,1,1,1,1);

INSERT OR IGNORE INTO subject_results
  (id,participant_id,subject_id,correct_count,wrong_count,blank_count,net,success_percent)
VALUES
  ('sr_nbl_b_mat','part_nibiru_lab_baseline','sub_nbl_mat',5,4,1,4,50),
  ('sr_nbl_b_tur','part_nibiru_lab_baseline','sub_nbl_tur',7,2,1,6.5,70),
  ('sr_nbl_b_fen','part_nibiru_lab_baseline','sub_nbl_fen',6,3,1,5.25,60),
  ('sr_nbl_l_mat','part_nibiru_lab_latest','sub_nbl_mat',6,3,1,5.25,60),
  ('sr_nbl_l_tur','part_nibiru_lab_latest','sub_nbl_tur',9,0,1,9,90),
  ('sr_nbl_l_fen','part_nibiru_lab_latest','sub_nbl_fen',9,1,0,8.75,90);

INSERT OR IGNORE INTO outcome_results
  (id,student_id,exam_id,outcome_id,evidence_count,correct_count,success_rate,mastery_status)
VALUES
  ('or_nbl_b_ratio','stu_nibiru_lab_001','exam_nibiru_lab_baseline','out_nbl_mat_ratio',4,1,0.25,'DEVELOPING'),
  ('or_nbl_l_ratio','stu_nibiru_lab_001','exam_nibiru_lab_latest','out_nbl_mat_ratio',4,2,0.50,'DEVELOPING'),
  ('or_nbl_b_integer','stu_nibiru_lab_001','exam_nibiru_lab_baseline','out_nbl_mat_integer',4,2,0.50,'DEVELOPING'),
  ('or_nbl_l_integer','stu_nibiru_lab_001','exam_nibiru_lab_latest','out_nbl_mat_integer',4,3,0.75,'STRONG'),
  ('or_nbl_b_paragraph','stu_nibiru_lab_001','exam_nibiru_lab_baseline','out_nbl_tur_paragraph',4,2,0.50,'DEVELOPING'),
  ('or_nbl_l_paragraph','stu_nibiru_lab_001','exam_nibiru_lab_latest','out_nbl_tur_paragraph',4,3,0.75,'STRONG'),
  ('or_nbl_b_verb','stu_nibiru_lab_001','exam_nibiru_lab_baseline','out_nbl_tur_verb',4,3,0.75,'STRONG'),
  ('or_nbl_l_verb','stu_nibiru_lab_001','exam_nibiru_lab_latest','out_nbl_tur_verb',4,4,1.00,'STRONG'),
  ('or_nbl_b_cell','stu_nibiru_lab_001','exam_nibiru_lab_baseline','out_nbl_fen_cell',4,1,0.25,'DEVELOPING'),
  ('or_nbl_l_cell','stu_nibiru_lab_001','exam_nibiru_lab_latest','out_nbl_fen_cell',4,2,0.50,'DEVELOPING'),
  ('or_nbl_b_force','stu_nibiru_lab_001','exam_nibiru_lab_baseline','out_nbl_fen_force',4,2,0.50,'DEVELOPING'),
  ('or_nbl_l_force','stu_nibiru_lab_001','exam_nibiru_lab_latest','out_nbl_fen_force',4,3,0.75,'STRONG');

INSERT OR IGNORE INTO worksheets
  (id,academic_year,grade_level,track,sequence_no,title,status,program_code)
VALUES
  ('ws_nibiru_lab_recovery','2026-2027',7,'NUMERIC',90,'Nibiru Laboratuvarı Oran ve Hücre Pekiştirme Föyü','PUBLISHED','SYNTHETIC_LAB');

INSERT OR IGNORE INTO worksheet_subjects (id,worksheet_id,subject_id,question_count) VALUES
  ('wss_nbl_mat','ws_nibiru_lab_recovery','sub_nbl_mat',8),
  ('wss_nbl_fen','ws_nibiru_lab_recovery','sub_nbl_fen',8);

INSERT OR IGNORE INTO worksheet_outcomes (worksheet_id,subject_id,outcome_id) VALUES
  ('ws_nibiru_lab_recovery','sub_nbl_mat','out_nbl_mat_ratio'),
  ('ws_nibiru_lab_recovery','sub_nbl_fen','out_nbl_fen_cell');

INSERT OR IGNORE INTO worksheet_assignments
  (id,worksheet_id,institution_id,class_id,assigned_by,due_date,status)
SELECT
  'wa_nibiru_lab_recovery','ws_nibiru_lab_recovery','inst_nibiru_lab','class_nibiru_lab_7a',u.id,'2026-09-16','ACTIVE'
FROM users u
WHERE u.role='SUPER_ADMIN'
ORDER BY u.created_at
LIMIT 1;

INSERT OR IGNORE INTO question_bank
  (id,owner_type,academic_year,grade_level,subject_id,topic,subtopic,question_type,difficulty,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,origin_kind)
VALUES
  ('qb_nbl_ratio_01','PLATFORM','2026-2027',7,'sub_nbl_mat','Oran','Birim oran','MULTIPLE_CHOICE',2,'2 kalem 10 TL ise 6 kalem kaç TL olur?','["20","25","30","40"]','C','Bir kalemin fiyatı 5 TL olduğundan 6 kalem 30 TL olur.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_ratio_02','PLATFORM','2026-2027',7,'sub_nbl_mat','Oran','Birim oran','MULTIPLE_CHOICE',3,'3 kırmızı topa 2 mavi top düşüyorsa kırmızı:mavi oranı nedir?','["2/3","3/2","3/5","5/3"]','B','Kırmızı sayısı 3, mavi sayısı 2 olduğundan oran 3/2 olur.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_integer_01','PLATFORM','2026-2027',7,'sub_nbl_mat','Tam Sayılar','İşlemler','MULTIPLE_CHOICE',2,'(-8)+12 işleminin sonucu kaçtır?','["-20","-4","4","20"]','C','12-8=4.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_integer_02','PLATFORM','2026-2027',7,'sub_nbl_mat','Tam Sayılar','İşlemler','MULTIPLE_CHOICE',3,'6-(-3) işleminin sonucu kaçtır?','["3","9","-3","-9"]','B','Negatif sayı çıkarmak toplama dönüşür: 6+3=9.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_paragraph_01','PLATFORM','2026-2027',7,'sub_nbl_tur','Anlam','Parçada Anlam','MULTIPLE_CHOICE',2,'Ana düşünce aşağıdakilerden hangisidir?','["Metnin temel iletisi","İlk kelime","Yazarın yaşı","Paragrafın uzunluğu"]','A','Ana düşünce metnin temel iletisidir.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_paragraph_02','PLATFORM','2026-2027',7,'sub_nbl_tur','Anlam','Parçada Anlam','MULTIPLE_CHOICE',3,'Yardımcı düşünceler ne yapar?','["Ana düşünceyi destekler","Konuyu yok eder","Başlığı değiştirir","Sözcükleri sayar"]','A','Yardımcı düşünceler ana düşünceyi açıklar ve destekler.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_verb_01','PLATFORM','2026-2027',7,'sub_nbl_tur','Dil Bilgisi','Fiiller','MULTIPLE_CHOICE',2,'“Yarın geleceğim.” cümlesindeki zaman hangisidir?','["Geçmiş","Şimdiki","Gelecek","Geniş"]','C','-ecek eki gelecek zamanı bildirir.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_verb_02','PLATFORM','2026-2027',7,'sub_nbl_tur','Dil Bilgisi','Fiiller','MULTIPLE_CHOICE',3,'“Her gün okurum.” cümlesindeki zaman hangisidir?','["Geniş","Geçmiş","Gelecek","Şimdiki"]','A','Sürekli yapılan eylem geniş zamanla verilmiştir.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_cell_01','PLATFORM','2026-2027',7,'sub_nbl_fen','Canlılar','Hücre','MULTIPLE_CHOICE',2,'Hücrenin yönetim merkezi hangisidir?','["Çekirdek","Koful","Hücre duvarı","Sitoplazma"]','A','Çekirdek hücresel faaliyetleri yönetir.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_cell_02','PLATFORM','2026-2027',7,'sub_nbl_fen','Canlılar','Hücre','MULTIPLE_CHOICE',3,'Mitoz bölünme sonucunda kaç hücre oluşur?','["1","2","3","4"]','B','Bir ana hücreden iki yavru hücre oluşur.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_force_01','PLATFORM','2026-2027',7,'sub_nbl_fen','Fizik','Kuvvet ve Enerji','MULTIPLE_CHOICE',2,'Hareketi değiştirebilen etki nedir?','["Kuvvet","Hacim","Sıcaklık","Yoğunluk"]','A','Kuvvet hareket durumunu değiştirebilir.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO'),
  ('qb_nbl_force_02','PLATFORM','2026-2027',7,'sub_nbl_fen','Fizik','Kuvvet ve Enerji','MULTIPLE_CHOICE',3,'Hareketli cismin sahip olduğu enerji hangisidir?','["Kinetik","Kimyasal","Nükleer","Işık"]','A','Hareketten kaynaklanan enerji kinetik enerjidir.','ANUNEX Nibiru Yetenek Laboratuvarı','OWNED','APPROVED','DEMO');

INSERT OR IGNORE INTO question_learning_links (question_id,node_id) VALUES
  ('qb_nbl_ratio_01','ln_out_nbl_mat_ratio'),('qb_nbl_ratio_02','ln_out_nbl_mat_ratio'),
  ('qb_nbl_integer_01','ln_out_nbl_mat_integer'),('qb_nbl_integer_02','ln_out_nbl_mat_integer'),
  ('qb_nbl_paragraph_01','ln_out_nbl_tur_paragraph'),('qb_nbl_paragraph_02','ln_out_nbl_tur_paragraph'),
  ('qb_nbl_verb_01','ln_out_nbl_tur_verb'),('qb_nbl_verb_02','ln_out_nbl_tur_verb'),
  ('qb_nbl_cell_01','ln_out_nbl_fen_cell'),('qb_nbl_cell_02','ln_out_nbl_fen_cell'),
  ('qb_nbl_force_01','ln_out_nbl_fen_force'),('qb_nbl_force_02','ln_out_nbl_fen_force');
