-- SYNTHETIC STANDARD ACCEPTANCE FIXTURE ONLY.
-- All questions below are original synthetic demo content and marked OWNED.
PRAGMA foreign_keys = ON;

INSERT OR REPLACE INTO question_bank
(id,owner_type,owner_id,academic_year,grade_level,subject_id,topic,subtopic,question_type,difficulty,stem_text,options_json,correct_answer,solution_text,source_label,copyright_status,review_status,created_by,origin_kind,reviewed_by,reviewed_at)
VALUES
('qb_demo_mat_01','PLATFORM',NULL,'2026-2027',7,'sub_mat','Oran','Oran','MULTIPLE_CHOICE',2,'Bir kutuda 2 kırmızı topa karşı 3 mavi top vardır. Kırmızı:mavi oranı kaçtır?','["2/3","3/2","2/5","3/5"]','A','Kırmızı sayısı 2, mavi sayısı 3 olduğundan oran 2/3 tür.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_mat_02','PLATFORM',NULL,'2026-2027',7,'sub_mat','Oran','Oran','MULTIPLE_CHOICE',3,'4 kalem 20 TL ise aynı birim fiyatla 6 kalem kaç TL olur?','["24","30","32","36"]','B','Birim fiyat 5 TL, 6 kalem 30 TL dir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_mat_03','PLATFORM',NULL,'2026-2027',7,'sub_mat','Oran','Oran','MULTIPLE_CHOICE',3,'Bir sınıfta kızların erkeklere oranı 3/2 dir. 12 kız varsa kaç erkek vardır?','["6","8","9","10"]','B','3 birim 12 ise 1 birim 4, erkek sayısı 2x4=8 dir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_mat_04','PLATFORM',NULL,'2026-2027',7,'sub_mat','Tam Sayılar','Tam Sayılar','MULTIPLE_CHOICE',2,'(-6)+9 işleminin sonucu kaçtır?','["-15","-3","3","15"]','C','9-6=3.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_mat_05','PLATFORM',NULL,'2026-2027',7,'sub_mat','Tam Sayılar','Tam Sayılar','MULTIPLE_CHOICE',3,'5-(-4) işleminin sonucu kaçtır?','["1","9","-1","-9"]','B','Negatif sayı çıkarmak toplama dönüşür: 5+4=9.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_mat_06','PLATFORM',NULL,'2026-2027',7,'sub_mat','Tam Sayılar','Tam Sayılar','MULTIPLE_CHOICE',3,'(-3)x(-7) işleminin sonucu kaçtır?','["-21","-10","10","21"]','D','İki negatif sayının çarpımı pozitiftir: 21.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_tur_01','PLATFORM',NULL,'2026-2027',7,'sub_tur','Anlam','Parçada Anlam','MULTIPLE_CHOICE',2,'Bir metnin ana düşüncesi en çok neyi ifade eder?','["Metnin temel iletisini","Sadece ilk cümleyi","Yazarın adını","Metindeki tüm kelimeleri"]','A','Ana düşünce metnin okuyucuya vermek istediği temel iletidir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_tur_02','PLATFORM',NULL,'2026-2027',7,'sub_tur','Anlam','Parçada Anlam','MULTIPLE_CHOICE',3,'Bir paragrafta yardımcı düşünceler hangi görevi görür?','["Ana düşünceyi destekler","Başlığı siler","Konuyu değiştirir","Cümleleri kısaltır"]','A','Yardımcı düşünceler ana düşünceyi açıklayıp destekler.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_tur_03','PLATFORM',NULL,'2026-2027',7,'sub_tur','Anlam','Parçada Anlam','MULTIPLE_CHOICE',3,'Paragrafta konu belirlenirken öncelikle hangi soruya yanıt aranır?','["Ne anlatılıyor?","Kim yazdı?","Kaç kelime var?","Hangi font kullanıldı?"]','A','Konu, metinde ne anlatıldığı sorusunun yanıtıdır.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_tur_04','PLATFORM',NULL,'2026-2027',7,'sub_tur','Dil Bilgisi','Fiiller','MULTIPLE_CHOICE',2,'“Koşuyor” sözcüğü hangi tür sözcüktür?','["İsim","Fiil","Sıfat","Zamir"]','B','Koşmak bir eylem bildirdiği için fiildir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_tur_05','PLATFORM',NULL,'2026-2027',7,'sub_tur','Dil Bilgisi','Fiiller','MULTIPLE_CHOICE',3,'“Yarın seni arayacağım.” cümlesindeki fiil hangi zamanı bildirir?','["Geçmiş","Şimdiki","Gelecek","Geniş"]','C','-acak/-ecek eki gelecek zamanı bildirir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_tur_06','PLATFORM',NULL,'2026-2027',7,'sub_tur','Dil Bilgisi','Fiiller','MULTIPLE_CHOICE',3,'“Her sabah yürürüm.” cümlesindeki fiil hangi zamanı bildirir?','["Geniş","Geçmiş","Gelecek","Şimdiki"]','A','Düzenli yapılan eylem geniş zaman ekiyle verilmiştir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_fen_01','PLATFORM',NULL,'2026-2027',7,'sub_fen','Canlılar','Hücre ve Bölünmeler','MULTIPLE_CHOICE',2,'Hücrenin yönetim merkezi hangi yapıdır?','["Çekirdek","Hücre zarı","Sitoplazma","Koful"]','A','Çekirdek hücresel faaliyetlerin yönetiminde temel rol oynar.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_fen_02','PLATFORM',NULL,'2026-2027',7,'sub_fen','Canlılar','Hücre ve Bölünmeler','MULTIPLE_CHOICE',3,'Mitoz bölünme sonucunda genel olarak kaç yeni hücre oluşur?','["1","2","3","4"]','B','Bir ana hücreden iki yavru hücre oluşur.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_fen_03','PLATFORM',NULL,'2026-2027',7,'sub_fen','Canlılar','Hücre ve Bölünmeler','MULTIPLE_CHOICE',3,'Bitki hücresini hayvan hücresinden ayıran yapılardan biri hangisidir?','["Hücre duvarı","Çekirdek","Sitoplazma","Hücre zarı"]','A','Hücre duvarı bitki hücresinin ayırt edici yapılarındandır.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_fen_04','PLATFORM',NULL,'2026-2027',7,'sub_fen','Fizik','Kuvvet ve Enerji','MULTIPLE_CHOICE',2,'Bir cismin hareketini değiştirebilen etkiye ne denir?','["Kuvvet","Sıcaklık","Hacim","Yoğunluk"]','A','Kuvvet cismin hareket durumunu değiştirebilir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_fen_05','PLATFORM',NULL,'2026-2027',7,'sub_fen','Fizik','Kuvvet ve Enerji','MULTIPLE_CHOICE',3,'Hareketli bir cismin sahip olduğu enerji hangisidir?','["Kinetik enerji","Kimyasal enerji","Nükleer enerji","Işık enerjisi"]','A','Hareketten kaynaklanan enerji kinetik enerjidir.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP),
('qb_demo_fen_06','PLATFORM',NULL,'2026-2027',7,'sub_fen','Fizik','Kuvvet ve Enerji','MULTIPLE_CHOICE',3,'Yüksekte duran bir cismin konumundan dolayı sahip olduğu enerji hangisidir?','["Potansiyel enerji","Ses enerjisi","Elektrik enerjisi","Isı enerjisi"]','A','Konum/yükseklik nedeniyle çekim potansiyel enerjisi bulunur.','Sentetik Standard Demo','OWNED','APPROVED','usr_super','DEMO','usr_super',CURRENT_TIMESTAMP);

-- Link demo bank questions to the matching learning outcomes when the bridge table is available.
INSERT OR IGNORE INTO question_learning_links(question_id,node_id)
SELECT q.id,n.id FROM question_bank q JOIN learning_nodes n ON n.title=q.subtopic
WHERE q.id LIKE 'qb_demo_%';

-- Add six synthetic question-level answer records to an already evaluated historical exam.
INSERT OR REPLACE INTO exam_questions(id,exam_id,subject_id,question_no,global_no) VALUES
('q_std_hist_mat_1','exam_hist_08','sub_mat',1,1),
('q_std_hist_mat_2','exam_hist_08','sub_mat',2,2),
('q_std_hist_tur_1','exam_hist_08','sub_tur',1,3),
('q_std_hist_tur_2','exam_hist_08','sub_tur',2,4),
('q_std_hist_fen_1','exam_hist_08','sub_fen',1,5),
('q_std_hist_fen_2','exam_hist_08','sub_fen',2,6);
INSERT OR REPLACE INTO answer_keys(id,exam_question_id,booklet_code,correct_answer) VALUES
('ak_std_hist_1','q_std_hist_mat_1','A','A'),('ak_std_hist_2','q_std_hist_mat_2','A','B'),
('ak_std_hist_3','q_std_hist_tur_1','A','A'),('ak_std_hist_4','q_std_hist_tur_2','A','B'),
('ak_std_hist_5','q_std_hist_fen_1','A','A'),('ak_std_hist_6','q_std_hist_fen_2','A','A');
INSERT OR IGNORE INTO question_outcomes(exam_question_id,outcome_id) VALUES
('q_std_hist_mat_1','out_mat_1'),('q_std_hist_mat_2','out_mat_2'),
('q_std_hist_tur_1','out_tur_1'),('q_std_hist_tur_2','out_tur_2'),
('q_std_hist_fen_1','out_fen_1'),('q_std_hist_fen_2','out_fen_2');
INSERT OR REPLACE INTO student_answers(id,participant_id,exam_question_id,answer,status,confidence) VALUES
('ans_std_1','pa_8_1','q_std_hist_mat_1','C','WRONG',1),
('ans_std_2','pa_8_1','q_std_hist_mat_2',NULL,'BLANK',1),
('ans_std_3','pa_8_1','q_std_hist_tur_1','A','CORRECT',1),
('ans_std_4','pa_8_1','q_std_hist_tur_2','D','WRONG',1),
('ans_std_5','pa_8_1','q_std_hist_fen_1','A','CORRECT',1),
('ans_std_6','pa_8_1','q_std_hist_fen_2',NULL,'BLANK',1);
