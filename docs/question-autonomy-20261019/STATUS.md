# Soru havuzu otonom üretim çalışması — 19 Ekim 2026

## Uygulanan kod

- Süper Admin soru kartı, güncel ve aynı sınıf/ders/eğitim yılına ait doğrulanmış kazanımları okur. Doğrulanmış resmî sınav eşleştirmeleri ve açıkça doğrulanmış eski/yeni kazanım eşdeğerlikleri üzerinden son beş takvim yılının kaynak kayıtlarını gösterir. Eksik yıl sıfır sayılamaz. Veri kapsamı tamamlanmış varsayılmaz. Manuel olasılık ve eski sayı iddiaları kanıt sayılmaz; gelecek sınav için yüzde uydurulmaz.
- Önceki sınıf etiketleri görünür fakat kod/sürüm eşleştirmesi yoksa doğrulanmamış olarak kalır. Otomatik resmî ön öğrenme ilişkisi bu sürümde icat edilmez.
- Kuyruk boşalınca, yalnız seçili eğitim yılının doğrulanmış/aktif kazanımları için eksik kapsamdan birer soruluk EDITORIAL_V1 görevleri açılır. Önceden üretilmiş REVIEW/DRAFT/APPROVED adaylar on soruluk mevcut kapsam sınırına dahil edilir. FAILED iş bulunan kazanım incelemesiz tekrar açılmaz.
- Bütçe defteri, yeniden deneme sınırı, insan inceleme kapasitesi, aktif D1 hizmet aktörü ve ajan duraklatma kontrolleri korunur. Rezervasyonlar iade edilmez. Otomatik onay/yayın yok. İnceleme kuyruğu ve ayrılmış yürüyen işler, rezervasyonun atomik SQL koşulunda da sayılır.
- Tablo ve sütun grafik görünümü daha geniş yazı alanları, tam kategori adları, Türkçe sayı biçimi, sıfır taban ve okunabilir ölçekle yenilendi. SVG veri görselleri çözünürlükten bağımsızdır; genel fotoğraf/illüstrasyon üretimi değildir.
- Doğrulanmış editoryal tablo/grafik, çözüm videosuna ayrı ve donmuş sahne olarak aktarılır. Tam eşleşmeyen, dış medya içeren veya desteklenmeyen paket reddedilir. Metin/düzenleme notları öğrenci görseline taşınmaz. Sahneye sığmayan veri kesilmez; render başarısız olur.
- Onaylı ve hakları doğrulanmış kaynaklar için otonom sesli video hazırlığı eklendi. Aynı soru/sürüm için belirlenimli istek kimliği eşzamanlı tekrarları engeller. Ses sağlayıcısı hazır değilse sessizce altyazıya düşmez. Videolar yine insan incelemesine gider.
- Render işleyicisi staging/production için sabit domain ve Worker allowlist'i kullanır. Production'da sentetik video yasak. Ayrı production iş akışı mevcut environment onayını korur; zamanlanmış çalışması repo değişkeni QUESTION_PRODUCTION_VIDEO_AUTOMATION=true koşuluna bağlıdır. Koruma onayı kaldırılmadı.
- Production yapılandırması seçili yılı 2027–2028 yapar ve mevcut sınırlı yürütme/önizleme/pilot/ekip kontrol anahtarlarını açar. AI bağlantısı, hizmet aktörü, gerçek inceleme kapasitesi veya bütçe bu anahtarlarla uydurulmaz; eksikse iş başlamaz.

## Tamamlanmış sayılmayanlar / gerçek engeller

1. Production DB ve etkin ortam anahtarlarının bu sürümle doğrulanması; deployment environment onayı bağlantı tarafından verilemez.
2. Günlük insan inceleme kapasitesi X ve pilot kuyruk sınırının gerçek değerleri. Mevcut bütçe defteri okunmadan yeni kapasite var denemez. 45/50 yalnız tarihli anlık görüntüdür.
3. 2027–2028 production kazanım kapsamının doğrulanması. Staging kayıtları production kanıtı değildir.
4. Resmî önceki sınıf programlarından kaynaklı ön öğrenme eşleştirmelerinin hazırlanması; manuel metinden resmî bağ türetilemez.
5. Resmî sınav soru/kazanım eşleştirmelerinin yeterli kapsamla yüklenmesi. Bu kart mevcut kanıtı okur, eksik geçmişi üretmez. Kalibre edilmiş gelecek sınav olasılık modeli yok.
6. Güncel olaylar için doğrulanmış kaynak, tarih ve kullanım hakkı kayıtlarını toplayan ayrı akış; bugün üreticiye doğrulanmış güncel haber bankası otomatik sağlanmıyor.
7. Branşa özgü geometri, deney düzeneği, harita ve özgün illüstrasyon üretimi. Bu sürüm yalnız veri tablosu/grafiğini geliştirir; en üst yayınevi görsel kalitesi kanıtlandı denemez.
8. Gerçek modelden bu sürümle başarılı editoryal soru kaydı ve gerçek sesli production video kanıtı. Yerel sentetik render öğrenci içeriği veya bu kanıt yerine geçmez.
9. 500.000 soru için bütçe, sağlayıcı kapasitesi ve insan inceleme kapasitesi. Mevcut on-soru/kazanım kapsam kuralı ve pilot kotası toplu 500.000 üretim taahhüdü değildir.

## Kontrol sırası

1. İnceleme/test → app dağıtımı → production ortam onayı → salt okunur hazırlık kontrolü.
2. Seçili yılın gerçek kazanım kapsamı, kalan rezervasyon, ayrı hizmet aktörü, insan inceleme kapasitesi ve bağımsız doğrulayıcı hazırsa tek gerçek üretim.
3. Soru incelemesi ve hak kontrolü → video hazırlığı → production render → insan video incelemesi → soru yeniden incelemesi.
4. Kaynaklı ön öğrenmeler, geçmiş sınav kapsamı ve güncel olay/illüstrasyon hattı ayrı doğrulanır. Eksik alanlar tahminle doldurulmaz.

## Bağlam kaydı

Bu iş sınav aktifleştirme PR #261'i kapsamaz. Önceki kalite düzeltmesi PR #262 ile birlikte değerlendirilir. Başarısız bir unrelated PR sonuç sağlayıcı probunda Cloudflare Queue sınırı 100 hatası görüldü; başka kaynaklar silinmedi, kontrol atlanmadı.

## Yerel doğrulama sonucu

211 test dosyası / 1084 test geçti; TypeScript, Vite derlemesi, JS/Python sözdizimi ve diff boşluk kontrolü başarılı. Sentetik tablo ve grafik sahneleriyle yerelde 1280×720, 10 saniyelik MP4 üretildi ve metadata doğrulandı; bu sesli gerçek öğrenci videosu değildir. Sonsuz grafik değeri reddedildi. Gerçek sağlayıcı çağrısı yapılmadı; pilot rezervasyonu tüketilmedi. Yeni kodun etkin production koşulları henüz gözlenmedi.
