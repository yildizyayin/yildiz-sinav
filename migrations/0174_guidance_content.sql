-- Rehberlik R4 — yıllık plan, sınıf etkinlikleri, kaynak kütüphanesi, dijital sağlık (owner, 12 Nov 2026).
-- Activities and resources written by ANUNEX start in REVIEW and inactive; they reach classes, students and parents only
-- after the Super Admin (expert) approves them. The screen & sleep diary is a self-report for conversation, not a diagnosis.
CREATE TABLE IF NOT EXISTS guidance_annual_plans (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  theme TEXT,
  priorities TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(institution_id, academic_year)
);
CREATE TABLE IF NOT EXISTS guidance_plan_entries (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES guidance_annual_plans(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
  kind TEXT NOT NULL CHECK(kind IN ('CLASS_ACTIVITY','PARENT_SEMINAR','TEACHER_INFO','SURVEY','GROUP','CAREER','PREVENTION','OTHER')),
  area TEXT NOT NULL CHECK(area IN ('ACADEMIC','CAREER','SOCIAL_EMOTIONAL')),
  title TEXT NOT NULL,
  grade_min INTEGER, grade_max INTEGER,
  activity_id TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK(status IN ('PLANNED','DONE','CANCELLED')),
  note TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guidance_plan_entries ON guidance_plan_entries(plan_id, month);

CREATE TABLE IF NOT EXISTS guidance_activities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL CHECK(topic IN ('PEER_BULLYING','SCREEN','EXAM_ANXIETY','STUDY','CAREER','FRIENDS','SELF','GREETING','SAFETY','OTHER')),
  area TEXT NOT NULL CHECK(area IN ('ACADEMIC','CAREER','SOCIAL_EMOTIONAL')),
  grade_min INTEGER NOT NULL, grade_max INTEGER NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 40,
  goal TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  materials TEXT,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id),
  review_status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(review_status IN ('REVIEW','APPROVED','REJECTED')),
  review_note TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guidance_activity_assignments (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL REFERENCES guidance_activities(id),
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  teacher_id TEXT REFERENCES users(id),
  assigned_by TEXT NOT NULL REFERENCES users(id),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK(status IN ('ASSIGNED','DONE','CANCELLED')),
  done_at TEXT,
  teacher_note TEXT,
  plan_entry_id TEXT REFERENCES guidance_plan_entries(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guidance_activity_assignments ON guidance_activity_assignments(institution_id, status);

CREATE TABLE IF NOT EXISTS guidance_resources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('STUDENT','PARENT','TEACHER')),
  topic TEXT NOT NULL CHECK(topic IN ('PEER_BULLYING','SCREEN','EXAM_ANXIETY','STUDY','CAREER','FRIENDS','SELF','SLEEP','SAFETY','OTHER')),
  grade_min INTEGER, grade_max INTEGER,
  body TEXT NOT NULL,
  url TEXT,
  institution_id TEXT REFERENCES institutions(id) ON DELETE CASCADE,
  owner_user_id TEXT REFERENCES users(id),
  review_status TEXT NOT NULL DEFAULT 'REVIEW' CHECK(review_status IN ('REVIEW','APPROVED','REJECTED')),
  review_note TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guidance_resource_shares (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES guidance_resources(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  class_id TEXT REFERENCES classes(id) ON DELETE CASCADE,
  shared_by TEXT NOT NULL REFERENCES users(id),
  shared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_id, institution_id, class_id)
);

-- Ekran ve uyku günlüğü: what the student or parent writes for a day (self-report, for conversation only).
CREATE TABLE IF NOT EXISTS guidance_screen_logs (
  student_id TEXT NOT NULL REFERENCES student_entities(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  log_date TEXT NOT NULL,
  entered_by TEXT NOT NULL CHECK(entered_by IN ('STUDENT','PARENT')),
  screen_minutes INTEGER NOT NULL CHECK(screen_minutes BETWEEN 0 AND 1440),
  bedtime TEXT CHECK(bedtime IS NULL OR bedtime GLOB '[0-2][0-9]:[0-5][0-9]'),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(student_id, log_date, entered_by)
);

INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_greet','Selamlaşmanın gücü','GREETING','SOCIAL_EMOTIONAL',1,8,30,'Öğrenciler selamlaşmanın ilişkilere ve sınıf iklimine katkısını fark eder.','["Sınıfa girerken her öğrenciyi adıyla selamlayın; sonra öğrencilere bunun nasıl hissettirdiğini sorun.", "Küçük gruplar farklı selamlaşma biçimleri (göz teması, gülümseme, “günaydın”) üzerine kısa canlandırma yapar.", "Sınıfça “Bu hafta herkes her sabah en az üç arkadaşını adıyla selamlayacak” hedefi konur.", "Hafta sonunda ne değiştiği birlikte konuşulur."]','Yok');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_bully_mid','Zorbalığa seyirci kalma','PEER_BULLYING','SOCIAL_EMOTIONAL',5,8,40,'Öğrenciler zorbalığın türlerini tanır ve tanık olduklarında güvenli biçimde nasıl davranacaklarını öğrenir.','["Zorbalığın tanımı konuşulur: tekrar eden, güç dengesizliği olan, isteyerek incitme. Şakadan farkı örneklerle ayrılır.", "Türler (fiziksel, sözel, dışlama, siber) tahtaya yazılır; öğrenciler isim vermeden örnek düşünür.", "Senaryo kartlarıyla “tanık ne yapabilir?” çalışılır: arkadaşının yanında durmak, ortamdan uzaklaştırmak, bir yetişkine söylemek.", "Okulda kime ve nasıl başvurulacağı (rehber öğretmen, “Rehber öğretmenime yaz”, 147) hatırlatılır."]','Senaryo kartları');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_cyber_hs','Ekranın öbür ucunda biri var','PEER_BULLYING','SOCIAL_EMOTIONAL',9,12,40,'Öğrenciler siber zorbalığı tanır, kanıtı saklama, engelleme ve bildirme adımlarını öğrenir.','["Bir mesajın “şaka” mı “zorbalık” mı olduğunu ayırt eden ölçütler tartışılır.", "Siber zorbalığa uğrayan biri için adımlar: yanıt vermemek, ekran görüntüsü almak, engellemek, platforma bildirmek, bir yetişkine söylemek.", "Öğrenciler sınıf için kısa bir “dijital saygı sözleşmesi” yazar.", "Gerekirse rehber öğretmenle ve 147 ile iletişim yolları hatırlatılır."]','Yok');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_screen_prim','Ekran saatimi ben yönetirim','SCREEN','SOCIAL_EMOTIONAL',3,6,30,'Öğrenciler günlük ekran süresinin farkına varır ve ekran dışı etkinlikler planlar.','["Öğrenciler dünkü günlerini saat saat düşünür; ekranla geçen zamanı renklendirir.", "Ekranın iyi ve zor yanları konuşulur (öğrenme, oyun / uyku, hareketsizlik).", "Her öğrenci ekran dışı üç keyifli etkinlik yazar.", "Bir hafta boyunca “Ekran ve uyku günlüğü” tutmaya davet edilir."]','Boyama kâğıdı');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_sleep','Uyku ve ekran','SCREEN','SOCIAL_EMOTIONAL',6,12,30,'Öğrenciler uyku öncesi ekran kullanımının uykuya etkisini öğrenir ve bir gece rutini oluşturur.','["Öğrencilere iyi uyuduklarında ve uykusuz kaldıklarında derslerinin nasıl geçtiği sorulur.", "Uyku öncesi ekranın uykuya dalmayı nasıl geciktirebileceği konuşulur.", "Her öğrenci kendine uygun bir “ekransız son yarım saat” rutini yazar.", "Bir hafta sonra rutinin nasıl gittiği paylaşılır."]','Yok');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_exam_breath','Sınav heyecanıyla baş etmek','EXAM_ANXIETY','SOCIAL_EMOTIONAL',5,12,40,'Öğrenciler sınav heyecanının doğal olduğunu anlar ve basit sakinleşme yollarını dener.','["Heyecanın bedende nasıl hissedildiği konuşulur; biraz heyecanın dikkati artırdığı vurgulanır.", "Birlikte kutu nefesi denenir: 4 saniye al, 4 tut, 4 ver, 4 bekle.", "“Ya yapamazsam?” gibi düşünceler daha destekleyici cümlelere çevrilir.", "Sınav öncesi gece ve sabah için kısa bir hazırlık listesi hazırlanır."]','Yok');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_study_plan','Haftamı planlıyorum','STUDY','ACADEMIC',5,12,40,'Öğrenciler gerçekçi bir haftalık çalışma planı hazırlamayı ve takip etmeyi öğrenir.','["Öğrenciler bir haftalarını okul, ödev, dinlenme ve aile zamanıyla birlikte çizer.", "Kısa ve düzenli çalışmanın, tek seferde uzun çalışmaktan daha kalıcı olduğu konuşulur (aralıklı tekrar).", "ANUNEX “Bu Haftam” sayfası gösterilir; rehber öğretmenin programı ve kendi hedefini ekleme anlatılır.", "Her öğrenci bu hafta için bir “kendi hedefim” belirler."]','Bu Haftam ekranı');
INSERT OR IGNORE INTO guidance_activities(id,title,topic,area,grade_min,grade_max,duration_min,goal,steps_json,materials) VALUES('gac_career','Meslekleri tanıyorum','CAREER','CAREER',6,10,40,'Öğrenciler ilgi alanları ile meslekler arasında bağ kurar.','["Öğrenciler sevdikleri üç etkinliği yazar.", "Bu etkinliklerin hangi mesleklerde kullanıldığı küçük gruplarda tartışılır.", "Her grup bir mesleği seçip “ne yapar, nerede çalışır, hangi derslerle ilgilidir” sorularını yanıtlar.", "İlgi ve Meslek Keşfi aracı ve rehber öğretmenle kariyer görüşmesi hatırlatılır."]','Meslek kartları');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_p_screen','Çocuğunuz ve ekran','PARENT','SCREEN',NULL,NULL,'Ekran süresini yasaklamak yerine birlikte kurallar koymak daha iyi işler.

• Evde ekransız alanlar ve saatler belirleyin (yemek, yatak odası, yatmadan önceki son yarım saat).
• Çocuğunuzun neyi izlediğini ve hangi oyunları oynadığını merak edin; birlikte oynayın.
• Sizin ekran kullanımınız da örnek olur.
• Ekranın yerine koyulacak keyifli etkinlikler (spor, oyun, kitap, aile zamanı) planlayın.
• Uyku, ders ya da arkadaşlık ilişkileri belirgin biçimde etkileniyorsa okulun rehber öğretmeniyle görüşün.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_p_bully','Çocuğum zorbalığa uğruyor olabilir mi?','PARENT','PEER_BULLYING',NULL,NULL,'Bazı işaretler dikkat gerektirir: okula gitmek istememe, eşyalarının kaybolması ya da zarar görmesi, açıklanamayan yaralar, uyku ve iştah değişiklikleri, arkadaşlarından kopma, telefonu ya da bilgisayarı kullandıktan sonra üzgün görünme.

Ne yapabilirsiniz?
• Sakin kalın ve suçlamadan dinleyin; anlattığı için teşekkür edin.
• “Karşılık ver” demek yerine güvende kalma yollarını birlikte konuşun.
• Siber zorbalıkta mesajların ekran görüntüsünü saklayın.
• Okulun rehber öğretmeni ve idaresiyle hemen iletişime geçin.
• Acil bir tehlike varsa 112’yi, çocukla ilgili destek için Alo 147’yi arayabilirsiniz.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_p_exam','Sınav döneminde çocuğunuza destek','PARENT','EXAM_ANXIETY',NULL,NULL,'• Sonuçtan çok emeği ve düzenli çalışmayı takdir edin.
• Karşılaştırma yapmaktan kaçının; her çocuğun yolu farklıdır.
• Düzenli uyku, beslenme ve kısa molalar için ortam hazırlayın.
• Deneme sonuçlarını birlikte inceleyin: “Neyi öğrendik, neye çalışalım?”
• Kaygı günlük hayatı belirgin biçimde etkiliyorsa rehber öğretmenle görüşün.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_p_sleep','Uyku neden önemli?','PARENT','SLEEP',NULL,NULL,'İyi uyku öğrenme, dikkat ve duygu düzeni için gereklidir. Her gün benzer saatlerde yatıp kalkmak, yatmadan önce ekranı kapatmak ve odayı sakin ve karanlık tutmak uykuyu kolaylaştırır. Uyku sorunu uzun sürerse aile hekimine danışın.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_s_exam','Sınav heyecanını yönetmek','STUDENT','EXAM_ANXIETY',5,12,'Biraz heyecan normaldir, hatta dikkatini artırır.

• Kutu nefesi: 4 saniye nefes al, 4 tut, 4 ver, 4 bekle. Birkaç kez tekrarla.
• “Yapamayacağım” yerine “Hazırlandım, elimden geleni yapacağım” de.
• Sınavda takıldığın soruyu işaretle, sonra dön.
• Sınav öncesi gece iyi uyu; sabah kahvaltı yap.
• Heyecanın seni çok zorluyorsa rehber öğretmenine yaz.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_s_study','Verimli çalışmanın 5 kuralı','STUDENT','STUDY',4,12,'1. Kısa ama her gün çalış: 25 dakika çalış, 5 dakika mola ver.
2. Okuduğunu kendine anlat ya da soru çözerek kendini test et.
3. Konuları aralıklarla tekrar et; bir kez okumak yetmez.
4. Yanlışlarını not et ve hafta sonu tekrar çöz.
5. Telefonu çalışırken başka odada bırak.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_s_cyber','İnternette biri seni rahatsız ederse','STUDENT','PEER_BULLYING',5,12,'• Yanıt verme; tartışmaya girme.
• Mesajların ekran görüntüsünü al.
• Kişiyi engelle ve platforma bildir.
• Mutlaka güvendiğin bir yetişkine anlat: ailene, öğretmenine ya da rehber öğretmenine.
• Kendini tehlikede hissedersen 112’yi ara; Alo 147 Çocuk Destek Hattı da yanında.');
INSERT OR IGNORE INTO guidance_resources(id,title,audience,topic,grade_min,grade_max,body) VALUES('grs_t_bully','Zorbalığa tanık olduğunuzda ilk adımlar','TEACHER','PEER_BULLYING',NULL,NULL,'• Davranışı hemen ve sakin biçimde durdurun; tarafları ayırın.
• Zorbalığa uğrayan öğrencinin güvenliğini sağlayın; herkesin önünde sorgulamayın.
• Olayı okul idaresine ve rehber öğretmene iletin; “Rehbere Bildir” ekranını kullanabilirsiniz.
• Tanık öğrencilere doğru davranışları için teşekkür edin.
• Takipte kalın: birkaç gün sonra öğrenciyle yeniden konuşun.');
