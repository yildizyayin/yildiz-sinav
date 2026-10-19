# Soru havuzu kapanış çalışması — 19 Ekim 2026
## Bu paket
- Yalnız ilk temalardaki 26 çıktı yerine sekiz sınıfın resmî matematik tema sayfalarındaki bütün öğrenme çıktısı başlıkları toplandı: 57 tema, 177 çıktı. Kapsam: 5:23, 6:24, 7:30, 8:23, 9:20, 10:21, 11:15, 12:21.
- Kaynaklar ders/sınıf sayfalarında görülen tema bağlantılarıdır. Tema başlığı, sınıf, çıktı kodu/başlığı, kaynak adresi ve hash kaydı tutulur. Script/style ve uygulama örnekleri çıktı olarak alınmaz. Güncel kaynak yeniden taranıp onaylı katalogla karşılaştırılmadan veritabanına yazılmaz.
- Hedef yıl 2027–2028 ANUNEX planlama kaydıdır. 2028 sınav şartnamesi, diğer branşlar veya süreç bileşenleri bu paketle tamamlanmış sayılmaz. Aktarım her sınıf için atomik ve yeniden çalıştırılabilir; bütün sınıfları kapsayan tek bir işlem değildir.
- Yeni canlı hazırlık API'si yalnız Süper Admin'e açıktır. Seçilen yılın tam matematik sürümünü, düğümlerini ve o yıl/sınıf/branşa bağlı hakları doğrulanmış onaylı platform sorularını sayar. Aynı sorunun birden fazla bağlantısı iki kez sayılmaz. Tam program aktarımı matematiksel/üretim yeterliği sayılmaz.
- Ajan paneli 2027–2028 ile açılır, eski yıllar seçilebilir. Hazırlık tablosu 30 saniyede yenilenir; hatalı/eski yıl yanıtı başarı gibi gösterilmez. Önceki yıl kampanyası yeni yıl panelinden başlatılamaz. Pilot hakkı yetersizse manuel görev kaydı düğmesi bunu açıkça belirtir. Önceki haklar sıfırlanmaz.
## Yerel kontrol
Beş test dosyasında 14 test, TypeScript kontrolü ve betik söz dizimi kontrolleri başarılı.
## Devam eden doğrulama
Staging dağıtımı, sekiz sınıfın aktarımı ve canlı hazırlık API/yıl/yetki kontrollerinin sonucu ayrı kanıt dosyasında kaydedilecek. Production, kampanya aktivasyonu veya soru üretimi bu pakete dahil değil.

## Toplu aktarımdaki iki hata ve düzeltme
İlk deneme 5. sınıfta çıktı/düğüm eşleştirme kontrolünde durdu. Aynı yıldaki iki program sürümü öğrenme düğümünün (yıl/tür/kod) tekillik kuralına çarpıyordu. 0116 göçü mevcut düğüm kimliklerini ve öğrenci bağlantılarını korur, resmî kod ve program sürümünü ayrı alanlarda tutar, yeni çakışmalarda düğümün dahili anahtarını ayrılaştırır ve önceden atlanmış düğümleri onarır.
Kaynak sayfasında bir başlığın birden fazla strong etiketiyle yazıldığı iki örnekte eksik başlık okunuyordu. Okuyucu artık başlığın bütün görünen metnini ilk süreç bileşenine kadar okur; süreç bileşeni başlık gibi alınmaz. Resmî 12. sınıf MAT.12.2.3 başlığının problem çözme ifadesi de olduğu gibi korunur.
Düzeltilmiş kaynak kataloğu V2 olarak yeniden oluşturuldu: 57 tema ve 177 tam başlık. İlk hatalı denemenin yalnız bu görevin oluşturduğu, soru bağlantısı bulunmayan sürümü silinmeden devre dışı bırakılacak ve denetim kaydı tutulacak; önceki kullanıcı sürümlerine dokunulmayacak. Yeni sürüm etiketleri -V2 ile biter.
Altı ilgili test dosyasında 16 test ve TypeScript kontrolü başarılı. Yıl/sürüm çakışması için yeni kayıt ekleme, eski öğrenci kanıtını koruma, güncellemeyi doğru düğüme uygulama ve foreign_key_check doğrulandı.

## Doğrulanmış sonuç
Staging commit: 73be8ee13e9bd8303dfa57f43dfb8bd972310ae0. Ana uygulama ve toplu aktarım/canlı inceleme iş akışları başarılı. 246 test dosyasında 1260 test, TypeScript ve derleme geçti. 0116 göçü uygulandı. FAST/META/NVIDIA bağlantıları ve NVIDIA çıkarımı başarılı.
Sekiz ayrı tam matematik sürümünde 177 çıktı ve 177 ilgili düğüm doğrulandı. İlk tema sürümleri ve önceki yıl kayıtları korundu. Hatalı ilk deneme sürümü doğrulanmış olmaktan çıkarılıp çıktıları pasifleştirildi; soru bağlantısı olmadığı denetlendi ve silinmeden denetim kaydı eklendi.
Canlı hazırlık API'si: 8/8 sınıf, 177/177 çıktı, bağlı onaylı soru 0. Oturumsuz istek 401, bozuk yıl 400, eski yıl ayrımı başarılı. Kontrol öncesi/sonrası görev 32, havuz toplamı 165, eski kampanya 2026–2027/PAUSED korundu. Modelden yeni soru üretimi yapılmadı.
Ajan paneli: https://demo.anunex.com/question-team — Süper Admin. app.anunex.com/production bu paketle güncellenmedi.
## Kapanış sınırı ve kalan işler
Bu paket matematik kaynakları, program sürümü/düğüm kimliği hatası ve ajan paneli hazırlık görünümünü tamamlar. Soru havuzunun tümü tamamlanmış değildir.
1. Diğer branşların resmî programları ve matematik dahil süreç bileşenleri kaynak doğrulaması/aktarımı.
2. 2028 LGS/TYT/AYT kapsam eşleştirmesi ve güncellemelerinin ayrı sürümlenmesi.
3. Mevcut dar 5/6/7 ispat kapsamının dışındaki konularda bağımsız çözüm ve otonom editoryal kalite kabulü.
4. Hedef yıla bağlı gerçek özgün soru üretimi, benzerlik/hak ve çeldirici kontrolleri. Yeni matematik sürümlerine bağlı onaylı soru halen 0; mevcut 165 kayıt bunlara otomatik taşınmadı.
5. Güncel olay olgu/kaynak/izin kayıtları; özgün çizim/harita/geometri; animasyon ve bunlara bağlı video hattı. Mevcut metin slaydı videosu bunları sağlamaz.
6. 500000 soru / 50 gün için günlük 10000 kabul edilmiş soru kapasitesi, sağlayıcı kota/bütçesi ve ölçülmüş kabul oranı. Ücretsiz kapasitenin bu hedefi sağladığı kanıtlanmış değil; ücretli kullanım başlatılmadı.
7. Kontrollü uzun süreli gerçek üretim, yeterlikten sonra hedef-yıl kampanya aktivasyonu ve production dağıtımı. Eski pilot hakkı sıfırlanmadı, yanlış yıl kampanyası hedef yıl ekranından başlatılamaz.
Sınav merkezine geçmeden soru havuzu tamamlandı denmemeli. Kullanıcının bugün tamamlama hedefi kaydedildi; gün sonu tamamlanma garantisi verilmedi. Sonraki çalışma bu açık işleri paketleyerek ilerletmeli, yeni dar mikro kontrollerle aynı kapsamı tekrar tekrar saymamalı.
