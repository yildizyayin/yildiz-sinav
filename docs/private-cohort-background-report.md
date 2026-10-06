# Kurum genelinde birleşik raporu arka planda hazırlama

Kodlanmıştır; kurulum ve son aşama doğrulamaları tamamlanmadığı için varsayılan kapalıdır. Mevcut hızlı kurum/rehberlik raporunun 5.000 kaynak kaydı sınırı aynen korunur. Yeni arka plan yolu yalnız Süper Admin ve kendi kurumu için Kurum Yöneticisine açıktır. Rehber sınıfı, branş öğretmeni, öğrenci ve veli bu yeni kurum geneli yolu kullanamaz. Bireysel rubrik CSV kuyruğu ayrıdır.

## Hesaplama sözleşmesi

- Aynı kurum, eğitim yılı, seçili en fazla 20 sınav, kaynaklar, FIRST/LATEST ve tarih seçimi kaydedilir. Tarih aralığı sınav dışındaki kaynakları etkiler. Lisans/enrollment iş modeli değiştirilmez; var olan dönem kayıtları okunur.
- Dönem kaydı ID'siyle keyset tarama: mesaj başına en fazla 20 dönem kaydı. Her bölümde her kaynağın tamamı okunup öğrencinin tekrar politikası uygulanır, ardından toplama eklenir. Kurum toplamı için 5.000 genel kayıt tavanı yoktur.
- Bölüm başına bir kaynak 5.000 kaydı aşarsa o bölüm ilk dönem kaydıyla yeniden hesaplanır. Tek dönem kaydı da bu sınırı aşıyorsa kalıcı olay sayfalarına geçilir; yalnız kayıt sayısı nedeniyle FAILED verilmez. Her kaynakta en fazla 250 olay ve 1 MB tüketilir. FIRST/LATEST seçimi tüm kaynak sayfaları arasında korunur; eksik toplam yayımlanmaz. Uygulama ayrıntıları ve boyut sınırları [cohort-event-pages.md](cohort-event-pages.md) içindedir.
- Sınıf, dönem sınıf düzeyi, ders, eğitim yılı ve sabit müfredat bağlamı ayrı kalır. En fazla toplam 500 ders/oyun grubu, 1.000 kazanım grubu ve 350.000 bayt kalıcı toplama durumu. Aşımda iş başarısız olur; kapsam daraltılır.
- Katılan dönem kayıtları yalnız birbirinden ayrık bölümlerde toplandığından iki kez sayılmaz. Doğruluk doğru/soru olaylarından hesaplanır; öğrenci yüzdelerinin ortalaması değildir. Oyun puanı toplamı ayrı tutulur; ortalama son aşamada puan toplamı/oturum sayısıyla hesaplanır. Kazanım satırları ders toplamı için toplanmaz. Resmî puan, ulusal sıra, beceri veya süreç düzeyi üretilmez.
- İşin başlangıç zamanı `asOf` olarak kaynak zamanlarına ve dönem kaydı oluşturma zamanına uygulanır. Sınavlar bu zamana kadar yayımlanmış geçerli mevcut sürümleriyle okunur; ileri zamanlı sonuç yayını sonradan toplamın içine girmez.

## Karışık sürümden koruma

0083 migration'ı kurum bazlı kaynak revizyonları ve sınav yayınları için ortak revizyon oluşturur. Dönem, sınıf, dönem kaydı, katılım, sınav snapshot, assessment run, föy/oyun kanıtı, assignment ve mini test değişiklikleri revizyonu artırır. Trigger'lar yalnız ilgili kapsamda süresi dolmamış QUEUED/RUNNING/READY işleri varken kurum revizyonu yazar; mini test kurumu assignment üzerinden bulunur. Sınav yayın profili değişikliği mevcut bütün raporları ihtiyatlı biçimde geçersiz kılabilir.

Başlangıç revizyonları ve başlangıç zamanı iş INSERT'inin aynı atomik SQL işlemi içinde yakalanır; ayrı SELECT–INSERT penceresi yoktur; bölüm öncesi, sonrası, atomik ilerleme UPDATE'i ve indirmede aynı kaldığı doğrulanır. Kaynak değişirse `REPORT_SOURCE_CHANGED`; yeni rapor gerekir. Sadece seçili kaynağa dokunulmuş olması şart değildir: aynı kurumun başka kaynak güncellemesi de raporu geçersiz kılabilir. Yoğun yazma sırasında raporun yeniden hazırlanması gerekebilir. Bu, tüm kaynakların kopyalandığı bağımsız bir tarihsel snapshot değildir; kaynak değiştiğinde eski çıktıyı saklama garantisi vermez. Trigger yazma maliyeti ve yoğun kullanım davranışı final performans ölçümüne dahildir.

## Yetki, kalıcılık ve özel çıktı

`GET/POST /api/private-cohort-reports`, aktöre ait `/:id`, `/:id/result`, `/:id/download`.

Sunucu Kurum Yöneticisi için kurum seçimini oturumdaki kurumdan alır. Seçili her sınav için aynı kurum/yılda yayımlanmış mevcut sürümde bir dönem kaydı sonucu bulunması gerekir; başka kurum, yayımlanmamış, eski veya bu kapsamda yalnız misafir sonucu olan sınav sessizce atlanmaz, seçim hatası verilir. İş sahibi, aktörün rol/kurum/öğrenci bağlamı, aktif kurum ve seçim doğrulanır. Worker her bölümde aktörü DB'den yeniden okur. Sahibi dışında kimse işi okuyamaz. Tarayıcı kapanınca aynı hesap ve seçimin son on işi listelenir. Kaybolan POST yanıtı aynı requestId ile tekrar edebilir; benzersiz anahtar ve çakışma sonrası sorgu tek iş oluşturur.

Kaynak satırları ve öğrenci/dönem kimlikleri çıktı dosyasına konulmaz. Yalnız toplamlar özel R2 JSON olarak saklanır. Aynı panelde rapor açılır; CSV indirmesi yetkili endpoint üzerinden üretilir. Public bucket, public URL veya signed download URL yoktur. CSV alanları kaçışlanır ve formül başlangıçları etkisizleştirilir. JSON ve CSV yanıtları no-store'dur. İlerleme ve toplama durumu D1'de tutulur; lease token + eski cursor + kaynak revizyonları atomik UPDATE ile yinelenen mesajları ve eski worker'ı sınırlar.

## Manuel staging kurulumu — henüz yapılmadı

1. Önceki migration'lar, 0083 ve 0084 uygulanmalı; veri üzerine çalıştırılmadı. Trigger ve index etkisi staging kabulünde ölçülmeli.
2. `REPORT_EXPORT_FILES`: public erişimi olmayan ayrı rapor bucket'ı. `report-exports/` için 48 saat lifecycle yedeği; mevcut bireysel rubrik çıktısıyla aynı özel bucket kullanılabilir.
3. Kaynak kuyruk: `anunex-cohort-reports-staging`. Binding `COHORT_REPORT_QUEUE`; düz değişken `COHORT_REPORT_QUEUE_NAME` aynı kaynak kuyruğun tam adı. Ayrı DLQ. DLQ bu worker'a kaynak kuyruk olarak bağlanmaz. Tüketici batch size 1 ve başlangıç concurrency 1; staging ölçümleriyle artırılır. Sonuç/sınav/rubrik kuyruğu tekrar kullanılmaz.
4. Yetkili staging kabulünden sonra `COHORT_REPORTS_ENABLED=true`. Production için ayrı `anunex-cohort-reports-production` kuyruğu, uygun binding ve ayrı ortam kaynakları. Feature flag'in tek başına açılması yeterli değildir.
5. Mevcut staging/production giriş wrapper'ı tam dedicated queue adına göre yönlendirir; diğer queue/fetch/scheduled görevlerini alt worker'a aktarır. Mevcut cron en fazla 10 işi yeniden sevk eder. Takılı lease iki dakika sonra geri alınır; kaynak revizyonu her devamda kontrol edilir.

Aktör başına iki aktif iş ve kayan 24 saatte on yeni iş. İş oluşturulduktan sonra 24 saat indirilebilir. Süresi dolan işten çıktı verilmez; bucket bağlıysa özellik kapalı olsa da cron iki işin beşer nesnesini temizleyerek devam eder. Aggregate, bekleyen öğrenci hesabı, geçici ilk/son çözüm kayıtları ve seçim metadata temizlenir. Geçici D1 seçimleri her tur 250 satır silinir; çok büyük işlerde fiziksel temizleme gecikebilir. R2 lifecycle bu D1 satırlarını temizlemez; D1 temizlik kapasitesi ve gecikmesi ayrıca staging kabulünde ölçülmelidir. Fiziksel temizleme gecikebilir; 48 saat lifecycle orphan dosyalar için yedektir. İptal edilen/başarısız işin durum metadata'sı kalır; öğrenci ham kanıtı saklanmaz.

## Son aşamada doğrulanacaklar

Bu kod üzerinde test/build/typecheck/migration/provider/deploy çalıştırılmadı. Kontroller: hızlı raporla çok bölümlü rapor eşitliği; FIRST/LATEST'in sınırlar arasında bozulmaması; oyun puan toplamı; kazanım etiket çelişkileri; başka aktör ve kurum reddi; rol/kurum değişimi; tüm trigger'ların INSERT/UPDATE/DELETE kapsamı ve aktörsüz source değişiklikleri; iş çalışırken yeniden yayınlama/silme; future publish zamanının geçmesi; duplicate delivery, eski lease ve R2 sonrası crash; cursor fencing; günlük limit/idempotency; 24 saat sınırı, flag off cleanup ve lifecycle; tek çok büyük enrollment'ın kaynak ve seçili-practice sayfalarında hızlı raporla eşit toplam vermesi; çok sayfalı kanıtta katılımcının tekrar sayılmaması; tekrar/tie-break politikası ve cleanup crash davranışı; D1/R2/queue kaynak kullanımı ve 10k/1m senaryoları.
