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
