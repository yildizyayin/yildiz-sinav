# Birleşik karne için kaynak kapsamı

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
