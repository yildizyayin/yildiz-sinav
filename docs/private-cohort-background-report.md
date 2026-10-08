# Kurum genelinde birleşik raporu arka planda hazırlama

Kodlanmıştır; kurulum ve son aşama doğrulamaları tamamlanmadığı için varsayılan kapalıdır. Mevcut hızlı kurum/rehberlik raporunun 5.000 kaynak kaydı sınırı aynen korunur. Kurum geneli arka plan yolu yalnız Süper Admin ve kendi kurumu için Kurum Yöneticisine açıktır. GUIDANCE_TEACHER aynı altyapıyı yalnız atanmış etkin sınıfı ve etkin dönemi için kullanır; kurum geneline erişemez. Branş öğretmeni, öğrenci ve veli bu yolu kullanamaz. Bireysel rubrik CSV kuyruğu ayrıdır.

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

Sunucu Kurum Yöneticisi için kurum seçimini oturumdaki kurumdan alır. Seçili her sınav için aynı kurum/yılda yayımlanmış mevcut sürümde bir dönem kaydı sonucu bulunması gerekir; başka kurum, yayımlanmamış, eski veya bu kapsamda yalnız misafir sonucu olan sınav sessizce atlanmaz, seçim hatası verilir. Rehber için classId zorunludur; kurum oturumdan alınır. Etkin sınıf, etkin dönem, seçili yıl ve kurum/dönem/sınıfı eşleşen etkin GUIDANCE ataması DB üzerinden doğrulanır. İlk istekte dönem sunucuda belirlenip seçim JSON'una sabitlenir; sonradan sınıfın dönemi değişirse kapsam sessizce taşınmaz. Kurum geneli rolleri classId/seasonId göndererek farklı kapsam açamaz. İş sahibi, aktörün rol/kurum/öğrenci bağlamı, aktif kurum ve seçim doğrulanır. Worker her bölümde aktörü DB'den yeniden okur. Rehber sınıf/dönem/atama kontrolü hızlı enrollment taraması, kaynak sayfaları, geçici seçim indirgeme ve son indirmede tekrar yapılır. Yalnız ACTIVE enrollment'lar ve aynı sınıf/dönem seçili EXAM kanıtı kullanılır. Arşiv/yıl geçmişine yeni erişim verilmez. Sahibi dışında kimse işi okuyamaz. Tarayıcı kapanınca aynı hesap ve seçimin son on işi listelenir. Kaybolan POST yanıtı aynı requestId ile tekrar edebilir; benzersiz anahtar ve çakışma sonrası sorgu tek iş oluşturur.

Kaynak satırları ve öğrenci/dönem kimlikleri çıktı dosyasına konulmaz. Yalnız toplamlar özel R2 JSON olarak saklanır. Aynı panelde rapor açılır; CSV indirmesi yetkili endpoint üzerinden üretilir. Public bucket, public URL veya signed download URL yoktur. CSV alanları kaçışlanır ve formül başlangıçları etkisizleştirilir. JSON ve CSV yanıtları no-store'dur. İlerleme ve toplama durumu D1'de tutulur; lease token + eski cursor + kaynak revizyonları atomik UPDATE ile yinelenen mesajları ve eski worker'ı sınırlar.

## Manuel staging kurulumu — henüz yapılmadı

1. Önceki migration'lar, 0083, 0084 ve 0085 uygulanmalı; veri üzerine çalıştırılmadı. Trigger ve index etkisi staging kabulünde ölçülmeli.
2. `REPORT_EXPORT_FILES`: public erişimi olmayan ayrı rapor bucket'ı. `report-exports/` için 48 saat lifecycle yedeği; mevcut bireysel rubrik çıktısıyla aynı özel bucket kullanılabilir.
3. Kaynak kuyruk: `anunex-cohort-reports-staging`. Binding `COHORT_REPORT_QUEUE`; düz değişken `COHORT_REPORT_QUEUE_NAME` aynı kaynak kuyruğun tam adı. Ayrı DLQ. DLQ bu worker'a kaynak kuyruk olarak bağlanmaz. Tüketici batch size 1 ve başlangıç concurrency 1; staging ölçümleriyle artırılır. Sonuç/sınav/rubrik kuyruğu tekrar kullanılmaz.
4. Yetkili staging kabulünden sonra `COHORT_REPORTS_ENABLED=true`. Production için ayrı `anunex-cohort-reports-production` kuyruğu, uygun binding ve ayrı ortam kaynakları. Feature flag'in tek başına açılması yeterli değildir.
5. Mevcut staging/production giriş wrapper'ı tam dedicated queue adına göre yönlendirir; diğer queue/fetch/scheduled görevlerini alt worker'a aktarır. Mevcut cron en fazla 10 işi yeniden sevk eder. Takılı lease iki dakika sonra geri alınır; kaynak revizyonu her devamda kontrol edilir.

Aktör başına iki aktif iş ve kayan 24 saatte on yeni iş. İş oluşturulduktan sonra 24 saat indirilebilir. Süresi dolan işten çıktı verilmez; bucket bağlıysa özellik kapalı olsa da cron iki işin beşer nesnesini temizleyerek devam eder. Aggregate, bekleyen öğrenci hesabı, geçici ilk/son çözüm kayıtları ve seçim metadata temizlenir. Geçici D1 seçimleri her tur 250 satır silinir; çok büyük işlerde fiziksel temizleme gecikebilir. R2 lifecycle bu D1 satırlarını temizlemez; D1 temizlik kapasitesi ve gecikmesi ayrıca staging kabulünde ölçülmelidir. Fiziksel temizleme gecikebilir; 48 saat lifecycle orphan dosyalar için yedektir. İptal edilen/başarısız işin durum metadata'sı kalır; öğrenci ham kanıtı saklanmaz.

## Son aşamada doğrulanacaklar

Yerel genel test/typecheck/build ve migration kontrolleri çalıştırıldı; aşağıdaki senaryoların tamamı henüz doğrulanmış değildir. Provider/staging/deploy kontrolleri çalıştırılmadı. Kontroller: hızlı raporla çok bölümlü rapor eşitliği; FIRST/LATEST'in sınırlar arasında bozulmaması; oyun puan toplamı; kazanım etiket çelişkileri; başka aktör ve kurum reddi; rol/kurum değişimi; tüm trigger'ların INSERT/UPDATE/DELETE kapsamı ve aktörsüz source değişiklikleri; iş çalışırken yeniden yayınlama/silme; future publish zamanının geçmesi; duplicate delivery, eski lease ve R2 sonrası crash; cursor fencing; günlük limit/idempotency; 24 saat sınırı, flag off cleanup ve lifecycle; tek çok büyük enrollment'ın kaynak ve seçili-practice sayfalarında hızlı raporla eşit toplam vermesi; çok sayfalı kanıtta katılımcının tekrar sayılmaması; tekrar/tie-break politikası ve cleanup crash davranışı; D1/R2/queue kaynak kullanımı ve 10k/1m senaryoları.

## Rehber sınıfı ve izin revizyonu

0085, etkin veya hazır işler varken GUIDANCE atamalarının INSERT/UPDATE/DELETE işlemleri için etkilenen kurumun kaynak revizyonunu artırır. Atama kaldırılıp tekrar eklenirse eski hazır çıktı da geçersiz olur; yeni rapor gerekir. Bu ihtiyatlı kurum revizyonu aynı kurumdaki kurum yöneticisi raporlarını da geçersiz kılabilir. Sınıf/dönem/enrollment değişiklikleri mevcut 0083 trigger'larıyla korunur. Scope helper worker/lib/cohort-report-class-scope.ts içinde; eksik class scope hiçbir zaman rehbere kurum geneli yetki vermez.

Son aşama testlerine ek: başka rehber sınıfı veya branş assignment'ı ile 403; classId olmadan kurum raporu bypass; sahte kurum ve seasonId; eski yıl/pasif dönem/pasif sınıf; seçili sınavın başka sınıfta sonucu olması; worker sürerken assignment revoke veya aynı classId'nin season değişimi; READY sonrası revoke–regrant; uzun geçmişin READ/PICKS/CLEAN fazında scope değişimi; rol değişikliği, aynı hesaptaki farklı sınıf seçimine eski async yanıt uygulanmaması; önceki kurum raporu JSON seçimlerinin listelenmeye devam etmesi. Bu senaryoların bir bölümü aşağıdaki yerel kabul testlerinde doğrulandı; tam rol/faz matrisi ve staging kabulü hâlâ bekliyor.

## Yerel kabul kanıtı — 6 Ekim 2026

`tests/private-cohort-acceptance.test.ts`: gerçek migration dosyalarıyla boş SQLite üzerinde beş entegrasyon testi geçti. D1 adaptörü ve bellek içi R2/Queue taklitleri kullanıldı; bu canlı Cloudflare testi değildir. Kapsam: atanmış sınıf/dönem sabitleme ve kapsam reddi; başka iş sahibi reddi; atama revoke–regrant revizyonuyla eski hazır çıktının reddi; yasak roller ve özellik kapalı davranış; canlı lease sırasında duplicate delivery; süresi geçmiş çıktı için anlık 410; özellik kapalıyken 7 nesne ve 501 geçici seçimin üç temizlik turunda bitmesi; nesne okunurken kaynak değişince çıktı verilmemesi.

Tam yerel regresyon: 140 dosya / 645 test geçti. Önceki kod ağacında typecheck/build, yerel migrationlar 0086'ya kadar ve demo/gizlilik seedlerinin iki tur yüklenmesi geçti; bu tur üretim kodu değişmedi. Rapor hesaplama eşitliği, FIRST/LATEST olay sayfaları, lease crash/takeover, atomik cursor commit ve kaynak trigger'larının tam matrisi ayrıca test edilmelidir. Fiziksel temizleme kapasitesi ve gerçek R2/Queue davranışı staging ölçümü ister.

## Uzun geçmiş ve iş kesintisi kabulü — 6 Ekim 2026

Aynı entegrasyon dosyasına beş senaryo daha eklendi. FIRST ve LATEST için ayrı ayrı, aynı soruya ait 5.001 sabit çözüm kaydı gerçek consumer üzerinden işlendi. Hızlı yolun 5.000 sınırı aşıldı; READ/PICKS/CLEAN fazları ve 20'den fazla devam mesajı gözlendi. Aynı zaman damgasındaki run ID sırası ilk yanlış/son doğru çözümü belirledi; sonuç bir öğrenci, bir soru olayı ve 5.000 tekrar oldu. Geçici seçimler tamamlanınca silindi; olay sayısı 5.001 olarak korundu.

Dosya yazımı kesintisi lease'i serbest bırakıp retry yaptı; sonraki teslim tek READY çıktı üretti ve duplicate teslim sonucu artırmadı. R2 put sırasında kaynak revizyonu değişince atomik ilerleme commit edilmedi, iş FAILED oldu ve yayımlanmamış nesne silindi. Eski worker yükleme sırasında yeni lease/token/cursor/step ile karşılaşınca yeni iş durumunu değiştiremedi ve yalnız kendi nesnesini temizledi.

Bunlar yerel SQLite ve servis taklitleriyle doğrulandı. Gerçek Queue teslim zamanı, D1 trigger-inclusive metadata, R2 hata davranışı, farklı tekrar anahtarları/Unicode tie-break ve çok kaynaklı rapor eşitliği için ek kabul gerekir. Bu tur üretim kodu değiştirilmedi.

## Rehberlik yetkisi değişiklikleri — yerel kabul

94 migration üzerinde dört ek kabul kontrolü geçti: GUIDANCE görevinin INSERT/UPDATE/DELETE işlemleri rapor neslini artırır; yalnız SUBJECT görevi değişiklikleri bu rehberlik tetikleyicisini çalıştırmaz; rehberlik görevi başka kuruma taşınıp geri getirildiğinde iki kurumun nesli de artar; QUEUED/RUNNING/READY raporlar korunurken süresi dolmuş tek rapor için nesil artışı durur. Böylece yetkinin kaldırılıp tekrar verilmesi eski raporu yeniden geçerli yapmaz.

Bu kontroller rehberlik yetkisi tetikleyici matrisi içindir. Tüm sınav/föy/oyun/kazanım kaynaklarının revision matrisi ve çok kaynaklı sayfalama eşdeğerliği henüz tamamlanmadı. SQLite kabulü Cloudflare Queue/R2/D1 staging kanıtı değildir.

## Kaynak değişikliği ve birleşik sayfalama kabulü — 2026-10-07

Sekiz kaynak için INSERT/UPDATE/DELETE kontrolleri tamamlandı: sınav sonuç snapshotı, sınav katılımcısı, soru pratiği run kaydı, dondurulmuş föy kanıtı, dondurulmuş oyun kanıtı, ödev, koç mini testi ve sınav yayın profili. Her değişim beklenen kurum neslini (yayın profilinde global nesli) tam bir artırıyor; hazırlanmış rapor indirmesi 409 dönüyor ve özel nesneye erişmiyor. Tüm işler sona erdiğinde yeniden ekleme nesli artırmıyor. Foreign key kontrolleri temiz.

FIRST/LATEST birleşik senaryolarında 5.001 soru pratiği kaydı, bir föy sorusu ve bir oyun oturumu gerçek sayfalı consumer yolundan geçiyor. 4.748 tekrar eleniyor, 253 soru pratiği olayı + 1 föy sorusu sayılıyor. 252 ayrı soru ve Unicode run kimlikleriyle eşit zamanlı bir tekrar çifti, senkron kanonik örnek ile aynı doğruluk toplamını üretiyor. Oyun oturumu/70 puan akademik soru doğruluğundan ayrı tutuluyor; resmî puan ve ulusal sıra üretilmiyor. Testler 20'den fazla devam çağrısını doğruluyor.

Bu aşamada üretim kodu veya migration değişmedi. Kurumlar arası kaynak taşıma, enrollment/season/class CRUD matrisinin tamamı, tüm beş kaynak birlikte (sınav/mini test dahil), çoklu öğrenci ve kurum, sağlayıcı staging ve gerçek yük kabulü ayrıca açık. SQLite/D1-adapter testi gerçek Cloudflare Queue/R2 kabulü değildir.

## Kurum/dönem sınırı ve beş kaynak kabulü — 2026-10-07

14 ek kontrol: enrollment, season ve class tablolarının INSERT/UPDATE/DELETE işlemleri hazır raporu 409 ile geçersizleştirir ve R2 okumasını engeller. On kayıt türünde kurum metadatası başka kuruma taşınıp geri getirildiğinde eski ve yeni kurumun nesli tam birer kez artar; yetkinin/verinin geri gelmesi eski raporu tekrar geçerli yapmaz. Mini testte kurum bağlantısı assignment değişikliği üzerinden sınanır. Bunlar doğrudan SQL ile enjekte edilen metadata değişiklikleridir; öğrenci veya veri transferi için yetkili bir kullanıcı akışı oluşturmaz.

Beş kaynak birlikte kontrol edildi: EXAM, QUESTION_BANK, MINI_TEST, FOY, MINI_GAME. Aynı sınıfta iki katılımcı ve bir katılmayan öğrenci, başka kurumda beş kaynağın her birinde pozitif sonuçlu bir öğrenci vardır. Kurum/sınıf raporu yalnız iki katılımcının 9 akademik olayını sayar: 5 doğru, 3 yanlış, 1 boş, %55,56. Katılmayan öğrenci sıfır puanla ortalamaya girmez; başka kurumun beş kaynaktaki verisi dışarıda kalır. Sınıf kısıtı olmayan kurum yönetimi sorgusunda da her kaynağın satır sayısı ve toplamları ayrıca doğrulanır. Bir oyun oturumu/70 puan ayrı raporlanır. Senkron ve arka plan raporlarının açık toplamları eşleşir. Mini fixture ilk çalışmada LEGACY varsayılanı nedeniyle bilinçli filtreye takıldı; NEW bağlamı tamamlanarak kabul senaryosu düzeltildi.

Beş kaynaklı bu senaryo hızlı arka plan yoludur; önceki 5.001 kayıt senaryosu QUESTION_BANK/FOY/MINI_GAME sayfalamasını kapsar. Beş kaynak birlikte sayfalama, çok sınıfla genişletilmiş kapsam ve frozen rubric dağılımları ayrıca bekler. Üretim kodu ve migration değişmedi; gerçek provider staging/yük ölçümü yapılmadı.

## Beş kaynak birlikte sayfalama — 2026-10-07

Beş kaynaklı önceki senaryo hızlı ve sayfalı yollarla ayrı ayrı doğrulandı. Soru pratiğinde aynı öğrencinin aynı sorusuna 5.001 ilave tekrar eklenir; kurumda toplam5.003 ham kayıt normal senkron sınırını aşar. Consumer gerçek READ/PICKS/CLEAN fazlarından 20'den fazla devam çağrısıyla geçer, 5.001 tekrarı eler ve geçici seçim kayıtlarını temizler. EXAM, FOY, MINI_TEST, QUESTION_BANK toplamı yine5 doğru3 yanlış1 boş/9 akademik olay ve2 katılımcıdır; oyun1 oturum70 puan olarak ayrı kalır.3 dönem kaydı işlenir, katılmayan öğrenci sıfır puanla dahil edilmez; tüm yabancı kaynaklar dışarıda kalır. Kanonik senkron karşılaştırma tekrarlar eklenmeden önce alınır.

Son yerel takım142 dosya732 test başarılı. Üretim kodu/migration değişmedi; provider staging, browser/CSV ve gerçek10k/1m eşzamanlı yük ölçümleri tamamlanmış sayılmaz.
