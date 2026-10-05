# Birleşik karne için kaynak kapsamı

## Güncel durum — 5 Ekim 2026

Bu bölüm aşağıdaki tarihli geliştirme notlarının yerini alır; eski notlar tarihçe olarak korunur.

- EXAM, QUESTION_BANK ve NEW MINI_TEST sabit kanıt okuyucuları ve seçilebilir birleşik rapor ekranı bağlıdır.
- 0075 ile yeni FOY ve MINI_GAME kanıtı çözüm anında dondurulur. FrozenFoyGameReport, Reports ekranına bağlıdır. Föy doğruluk kanıtı uygun müfredat grubunda birleştirilir; mini oyun etkinlik puanı doğru/yanlış/boş ortalamasına eklenmez.
- PR225 hesaplama/adaptör kodu bu dala entegredir; PR225'in kendisi merge edilmemiştir. Eksik tarihsel kanıt canlı müfredattan doldurulmaz.
- Yazdır / PDF eylemi rapor bölümlerini aynı belgeye alır. Bu bağlantı ve kapsam testleri vardır; gerçek tarayıcı/mobil, dört role özgü karne tasarımı ve fiziksel PDF doğrulaması tamamlanmış değildir.
- 0074 medya bütünlüğü ve insan onayında R2 medyasını sabitleme akışı uygulanmıştır. Gerçek medya yükleme/onay etkileşimi ayrıca test edilmelidir.
- Maarif beceri/rubrik doğrulaması ve resmi puan/ulusal sıralama hesaplaması bu doğruluk birleştirmesinin sonucu değildir.
- Kod 286e561 sürümünde 139 dosya/637 test, typecheck, build ve migration/tekrarlı seed kontrollerinden geçmiştir. Preview kaynak kontrolü başarılı, sonraki Cloudflare kaynak hazırlama adımı HTTP403 ile başarısızdır; bu sürümün canlı değerlendirme/KVKK kabulü henüz çalışmamıştır.

## Tarihsel geliştirme notları


İlk API: `GET /api/reporting/students/:studentId/frozen-exams`.
`academicYear=2026-2027` ve comma separated `examIds` (en fazla20) gereklidir.
Mevcut reporting rol/öğrenci/kurum yetkisi ve branş kapsamı uygulanır. Öğretmen
kayıtları yetkili mevcut dönemle sınırlıdır. Sadece lisanslı kanaldaki güncel
yayın sürümü/due cutoff kullanılır; yıl dondurulmuş payload içinden okunur.
Tek sınavdaki birden fazla katılımcı kaydı hata verir. Özetler ders/müfredat/sınıf
gruplarıdır; doğrulanmamış veya çelişkili bağlam hariç, iptal paydadan hariçtir.
Branş görünümünde diğer derslerin coverage/bulunamayan sınavları gösterilmez.
EXAM dışındaki kaynaklar, tekrar karşılaştırması, dört ekran ve PDF henüz bağlı
değildir. Bu endpoint resmî puan veya beceri düzeyi hesaplamaz.

Mevcut hesaplama çekirdeği ve adaptör PR #225, `feat/learning-report-calculation-contract`
dalındadır. Henüz bu endpointlere bağlanmış bir kullanıcı özelliği değildir.
Uygulama işlemi sırasında bu kaynaklar doğrulanmalı; istemcinin verdiği öğrenci,
kurum, dönem, müfredat veya yayın bilgisi yetki kanıtı kabul edilmemelidir.

| Kaynak | Mevcut kanıt | Entegrasyon gereksinimi |
|---|---|---|
| Deneme | Yeni sürümlerde dondurulmuş questionEvidence; dönemli katılımcı ve yayın sürümü | Yetkili kaynak join, eksik/çelişkili müfredat kapsamı ve zaman politikası API'de doğrulanmalı |
| Föy | Assessment run/response kayıtları | Tarihsel dönem, içerik sürümü, soru/kazanım ve yayın bağlamı yetkili join ile doğrulanmalı |
| Soru havuzu | Run/response, question learning links | Çözüm anındaki içerik/müfredat ve öğrenci dönem bağlamı bulunmalı |
| Mini test | Run/response ve test bağlantıları | Yetkili kaynak test ve dönemi doğrulanmalı |
| Mini oyun | İstemciden gelen puan/XP olayları | Sunucuda doğrulanmış akademik soru yanıtı olmadan başarı ortalamasına alınmamalı |
| Dış kaynak | İçe aktarılan sonuç ve run kayıtları | Kaynak doğrulaması ve soru bazlı kanıt yoksa betimsel özet ayrı gösterilmeli |

Yeni `REPORT_SNAPSHOT_SQL` sürümleri `questionEvidencePolicy` ve `questionEvidence`
alanlarını ekler: soru kimliği, native durum ve bağlı çıktıların müfredat kimliği,
program sürümü, eğitim yılı, sınıf ve doğrulama durumu aynı snapshotta saklanır.
Doğru cevap/erişim kodu saklanmaz. Doğrulanmamış veya eksik müfredat bağlamı
kendiliğinden tamamlanmaz; API'de kapsam dışı bırakılmalı ve nedeni bildirilmelidir.
Bu alanlar öğrenci sonuç özetine veya kişisel R2 dosyasına otomatik taşınmaz.

Eski `payload_json` içindeki toplam, branş ve kazanım özetleri korunur. Bunlar
seçilmiş sınav özetini destekler; tam soru durumları, müfredat sürümü ve diğer
kaynakların yetkili bağlamını kendiliğinden sağlamaz. Eksik kapsam açıkça
bildirilir; canlı sonuçlardan eski yayın sürümünün soru kanıtı yeniden üretilmez.

Yeni sürüm kanıtı, değerlendirme/sıralama kilidi ve aynı yayın işlemi içinde
üretilir. Kaynak sürüm ve rol kapsamı doğrulanmadan birleşik karneye kanıt
aktarılmaz. Branş öğretmeninde toplam puan ve başka derslerin yanıtları
gösterilmez; rehberlik kapsamı atanmış sınıflarla sınırlanır. Öğrenci/veli
görünümünde yalnız yayınlanmış sürüm kullanılır. Yönetici önizlemesi açıkça
önizleme olarak belirtilir.

Doğruluk yüzdesi, resmî sınav puanı veya Türkiye sırası değildir. Tekrar edilen
soru, ilk deneme ve son deneme olarak ayrılır; doğrulanmamış mini oyun puanı
akademik doğruluğa karıştırılmaz. Maarif beceri/rubrikleri ayrıca resmî program
sürümüyle doğrulanmalıdır; net sayısından beceri düzeyi uydurulmaz.

Bu kapsam notu endpoint, dört karne görünümü, PDF veya gerçek kapasite testi
tamamlandı anlamına gelmez.

## 2 Ekim kaynak incelemesi ve ekran bağlantısı

Raporlar ekranındaki seçili sınav karnesi eğitim yılını, mevcut sınav seçimlerini,
yükleme durumunu ve kanıt kapsamını gösterir. Eski isteklerin farklı öğrenci veya
kurum seçimine taşınması engellenir. Tarayıcıda gerçek kullanıcı testi ayrıca gerekir.

`assessment_runs` ve `assessment_responses` (0039) çözüm zamanını ve kaynak türünü
saklar; tarihsel enrollment, içerik sürümü ve doğrulanmış müfredat sürümü için ayrı
sabit bağlam alanları yoktur. `assessment-ledger.ts` yanıtları yeniden yazar ve EXAM
native durumunu boolean'a indirger. Bu nedenle bu kayıtlar dondurulmuş EXAM karne
kanıtının yerine kullanılamaz.

`platform-expansion.ts` soru pratiğinde ilk learning node bağlantısını saklar ve
istemcinin runId değerini kabul eder. Birleşik karneye bağlamadan önce run sahibinin,
kurumunun ve kaynak tipinin sunucuda doğrulanması; tekrarların ayrı denemeler olarak
korunması ve tüm kazanım bağlarının çözüm anında dondurulması gerekir.
`coach-mastery-cycle.ts` mini testi öğrenciye bağlar; ancak cevap anahtarını mevcut
question_bank kaydından okur ve assessment kanıtında tarihsel sürüm sabit değildir.
Eski kayıtları güncel müfredatla geçmişe dönük tamamlama yapılmayacaktır.

Sıradaki uygulama: kaynak yazıcılarının sahiplik/sürüm tutarlılığı, yeni çözümler
 için atomik tarihsel kanıt, sonra kaynak seçimi ve ilk/son deneme karşılaştırması.
Mini oyun yalnız doğrulanmış soru yanıtı ürettiğinde akademik özete katılabilir.

Yeni dijital soru pratiği `assessment_runs.metadata_json.frozenEvidence` içine
`QUESTION_PRACTICE_READ_CONTEXT_V1` politikasını kaydeder. Native CORRECT/WRONG/BLANK,
enrollment/season/yıl/sınıf, soru kimliği ve tüm OUTCOME node bağlantıları korunur.
Resmî outcome bağlantısı yalnız mevcut ln_ kimlik kuralı ve ders/sınıf/yıl uyumu
ile çözülür; özel veya eksik node doğrulanmamış kalır. Müfredat verified/program
alanları okunduğu hâliyle saklanır. İçerik SHA-256 özeti değerlendirmede kullanılan
metin/seçenek/anahtar/ders/sınıf/yıl değerlerinden oluşur; metadata ham anahtar veya
soru metni taşımaz. Bu özet resmî içerik sürümü değildir.

Kanıt ve yanıt aynı DB.batch içinde kaydedilir; sonraki değişiklikler eski run
metadata'sını değiştirmez. Kaynak okuma sorguları batch öncesi ayrı olduğundan
bu politika bütün kaynak tablolarının tek transaction anını garanti etmez.
Karne okuyucusu bağlam uyumunu ayrıca doğrulamalıdır. Soru ekranda açıldığı anki
sürüm ile gönderim anındaki sürümün karşılaştırılması henüz yoktur. Bu kanıt
EXAM-only karne API'sine henüz bağlanmamıştır; eski run kayıtları doldurulmaz.

## 3 Ekim: üç paralel işin entegrasyonu

1. `frozenPracticeReport` yalnız QUESTION_PRACTICE_READ_CONTEXT_V1 kanıtını
   değerlendirir. FIRST/LATEST politikası aynı soru, içerik özeti, enrollment,
   eğitim yılı, sınıf ve müfredat bağlamındaki seçili kayıtlar içinde uygulanır.
   Doğrulanmamış veya karışık kazanımlar kapsam dışında kalır; doğru/yanlış/boş
   soru bir kez sayılır. Branş dışındaki kanıt ve tanılar gösterilmez.
2. `GET /api/reporting/students/:studentId/frozen-practice` eğitim yılı ve en fazla
   100 runIds alır. Mevcut öğrenci/veli/kurum/atanmış öğretmen yetkisi, kayıt sahibi,
   kurum, kaynak tipi, SCORED/dijital durum ve dondurulmuş enrollment/season/source
   ilişkisi doğrulanır. Öğretmen kayıtları yetkili güncel dönemle sınırlıdır.
   Yalnız seçili kayıtların özeti üretilir; raw soru/yanıt/içerik özeti dönmez.
   Bu API henüz Raporlar ekranına bağlı değildir; FOY/MINI_TEST dahil değildir.
3. Soru pratiği listesi sunucuda SESSION_SECRET ile imzalanmış, 30 dakikalık
   doğrulama bilgisi verir. Öğrenci/kurum/dönem/soru/anahtar ve görüntülenen içerik
   bağlanır; UI gönderimde bunu taşır. Eksik, bozulmuş, süresi dolmuş veya değişmiş
   içerik yazmadan reddedilir. Anahtar veya anahtarın ham özeti istemciye verilmez.
   Mevcut secret kullanılır; yeni secret/deploy ayarı yapılmadı. Gönderim okuması ile
   yazma batch'i arasındaki eşzamanlı kaynak değişiklikleri için kilit garantisi
   henüz yoktur. Medya dosyasının aynı anahtar altındaki byte değişimi ayrıca
   sürümlenmelidir. Gerçek tarayıcı kullanıcı testi henüz yapılmadı.

Bu üç parça genel birleşik karneyi veya dört karne görünümünü tamamlamaz.

## 3 Ekim: seçilebilir soru pratiği ekranı ve listeleme

`GET /api/reporting/students/:studentId/practice-runs` eğitim yılına göre yetkili,
doğrulanmış kayıtları en fazla 50 öğelik sayfalarla listeler. Liste yalnız kayıt
kimliği ve UTC tamamlanma zamanı döndürür. Branş ve kanıt doğrulaması SQL LIMIT
öncesinde uygulanır; başka ders kayıtları sayfalamayı veya devam bilgisini etkilemez.
Dondurulmuş müfredat kullanılır; canlı kazanım tablosuyla eksik bilgi tamamlanmaz.

Raporlar ekranındaki soru pratiği bölümü yılı, kayıtları ve FIRST/LATEST politikasını
seçtirir; en fazla 100 kayıtla özeti hazırlar. Sayfa devamları manuel yüklenir.
Öğrenci/yıl/seçim değişikliği eski yanıtları geçersiz kılar. EXAM ve QUESTION_BANK
özetleri ayrı gösterilir; farklı kaynak yüzdeleri gelişigüzel ortalanmaz.

Hesaplama doğrulaması dönem kimliği, 1–12 sınıf aralığı ve program sürümü türünü
kontrol eder. SQL UTC saatleri ve saat dilimli zamanlar aynı UTC karşılaştırmasına
çevrilir. Tarihsiz veya yalnız tarih taşıyan kayıtlar karne kanıtı sayılmaz.

Önceki PR önizlemesindeki soru pratiği 503 hatası izole Worker'da SESSION_SECRET
bulunmamasından kaynaklandı. Önizleme iş akışı sadece kendi PR Worker'ına rastgele
imzalama anahtarı ekler; değer günlüğe yazılmaz. Canlı smoke, soru listesinden
aldığı practiceToken değerini gönderir. Üretim secretları değiştirilmedi; üretimde
bu binding'in varlığı yayımdan önce doğrulanmalıdır. Son önizleme başarısı ayrıca
kontrol edilecektir; gerçek kullanıcı/tarayıcı testi hâlâ ayrıdır.

## 3 Ekim: seçili sınav ve soru pratiği birleşik karne

`GET /api/reporting/students/:studentId/frozen-combined` mevcut yetkili EXAM ve
QUESTION_BANK okuyucularını kullanır. Eğitim yılı, en fazla 20 examIds, en fazla
100 runIds ve pratik FIRST/LATEST politikası geçerlidir; en az bir kaynak gerekir.
Her kaynak hata verirse birleşik rapor da hata verir, sessiz kısmi sonuç dönmez.

Gruplar ders/müfredat/yıl/sınıf/program sürümü aynı olduğunda birleşir. Kaynak
başarı yüzdeleri ortalanmaz: doğruluk toplam doğru / toplam doğru+yanlış+boş
olarak hesaplanır. İptaller paydadan hariçtir. Kaynak kırılımı ve kapsam tanıları
korunur. EXAM soruları ve seçili pratik ilk/son çözümleri ayrı kanıt olaylarıdır;
kaynaklar arasında aynı soruyu çözmüş olma ihtimali içerik eşleştirmesiyle
tekilleştirilmez. Bu nedenle politika SOURCE_EVENT_WEIGHTED olarak açıkça adlandırılır.
Resmî puan, ulusal sıralama veya Maarif beceri düzeyi üretilmez.

Raporlar ekranında soru pratiği seçiminin yanında üstte seçilen aynı eğitim yılı
sınavlarını ekleme kutusu bulunur. Seçim/yıl/politika değişince eski rapor gizlenir.
EXAM ve QUESTION_BANK kaynakları isteğe bağlı birleştirilir; MINI_TEST yeni soru testleri de sabit kanıt üzerinden dahil edilir; FOY ve
mini oyun için bu okuyucular henüz tamamlanmamıştır. PDF ve dört ayrı rol sunumu ayrıca tamamlanacaktır.

Önceki9b6e89 başlığı CI37111702162 ve Preview37111702265 başarıyla tamamlandı;
izole imzalama anahtarı kurulumu ve canlı smoke düzeltmesi sağlayıcıda geçti.
Üretimde SESSION_SECRET varlığı henüz doğrulanmadı; üretim anahtarları değişmedi.

## 3 Ekim: mini test keşfi ve birleşik karne seçimi

`mini-test-runs` eğitim yılına göre yetkili tamamlanan NEW mini testleri listeler.
Her sayfa en fazla 50 kimlik ve UTC tamamlanma zamanı getirir; liste ham soru,
cevap anahtarı, kazanım başlığı veya başka branş tanıları vermez. Yetki ve geçerli
sabit kanıt kontrolü sayfalama öncesinde uygulanır. Tekrar çalışmaları ve eski
kanıtsız kayıtlar akademik seçime girmez.

Raporlar ekranında soru pratiği ve mini test listeleri ayrı yüklenir ve seçilir.
En fazla 100 pratik çözüm, 20 mini test ve üstte seçilen aynı yılın 20 sınavı
birleştirilebilir. İlk/son çözüm politikası yalnız soru pratiğine uygulanır.
Öğrenci, eğitim yılı, kurum/oturum kapsamı veya seçim değişince eski yanıtlar
gösterilmez. Mini test tek başına da hazırlanabilir. Görsel tasarım/tarayıcı
doğrulaması ile dört ayrı role özgü PDF sunumları ayrıca tamamlanacaktır.
