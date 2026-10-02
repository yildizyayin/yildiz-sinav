# Birleşik karne için kaynak kapsamı

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
