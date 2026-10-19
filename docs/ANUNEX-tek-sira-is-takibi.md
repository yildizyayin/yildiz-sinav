# ANUNEX — tek sıra iş takip kaydı

Sürüm: 5 · Açılış: 19 Ekim 2026, Türkiye saati.
Kayıt yeri: yildizyayin/yildiz-sinav, `docs/ANUNEX-tek-sira-is-takibi.md`. Yeni sohbet önce bu dosyanın main'deki son sürümünü okur.
Kapsam: app.anunex.com ve sonuc.anunex.com. Demo ve tanıtım sitesi değişiklik kapsamında değil.

## Çalışma sözleşmesi

1. Aynı anda yalnız **bir aktif iş** bulunur. Tamamlanan ilk iş **A001**; güncel aktif iş aşağıda belirtilir. Diğer bütün işler sıradadır; kodları değiştirilmez ve yürütücüleri başlatılmaz.
2. Bir iş ancak kendi kabul ölçütü, ilgili güvenlik kontrolleri ve etkilenen diğer sistemin regresyon kontrolü geçince **BİTTİ** olur. Kod, test veya merge tek başına canlı kabul değildir.
3. Sıra: incele → sınırları belirle → gerekli en küçük düzeltme → ilgili test → ilgili ortama dağıt → gerçek arayüz/API akışını doğrula → kanıtı kaydet → sıradaki işi aç. Testler ayrı bir son aşamaya ertelenmez.
4. Önceden çalışan özellik yeniden yazılmaz. Önce kanıt aranır; yeterli güncel kanıt varsa değişiklik yapmadan kapatılır. Eksik kanıt, kodun olmadığı anlamına gelmez.
5. Ortak dosya/API/veritabanı değişikliğinde iki alan adının etkilenen akışları denetlenir. app, sonuc veya diğer roller bozulursa mevcut iş açık kalır; düzeltme veya kontrollü geri dönüş tamamlanmadan ilerlenmez. Sıfır hata garantisi verilmez; korunma ve geri dönüş kanıtlanır.
6. Veri silme, migration geri alma veya eski yayını değiştirme otomatik geri dönüş yöntemi değildir. Sürüm, veri koruma ve ileri düzeltme gereksinimi önce belirlenir. Gerçek öğrenciler üzerinde sentetik işlem yapılmaz.
7. İnsan onayı, telif/hak, RESTRICTED, doğrulanmış müfredat ve yetki kapıları gevşetilmez. Kota kaldırılması bu kuralları kaldırmaz.
8. Engel varsa iş **BEKLİYOR** olur; sebep, gereken kişi/ayar/veri ve son kontrol kaydedilir. Engeli atlayıp başka iş başlatılmaz.
9. Yeni hata önce aktif işe bağlı alt kayıt olarak açılır. Yeni ürün isteği ayrı değişiklik kaydıyla kuyruğun sonuna eklenir; mevcut numaralar veya kabul ölçütleri sessizce değiştirilmez.
10. Her kapanışta bu **aynı dosyanın yeni sürümü** kaydedilir. Yeni sohbetin ilk adımı bu kaydı okumaktır; yalnız sohbet hafızasına güvenilmez.

## Güncel durum — 19 Ekim 2026

- **A001: BİTTİ. Aktif iş A002 — altı rolün giriş/çıkış ve doğru panel erişimi.** Diğer bütün işler sırada.
- Repo yildizyayin/yildiz-sinav, PR #265, merge `fae0a48f346499363a07e2e9b56dbd9a5a48ff5a`.
- Production run https://github.com/yildizyayin/yildiz-sinav/actions/runs/39277304492 ; deploy job `118145237158`: SUCCESS. Worker sürümü `02b56366-49c0-4174-8b7c-5b3622b8dc91`.
- Deployment günlükleri 19 Ekim 18:29 Türkiye saatinde 388 resmî kaynağın yeniden doğrulandığını, 77 kapsam / 2.916 çıktının production'a aktarıldığını gösteriyor. UNLIMITED, cap null, rezervasyon 0, tarihsel cap 50. Model çağrısı yapılmadı.
- Son runtime ölçümü: otomatik üretime uygun sınıflarda 2.192 doğrulanmış çıktı; servis aktörü doğrulanmadı; inceleme kapasitesi 0; inceleme kullanılabilirliği false. Bu nedenle ajan üretimi hazır değildir. A005/A006 sırası geldiğinde ele alınacak; mevcut işe paralel başlatılmaz.
- Yerel son kaynak kanıtı: 213 dosya / 1.101 test, tip kontrolü ve build geçti. A001'in kapsamı dağıtım ve temel erişimdir; giriş veya gerçek soru üretimi kabulü değildir.
- app ve sonuc temel erişim kontrollerinin sonucu A001 kapanışında aşağıda tutulur. Tam işlev regresyonu ilgili sonraki işlerde ayrıca yapılır.
- Ayrı sonuç sağlayıcı probunda hesap 100 Queue sınırı görüldü. İlgisiz kaynaklar silinmedi.
- 9 Ekim envanteri ve çalışma kaydı v63 tarihsel kaynaklardır; bugünkü canlı başarı kanıtı sayılmaz. Bu dosya güncel yürütme sırasının ana kaydıdır.

## Onaylanan kapsam ve nihai yürütme sırası

Kullanıcı 19 Ekim 18:45'te Süper Admin kapsamını onayladı. Teknik işler kapanmadan tasarım uygulanmayacak. Sonrasında veli, kurum/zincir, öğrenci, öğretmen, rehber ve sonuc tasarımları ayrı ayrı tamamlanacak.

**Tek sıra:** A001–A079 → S001–S018 → K001 → K002 → A080 → D001–D007 → K003.

A080 kimliği korunmuştur fakat tasarım aşamasına ertelenmiştir. Bu açık sıra değişikliği, önceki dosyanın A080'den sonra sonuc'a geçiş kuralını değiştirir. Hiçbir teknik iş tasarım aşamasına ertelenmez. İş kapanırken test ve geri dönüş hazırlığı her zaman zorunludur; K001/K002 yalnız son kapsamlı tekrar kabulüdür.

Onaylı menü kapsamı: Yönetim; Nibiru; Sınav Merkezi (ekle/yükle/optik tanımla); ayrı Deimos optik baskı; Soru Havuzu/Studio ve üretim ekibi; Föy; Ders Programı; Yoklama; Kişiye Özel Kitap; Sıfır Hata Kitapçığı; Mini Oyunlar; Kullanıcılar (kurum/öğretmen/öğrenci/veli/personel/lisans hakları); Rehberlik/RBA; Ödev; Raporlar/Karneler; Takvim/Bildirimler; önceki planlı diğer alanlar.

## app.anunex.com — sabit sıra

Her satır ayrı iştir. Güncel istisnalar: A001 BİTTİ, A002 AKTİF. Diğerleri **SIRADA / canlı kabul yeniden doğrulanacak**. Aşağıdaki ölçütler planlanan kapanış koşullarıdır; tamamlanmış özellik iddiası değildir.

| ID | Yapılacak tek iş | Kapanış ölçütü |
|---|---|---|
| A001 | Bekleyen production paketini sonuçlandır | Dağıtım sonucu, başarısız adım varsa nedeni, çalışan sürüm ve iki alan adının temel sağlık durumu kaydedilir. |
| A002 | Giriş ve oturum akışını kapat | Süper admin, kurum, öğretmen, rehber, öğrenci, veli doğru panele girer; çıkış ve yetkisiz erişim kontrolleri geçer. |
| A003 | Production sınırsız kotayı doğrula | UNLIMITED görünür; eski tüketim korunur; iptal iade etmez; görev ve inceleme sınırları sürer. |
| A004 | Production müfredat aktarımını kapat | 77 hedef kapsam / 2.916 bağlamlı çıktı kaynak ve öğrenme düğümüyle doğrulanır; engelli kapsamlar açık gösterilir. |
| A005 | Ajan servis aktörünü doğrula | Zamanlayıcı gerçek ve yetkili servis kimliği kullanır; insan oturumunun taklidi yapılmaz. |
| A006 | İnsan inceleme kapasitesini tanımla | Gerçek sorumlu ve sürdürülebilir kapasite belirlenir; sıfır/dolu kuyruk üretimi durdurur. Kapasite uydurulmaz. |
| A007 | Tek gerçek soru üretimini kanıtla | Süper admin doğrulanmış çıktı seçer; model ve bağımsız kontrol sonrası soru kalıcı inceleme listesinde görünür; hata varsa gerekçesi görünür. |
| A008 | Soru inceleme kararını kapat | İnsan ONAY/RET/DÜZELTME verir; çözüm ve hak denetimi kaydedilir; RESTRICTED soru öğrenciye açılmaz. |
| A009 | Otonom zamanlayıcıyı kanıtla | Gerçek zamanlayıcı çağrısı yeni işi işler; tekrar çağrı kopya üretmez; kapasite/duraklatma kuralları uygulanır. |
| A010 | Ajan yönetim panelini kapat | Gerçek işler/sayılar/hatalar görünür; durdur-sürdür ve izinli manuel görev, kayıt geçmişiyle çalışır. |
| A011 | Soru kartı akademik bağlarını tamamla | Güncel kazanım, sınıf, sürüm ve doğrulanabilen ön öğrenmeler görünür; olmayan veri açıkça bilinmiyor gösterilir. |
| A012 | Çıkmış soru istatistiğini doğrula | Son beş yıl sayısı yalnız doğrulanmış veriyle hesaplanır; veri yoksa sıfır/olasılık uydurulmaz; tahmin resmî olasılık diye sunulmaz. |
| A013 | Soru görsel kalitesini kapat | Branşa uygun gerçek örneklerde yazı/veri/ölçek okunur ve çözümle tutarlıdır; güncel olay ve kişi görsellerinin hakları doğrulanır. |
| A014 | Gerçek soru video çözümünü kapat | Kaynak sürümüne bağlı video üretilir, açılır, insan/hak incelemesi kaydedilir; teknik test öğrenci videosu sayılmaz. |
| A015 | Mini test tekrar politikasını kapat | Daha önce çözülen soru yeni testte engellenir; öğrenci açıkça tekrar seçerse bilgilendirilir; kazanım yetersizliği görünür. |
| A016 | Studio soru seçimini kapat | Yalnız uygun hak ve onaya sahip sorular seçilir; sınıf/branş/kazanım kapsamı ve eksik stok korunur. |
| A017 | Studio A/B PDF çıktısını kapat | PDF gerçekten indirilir; A/B sırası ve anahtarı tutarlıdır; kayıt tekrar açılır. |
| A018 | Studio kitapçık-optik bağını kapat | PDF alt optiği, kitapçık kimliği ve değerlendirme aynı sorulara bağlanır; yanlış kitapçık reddedilir. |
| A019 | Sınav kartının kalıcı kaydını kapat | Sınav oluşturulup sayfa/oturum yenilendiğinde bilgiler korunur; zorunlu alanlar açık belirtilir. |
| A020 | Cevap anahtarı girişini kapat | Elle ve dosyadan kazanımlı/kazanımsız anahtar, seçilen A/B/C/D kapsamıyla doğru saklanır; şablon tek hücreye düşmez. |
| A021 | Otomatik kazanım eşleştirmesini kapat | Önce resmî kod, yoksa metin adayları bulunur; belirsiz eşleşme kesinmiş gibi kaydedilmez. |
| A022 | Manuel kazanım seçimini kapat | Yıl/sınıf/ders kapsamında resmî çıktılar listelenir; kullanıcı eşleştirip tekrar açabilir. |
| A023 | Taslaktan aktife geçişi kapat | Butona basınca eksikler yanında ve Düzelt bağlantısıyla görünür; eski readiness için sunucu hatası kaybolmaz; izinli sınav etkinleşir. |
| A024 | Sınav puanlama profilini doğrula | Doğrulanmış MEB/ÖSYM veya açık özel profil; yanlış götürme, katsayı, seçmeli TYT felsefe ve toplam puan örnek hesaplarla tutar. |
| A025 | TXT/DAT/FMT değerlendirmesini kapat | Gerçek izinli örnek dosya okunur; soru/branş/kitapçık sayıları ve hesaplanan sonuçlar beklenenle aynıdır. |
| A026 | Öğrenci otomatik eşleşmesini kapat | TCKN → öğrenci no → adsoyad sırası ve belirsizlik kontrolü çalışır; başka öğrenciye sessiz bağlanmaz. |
| A027 | Eksik/hatalı kitapçık çözümünü kapat | Uygun kitapçıklara göre net karşılaştırması gösterilir; kullanıcı kararı kalıcı ve denetlenebilirdir. |
| A028 | Eşleşmeyen öğrenci kuyruğunu kapat | Eşleştir/misafir/iptal kararları çalışır; bekleyen kayıt kaybolmaz ve sonuç doğru öğrenciye gider. |
| A029 | Sonradan kazanım bağlantısını kapat | Yetkili yeniden analiz ile geçmiş sonuçta kazanımlar görünür; eski yayın sürümü sessizce değiştirilmez. |
| A030 | app sınav sonucu yayınını kapat | Şimdi/sonra yayın ve dondurulmuş sürüm çalışır; öğrenci/veli yalnız yayımlanmış sonucu görür. |
| A031 | Sınav silme/arşiv/kopyalama akışını kapat | Hatalı sınav kaldırılır, ilişkili sonuç ve kanal etkisi açık gösterilir; kopya kayıt bağları karışmaz. |
| A032 | Sınav kataloğunun işlevlerini kapat | Liste/filtre/detaya giriş ve mevcut işlem düğmeleri çalışır. Görsel yeniden tasarım D001 kapsamındadır. |
| A033 | Sınav belge arşivini kapat | Anahtar/PDF/video ve ekler doğru sınavda açılır; yetkisiz dosya erişimi engellenir. |
| A034 | Phobos optik tanımlamayı kapat | Optik ekle/düzenle/sil ve FMT alanları kaydedilir; kurum kendi kapsamıyla sınırlıdır. |
| A035 | Deimos optik basmayı kapat | Tanımlamadan ayrı modülde öğrenciye özel çıktı ve kalibrasyon alınır; basılan kimlik/kitapçık tutarlıdır. |
| A036 | Fiziksel telefon optik okumasını kapat | Gerçek basılı örnek telefonla okunur; belirsiz işaretler manuel düzeltilir; sentetik test fiziksel kanıt sayılmaz. |
| A037 | Ortak yazılı resmî senaryo girişini kapat | Yıl/dönem/il/kapsam/kaynak ve dağılım doğrulanır; 2027–2028 belgesi yoksa resmî doğrulama kapalı kalır. |
| A038 | Açık uçlu soru üretimini kapat | Yazılıya özgü soru/cevap paketi üretim ve bağımsız kontrolden geçer; çoktan seçmeli otomatik notlandırmaya karışmaz. |
| A039 | Analitik rubrik kaydını kapat | Ölçütler, alternatif çözümler ve kısmi puanlar saklanır; toplamlar tutar; öğretmen onayı zorunludur. |
| A040 | Yazılı sınav kâğıdını kapat | Doğrulanmış senaryoya göre soru dağılımı, uygulanabilir zümre kuralı, kâğıt ve anahtar oluşur. |
| A041 | Yazılı öğretmen puanlamasını kapat | Soru bazlı puan ve düzeltme gerekçesi sürümlenir; AI tek başına kesin not vermez. |
| A042 | Yazılı kazanım raporunu kapat | Öğrenci/sınıf/şube geri bildirimi doğru puan ve kazanımlara dayanır; yazılı puanı deneme neti gibi işlenmez. |
| A043 | Kurum kartı yönetimini kapat | Kurum ekle/görüntüle/düzelt/pasifleştir ve MEB kodu doğrulaması çalışır; bağlı öğrenciler korunur. |
| A044 | Zincir kurum kapsamını kapat | Üst yönetim yalnız bağlı kurumları görür; kurumlar arası karşılaştırma ve alt yönetim izinleri tutarlıdır. |
| A045 | Öğrenci aktarımını kapat | Toplu ekleme, sınıf/şube ve mükerrer kontrolü çalışır; kurumlar arası veri sızıntısı olmaz. |
| A046 | Personel ve branş atamasını kapat | Öğretmen/rehber kullanıcıları doğru sınıf, branş ve kurumla çalışır; yetki kaldırma anında uygulanır. |
| A047 | Veli-öğrenci bağlantısını kapat | Doğru çocuk görünür; bağlantı kaldırılınca erişim kesilir; telefon tek başına hassas veri yetkisi sayılmaz. |
| A048 | Yıllık koltuk lisansı kararını kapat | Önceki yalnız analiz sınırı korunarak mevcut modelle karşılaştırma ve kabul edilmiş sözleşme kaydedilir; fiyat sistemde gösterilmez. Uygulama bu satırın kapsamı değildir. |
| A049 | Eğitim yılı geçişini doğrula | Öğrenci kimliği korunur; sınıf atlama sonrası eski sonuçlar eski döneminde kalır; lisans uygulaması için ayrı kabul edilmiş kapsam gerekir. |
| A050 | Öğrenci bireysel karnesini kapat | Kendi yayımlanmış sonuçları, güçlü/gelişecek kazanımları ve seçilen dönem doğru görünür; PDF açılır. |
| A051 | Branş öğretmeni karnesini kapat | Yalnız yetkili branş ve öğrenciler görünür; ilgisiz ders sonuçları sızmaz. |
| A052 | Kurum/zincir karnesini kapat | İzinli sınıf/şube/kurum özetleri ve karşılaştırmalar aynı veriyle tutar. |
| A053 | Rehberlik karnesini kapat | Yetkili öğrenci grubunun gelişim ve destek planı görünür; özel rehberlik kayıtları ayrılır. |
| A054 | Seçilebilir birleşik karneyi kapat | Sınav/föy/havuz/mini test/oyun yalnız güvenilir tarihsel kanıtla birleşir; farklı ölçüler ve tekrar politikası açıktır. |
| A055 | Maarif süreç gözlemini kapat | Resmî sürümle ilişkili rubrik/gözlem kaydedilir; doğrulanmayan yeterlik kesin hüküm gibi sunulmaz. |
| A056 | Özel rapor indirmesini kapat | Asenkron PDF/CSV doğru kullanıcıya açılır; süre/iptal/yetki/temizlik davranışı doğrulanır. |
| A057 | 32 haftalık föy yayınını kapat | Öncelikli sınıf ve sayısal/sözel içerik, seri ve hafta takvimiyle atanıp öğrenciye ulaşır. |
| A058 | Kişiye özel kitap / Dejavu akışını kapat | Öğrencinin kanıtlı eksiklerine göre uygun sorularla kitap oluşur ve kullanılabilir PDF alınır. |
| A059 | Sıfır hata kitapçığını kapat | Yanlış/boş geçmişinden izinli, sürümü sabit soru seçilir; tekrar sonrası gelişim kaydedilir. |
| A060 | Ödev takip akışını kapat | Öğretmen atar, öğrenci çözer/teslim eder, durum ve son tarih doğru görünür. |
| A061 | Yoklama akışını kapat | Yetkili kişi yoklama girer/düzeltir; öğrenci/veli kendi kaydını görür; geçmiş korunur. |
| A062 | Mini oyun öğrenme kaydını kapat | Oyun çalışır; istemcinin yolladığı keyfî skor akademik başarı sayılmaz; güvenilir kazanım kanıtı ayrılır. |
| A063 | Panel takvimini kapat | Rolün kendi sınav/ödev/föy/randevu/görevleri tarih ve yetkiyle görünür; saat dilimi ve çakışma açıktır. |
| A064 | Rehberlik RBA akışını kapat | Yetkili rehber test/yanıt/değerlendirme sürecini tamamlar; hassas kayıt ve veli görünürlüğü sınırlandırılır. |
| A065 | Nibiru rol tabanlı yardımını kapat | Öğrenci/veli/öğretmen/kurum kendi kapsamındaki veriyle yanıt alır; veri olmayan yerde uydurma cevap verilmez. |
| A066 | Nibiru ses akışını kapat | Mikrofon/yazı/sesli yanıt gerçek örnekte çalışır; sağlayıcı hatası görünür; ücretli ses izinsiz açılmaz. |
| A067 | YouTube kaynak bağını kapat | Kazanım/soruya uygun yetkili video bağlantısı açılır; bağlantı ve içerik kaynağı kontrol edilir. |
| A068 | WhatsApp uygulanabilir bağlantısını kapat | Kullanılan Business numarası/telefon birlikte kullanım yolu ve ücret koşulları doğrulanır; izinsiz mesaj gönderilmez; kimlik doğrulama sınırı uygulanır. |
| A069 | Bildirim teslimini kapat | Yayın/ödev/takvim olayı doğru alıcıya bir kez iletilir; tekrar/iptal/başarısızlık görünür. |
| A070 | Ders programı karar ve kapsamını kapat | Mevcut uygulama ile istenen yapı karşılaştırılır; varsa eksik iş ayrı ve ölçülebilir kabul ölçütüyle kaydedilir. |
| A071 | Canlı ders kapsamını kapat | Yetkili rol oturumu açar/katılır; kullanılan sağlayıcı ve kayıt izinleri açıktır; mevcut olmayan entegrasyon var sayılmaz. |
| A072 | Tercih robotu resmî veri kapsamını kapat | Yıl/kaynak doğrulanmış hedef verisi ve filtreler çalışır; yerleşme garantisi verilmez. |
| A073 | Üyelik/aktivasyon ve modül haklarını kapat | Talep/onay/özellik kapısı ilgili panelde tutarlı çalışır; kapalı hak menüden veya API'den aşılamaz. |
| A074 | Veri transferi/toplu işlemleri kapat | Önizleme, hata listesi ve tekrar çalıştırma kopya/kayıp üretmez; kurum kapsamı korunur. |
| A075 | Yayınevi/bursluluk/kabul kapsamını doğrula | Envanterdeki etkin akışlar doğru rol ve kurumla tamamlanır; planlı Campus parçaları çalışan diye gösterilmez. |
| A076 | Profil ve görünüm ayarlarını kapat | İzinli ayarlar korunur; tema, menü ve logo bütünlüğü diğer paneli etkilemez. |
| A077 | Yönetim ve izleyici ekranlarını kapat | Süper admin gerçek sağlık/iş/hata özetini görür; ajan serbest ve denetimsiz komut çalıştıramaz. |
| A078 | Mobil/PWA/tahta erişimini kapat | Ana iş akışları hedef cihazlarda okunur/tıklanır; fiziksel kitap bağlantıları doğru içeriğe gider. |
| A079 | app güvenlik ve veri yaşam döngüsünü kapat | Rol/tenant izolasyonu, oturum iptali, dosya erişimi ve süreli veri temizliği kanıtlanır; gerekli kalıcı kimlikler silinmez. |
| A080 | Ortak tasarım planını onaylat | Teknik sıra bittikten sonra açık/ferah içerik, sol menü, modül renkleri, uzay ilişkisi, ANUNEX/Nibiru ve mobil davranış örneklerle planlanır; kullanıcı tasarım yönünü onaylar. |

## sonuc.anunex.com — A079 sonrasında teknik sıra

Sonuç portalına app'in öğretmen, rehber ve veli panelleri eklenmez. Amaç lisanssız sonuç, öğrenci/kurum/bayi ve izinli yönetimdir. Çalışan mevcut akışlar önce doğrulanır; gereksiz yeniden yapım yoktur.

| ID | Yapılacak tek iş | Kapanış ölçütü |
|---|---|---|
| S001 | Sonuç portalının canlı temelini doğrula | Doğru production sürümü, sonuç config'i ve sağlık çalışır; app API sınırıyla karışmaz. |
| S002 | Öğrenci sonuç girişini kapat | Kabul edilmiş öğrenci no/sınıf/adsoyad/kurum ve güvenli erişim yöntemiyle yalnız kendi sonuçları açılır; tahminle başkasına erişilmez. |
| S003 | Kurum girişini kapat | Yalnız kendi kurumunun yayımlanmış katılımcı/sonuçları görünür; erişim iptali uygulanır. |
| S004 | Bayi girişini kapat | Yalnız bağlı kurumlar görünür; başka bayinin kurum/verisi sızmaz. |
| S005 | Sonuç ağı kurum ve erişim yönetimini kapat | app Süper Admin yetkili kurum/erişim kodu yönetir; tek seferlik kod ve iptal akışı güvenlidir. |
| S006 | app-sonuc yayın farkı uyarısını kapat | app değişikliğinde sonuc sürüm farkı görünür; otomatik ve izinsiz yeniden yayın yapılmaz. |
| S007 | Sonuç kanalında yayın kararını kapat | app yönetiminden şimdi/sonra yayın ve kaldırma çalışır; yayınlanmayan sınav portalda görünmez. |
| S008 | Sonuç özetini kapat | Doğru/yanlış/boş/net/puan doğru yayın sürümünden gelir; yeniden değerlendirme öncesi/sonrası tutarlıdır. |
| S009 | Sonuç sıralamasını kapat | İzin verilen sınıf/okul/ilçe/il/Türkiye ve zincir kapsamı doğru katılımcılarla hesaplanır; eksik evrende yanıltıcı sıralama gösterilmez. |
| S010 | Sonuç kazanım görünümünü kapat | Doğrulanmış kazanımlar ve sonradan analizin yayımlanan sürümü görünür; veri yoksa açık belirtilir. |
| S011 | Sonuç video erişimini kapat | İlgili soru videosu izinli kullanıcıya açılır; başka sorunun veya özel dosyanın bağlantısı sızmaz. |
| S012 | Sonuç düzeltme/silme eşzamanlılığını kapat | app yayın/güncelleme/kaldırma sırasında eski ve yeni sonuçlar karışmaz; ilişkili erişimler doğru kapanır. |
| S013 | Sonuç belge çıktısını kapat | İzinli öğrenci/kurum çıktısı doğru sürümle alınır; PDF/CSV ve indirme süresi korunur. |
| S014 | Dönem sonu lisanssız temizliği kapat | Kabul edilmiş süre sonunda yalnız hedef lisanssız kayıt/dosyalar temizlenir; lisanslı öğrenci geçmişi silinmez. |
| S015 | Sonuç kaynak kotası engelini kapat | 100 Queue engelinin gerekli akışa etkisi belirlenir; yalnız sahipliği doğrulanmış ve kullanılmayan kaynaklar kapsamlı incelemeyle ele alınır. |
| S016 | Gerçek 10.000 sonuç isteğini ölç | İzole yetkili ortamda önceden belirlenmiş hata/gecikme eşikleri geçilir; istek sayısı farklı öğrenci sayısı diye sunulmaz. |
| S017 | 1.000.000 yoğun istek planını doğrula | Gerçek yük tanımı, süre, eşzamanlılık ve sağlayıcı sınırları belirlenir; izinli bütçe ve ortam olmadan pahalı yük başlatılmaz; ölçüm yoksa hazır denmez. |
| S018 | Sonuç mobil işlev kabulünü kapat | Öğrenci/kurum/bayi akışları telefon/masaüstünde çalışır. Görsel yeniden tasarım D007 kapsamındadır. |

## İki sistem için son kabul — sıradaki tek işler

| ID | İş | Kapanış ölçütü |
|---|---|---|
| K001 | Yedek ve geri dönüş kanıtı | Uygulama sürümü, veri yedeği ve veri kaybetmeden geri dönüş/ileri düzeltme izolasyonda doğrulanır. |
| K002 | Alanlar arası son regresyon | Altı app rolünün kendi temel işlemleri ile sonuc öğrenci/kurum/bayi akışları doğrulanır. Sınav oluştur → değerlendir → kanala göre yayın → düzelt → kaldır zinciri tutarlıdır. |
| K003 | Son kullanıcı kabulü ve devir | Rol bazlı kullanım adımları teslim edilir, kullanıcı kabulü kaydedilir; açık engeller sıfırlanmadan genel hazır beyanı verilmez. |

## Teknik kabulden sonra tasarım — A080 onayından sonra

Her tasarım işi de kendi işlev regresyonu bitmeden kapanmaz. Tasarım çalışırken yeni özellik eklenmez; eksik keşfedilirse mevcut işte hata kaydıyla çözülür. Mor renk kullanılmaz; büyük dekoratif görseller yerine okunabilir, kaliteli ve tutarlı yerleşim hedeflenir. Her modülün renk kimliği olur; içerik alanı açık/ferah kalır. Sonuç portalına app'in diğer rol panelleri taşınmaz.

| ID | Tasarım işi | Kapanış ölçütü |
|---|---|---|
| D001 | Süper Admin paneli ve bütün onaylı modül ekranları | Onaylı ortak sistem bütün ekranlarda uygulanır; menüler/işlemler ve mobil görünüm tek tek çalışır. |
| D002 | Veli paneli | Kendi çocukları, sonuç/gelişim, ödev/yoklama/takvim ve bildirimler erişilebilir; veri sınırı ve çalışan akışlar korunur. |
| D003 | Kurum ve zincir kurum paneli | Yönetim, alt kurum kapsamı, sınav, personel/öğrenci ve rapor akışları tasarım sonrası tekrar doğrulanır. |
| D004 | Öğrenci paneli | Sonuç, mini test, kitap/föy/oyun, ödev/takvim ve Nibiru akışları yaşa uygun ve kullanılabilirdir. |
| D005 | Öğretmen paneli | Kendi branş/sınıfı, soru/ödev/sınav, yoklama/program ve rapor akışları çalışır. |
| D006 | Rehber paneli | RBA, görüşme/takip, destek planı, takvim ve rehberlik raporları çalışır; hassas kayıtlar ayrıdır. |
| D007 | sonuc.anunex.com | Öğrenci, kurum ve bayi ekranları tutarlı markayla yenilenir; bütün sonuç ve yayın akışları korunur. |

## Kapanış kaydı şablonu

ID / başlık:
Durum: SIRADA → AKTİF → [BEKLİYOR | CANLIDA DOĞRULANDI] → BİTTİ
Başlangıç ve bitiş zamanı:
Kabul ölçütü:
Önceki durum ve tekrar üretim adımları:
Değişen dosya/ayarlar; etkilenmemesi gereken alanlar:
PR / commit / deployment / ortam:
İlgili test ve canlı arayüz/API kanıtı:
Diğer alan adı ve rol regresyon kanıtı:
Geri dönüş / veri koruma bilgisi:
Kullanıcıya görünen sonuç:
Engel varsa somut neden / ihtiyaç / sorumlu:
Sıradaki ID (yalnız kapanış sonrası):

## Günlük — değiştirilmeyen geçmiş

- 19.10.2026: Kullanıcı iki sistemi tek tek, kayıtlı ve birbirini bozmadan bitirme kuralını belirledi. Bu ana kayıt açıldı. A001 aktif; A002–A080, S001–S018 ve K001–K003 sırada. İlk sürüm toplamı **101 kabul işi**; bu sayı 101 eksik özellik veya 101 yeniden geliştirme değildir. Mevcut özellikler kanıtla değişikliksiz kapatılabilir. Bu oturumda uygulama kodu veya üretim ayarı değiştirilmedi.

- 19.10.2026 18:45 sonrası: Kullanıcı bütün kapsamı onayladı; teknik işleri önce, tüm tasarımları en sona aldı. D001–D007 eklendi; toplam **108 ayrı kabul kaydı**. Bu sayı eksik özellik sayısı değildir. Kimlikler korunarak A080 tasarım aşamasına taşındı. Yeni yürütme sırası yukarıda açıklandı.

### A001 kapanışı

Durum: BİTTİ. Production job 118145237158 SUCCESS; çalışan sürüm 02b56366-49c0-4174-8b7c-5b3622b8dc91. Dağıtım içinde release test/build ve production smoke adımları çalıştı. Kaynak ve çalışma kanıtı deployment günlüğündedir. Sınırsız kota/müfredat aktarımı gözlendi; bunların panel/API kabulü A003/A004 kapsamıdır. Başka ürün kodu bu oturumda değiştirilmedi. Sonraki tek iş A002.

A001 ek canlı kanıt: Bu oturumda cloud tarayıcıda app `/login` ve sonuc `/` açıldı. Her iki `/api/health` yanıtı `{"ok":true,"status":"ready","environment":"production"}` olarak görüldü. Yerel HTTP istemcisi 403 verdi; bu sonuç site kesintisi sayılmadı, aynı anda tarayıcı erişimi ve production deployment smoke başarılıydı. Diğer sistemin temel erişimi doğrulandı; tam rol regresyonu A002 ve sonraki işlerin kapsamıdır.

### A002 başlangıcı

Durum: AKTİF — güvenli oturum bekleniyor. app giriş ekranında kullanıcı adı/e-posta/telefon ve şifre alanları görüldü. Mevcut kullanıcı oturumu yok. Önce güvenli girişle Süper Admin akışı; ardından yetkili ve kişisel veri içermeyen rol testleri planlanacak. Gerçek kullanıcı şifresi sohbetten istenmez, şifre değiştirilmez ve sıradaki iş açılmaz.

### A002 doğrulama sonucu — aynı aktif iş

Durum: BEKLİYOR / KAPANMADI. Kullanıcı güvenli browserAuth formunu tamamladı; request submitted döndü, ancak site `/login` ekranında `Robot doğrulaması başarısız.` gösterdi. Bu bir başarılı oturum veya yanlış şifre kanıtı değildir. Hesap/şifre değiştirilmedi; Turnstile kapatılmadı; alternatif kimlik veya yeni hesap açılmadı. Sonraki iş başlatılmadı.

Kaynak incelemesi: Login.tsx gönderim düğmesi token yokken de etkinleşebiliyor; backend verifyTurnstile eksik tokenı reddediyor ve sağlayıcı hata kodlarını döndürüyor. Bu gözlem robot hatasının kesin nedeni değildir; eksik token / süresi dolma / widget yapılandırması / bu tarayıcının kabul edilmemesi ayrımı henüz kanıtlanmadı. Nedeni kanıtlamadan production güvenlik ayarı değiştirilmez.

Bulut tarayıcı, güvenli kimlik tesliminden sonra ek komutta retained-data restriction bildirdi. Gizli giriş değerleri okunmadı veya kaydedilmedi. Yeni şifre istenmedi, aynı giriş tekrar denenmedi. A002'de sıradaki adım: izinli tanılama ile Turnstile hata sınıfını belirlemek; gerekli düzeltmenin kendi testi ve canlı kabulü bitmeden A003 açılmaz.

### A002 — doğrulanmış istemci düzeltmesi, 19 Ekim 18:51 sonrası

PR: https://github.com/yildizyayin/yildiz-sinav/pull/266
Branch: codex/a002-login-challenge-lifecycle
Head: 9d82358da62e473b37176f941a069b1a52f54266
Base main: fae0a48f346499363a07e2e9b56dbd9a5a48ff5a

Koddan ve gerçek React form testinden doğrulanan iki eksik: doğrulama yanıtı yokken form gönderilebiliyor; başarısız girişten sonra tek kullanımlık yanıt yeniden kullanılabiliyor. Yalnız Login.tsx değişti: buton ve submit koruması, tek gönderim kilidi, yanıtın bir kez tüketilmesi, hatadan sonra yeni widget ve kısa bekleme mesajı. İlgili iki UI testi ve app dağıtım tetikleyicisi eklendi. Backend/anahtar/izin/sonuc kaynakları değiştirilmedi.

Yerel kanıt: 214 dosya / 1.103 test PASS; typecheck PASS; build PASS. Eksik/sona ermiş yanıt, submit koruması, çift gönderim ve yeni yanıtla tekrar deneme çalıştırıldı. Cloudflare belgesi tek kullanımlık yanıtın 300 saniyede dolduğunu doğruluyor: https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/

GitHub kaynak kontrolleri açıldı. Henüz merge/production deploy yok. Bu kod eksikleri önceki canlı robot hatasının kesin nedeni olarak sunulmaz. A002 KAPANMADI; A003 açılmadı. Sıradaki adım kaynak CI → normal merge → korumalı production dağıtımı → gerçek giriş/çıkış ve rol kanıtı. Koruma veya CAPTCHA atlanmayacak.

Son kontrol: PR266 için CI run39281386949, Question Pool PR Preview run39281386991 ve sonuç sağlayıcı probu run39281386962 QUEUED; işler başlamadı. Bu bir kaynak test başarısızlığı veya production dağıtım onayı değildir. Kontrolleri atlayarak merge edilmedi. A002 açık kaldı.

### A002 — merge ve dağıtım, 19 Ekim 19:30 sonrası

PR #266 kontrolleri: CI run 39281386949 SUCCESS; Question Pool PR Preview run 39281386991 SUCCESS. Sonuç sağlayıcı probu run 39281386962 "Provision isolated R2 and Queue resources" adımında FAILURE. Aynı adım #265 ve öncesindeki PR'larda da başarısızdır; bilinen 100 Queue sınırına (S015) bağlıdır, A002 değişikliğiyle ilgisi yoktur. Kaynak silinmedi.

Elenen hipotez: `wrangler.production.jsonc` içinde Turnstile test site anahtarı (`1x00000000000000000000BB`) bulunuyor. Canlı `app.anunex.com/api/config` gerçek anahtar (`0x4AAA…`) sunduğundan production robot hatasının nedeni bu değildir. Repodaki test değeri not edildi, değiştirilmedi.

Kod incelemesi: site anahtarı boşsa Login düğmesi kilitli kalır; production'da `TURNSTILE_SECRET_KEY` yoksa backend zaten `TURNSTILE_NOT_CONFIGURED` döndürdüğünden bu davranış production için yeni bir engel değildir.

PR #266 `[app-only]` başlığıyla squash merge edildi: `84e93b88e0a2def1f9318cc3605d8dad1d56c0b4`. Main CI run 39286473789 SUCCESS. Deploy App Production Only run 39286473459, production ortam onayı kullanıcı (yildizyayin) tarafından 19:40 civarı verildi. Deploy Production Cloudflare Worker run 39286473576 `[app-only]` nedeniyle iş atlamalıdır.

A002 KAPANMADI. Sıradaki adım: dağıtım sonucu → çalışan sürüm → iki alan adının health kontrolü → gerçek giriş/çıkış ve altı rol kanıtı. A003 açılmadı.

Dağıtım sonucu: run 39286473459 — `dogrula` SUCCESS, `deploy-app-production` SUCCESS (başlangıç 16:39:30 UTC). Worker `yildiz-sinav-prod`. Sürüm kimliği deployment günlüğünde; bu oturumdan günlük indirme 403 verdiği için kayda alınamadı. 19:45 sonrası `app.anunex.com/api/health` ve `sonuc.anunex.com/api/health` → `{"ok":true,"status":"ready","environment":"production"}`.

Çalışma şekli kararı (19:43): kullanıcı sözleşmenin değişmeden sürmesini seçti — her iş production'da kapanmadan sıradakine geçilmez; testler ertelenmez.

Sıradaki adım: kullanıcının güvenli girişiyle altı rol için giriş → doğru panel → çıkış → yetkisiz URL denemesi. Şifre sohbette istenmez.
