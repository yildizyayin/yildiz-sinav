# ANUNEX — tek sıra iş takip kaydı

Sürüm: 6 · Açılış: 19 Ekim 2026, Türkiye saati.
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
8. Engel varsa iş **BEKLİYOR** olur; sebep, gereken kişi/ayar/veri ve son kontrol kaydedilir. Engeli atlayıp başka iş başlatılmaz. **Ek (kullanıcı kararı, 20 Ekim 17:58):** engel yalnız zaman bekleyen bir canlı ölçümse iş BEKLİYOR (ÖLÇÜM) işaretlenir ve sıradaki işe geçilir; ölçüm sonucu gelince o işe öncelikle dönülür. Hata, onay, karar veya veri bekleyen engellerde kural aynen geçerlidir.
9. Yeni hata önce aktif işe bağlı alt kayıt olarak açılır. Yeni ürün isteği ayrı değişiklik kaydıyla kuyruğun sonuna eklenir; mevcut numaralar veya kabul ölçütleri sessizce değiştirilmez.
10. Her kapanışta bu **aynı dosyanın yeni sürümü** kaydedilir. Yeni sohbetin ilk adımı bu kaydı okumaktır; yalnız sohbet hafızasına güvenilmez.

## Güncel durum — 19 Ekim 2026

- **A001: BİTTİ. A002: BİTTİ (kullanıcı kabulü, 19:49; rol kanıtı K002'de). A003: BİTTİ (19:51; panel ekranı K002'de). A004: BİTTİ (19:55; panel ekranı K002'de). A005: BİTTİ (20:55; panel ekranı K002'de). A006: BİTTİ (20 Ekim 10:12). A007: BİTTİ (10:20). A008: BİTTİ (10:59; canlı toplu onay K002'de). A009: BİTTİ (16:36). A081: BEKLİYOR (ÖLÇÜM — model karşılaştırması, 21 Ekim sabahı). A010: BİTTİ (18:05; canlı duraklat denemesi K002'de). A011: BİTTİ (18:10). A012: BİTTİ (18:10). A013: BEKLİYOR (VERİ — gerçek görselli soru örneği). A014: BEKLİYOR (VERİ+KARAR). A015: BİTTİ (18:15; canlı öğrenci denemesi K002'de). A016: BİTTİ (18:45; canlı belge oluşturma K002'de). A017: BEKLİYOR (dağıtım onayı + canlı PDF kanıtı). Aktif iş A018 — Studio kitapçık-optik bağı.** Diğer bütün işler sırada.
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

**Tek sıra:** A001–A009 → A081 (ölçüm bekliyor) → A010–A018 → A083 → A019–A079 → A082 → S001–S018 → K001 → K002 → A080 → D001–D007 → K003. (A081 kullanıcı kararıyla 19 Ekim 21:06'da, A082 20 Ekim 10:41'de B kararıyla A081'in arkasına alındı; 20 Ekim 17:58 A kararıyla genel işlerden sonraya, ihtiyaç olunca öne alınmak üzere taşındı.)

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
| A008 | Soru inceleme kararını kapat | İnsan ONAY/RET/DÜZELTME verir; çözüm ve hak denetimi kaydedilir; RESTRICTED soru öğrenciye açılmaz. **Ek (kullanıcı isteği, 19 Ekim 20:58):** tek tek ve hızlı toplu onay; toplu onayda her soruya ayrı onaylayan/zaman kaydı düşer, RESTRICTED sorular toplu onaya giremez. ("Şüpheli sorular üstte" 20 Ekim 10:41 kullanıcı kararıyla A081'e taşındı.) |
| A009 | Otonom zamanlayıcıyı kanıtla | Gerçek zamanlayıcı çağrısı yeni işi işler; tekrar çağrı kopya üretmez; kapasite/duraklatma kuralları uygulanır. |
| A010 | Ajan yönetim panelini kapat | Gerçek işler/sayılar/hatalar görünür; durdur-sürdür ve izinli manuel görev, kayıt geçmişiyle çalışır. |
| A011 | Soru kartı akademik bağlarını tamamla | Güncel kazanım, sınıf, sürüm ve doğrulanabilen ön öğrenmeler görünür; olmayan veri açıkça bilinmiyor gösterilir. |
| A012 | Çıkmış soru istatistiğini doğrula | Son beş yıl sayısı yalnız doğrulanmış veriyle hesaplanır; veri yoksa sıfır/olasılık uydurulmaz; tahmin resmî olasılık diye sunulmaz. |
| A013 | Soru görsel kalitesini kapat | Branşa uygun gerçek örneklerde yazı/veri/ölçek okunur ve çözümle tutarlıdır; güncel olay ve kişi görsellerinin hakları doğrulanır. |
| A014 | Gerçek soru video çözümünü kapat | Kaynak sürümüne bağlı video üretilir, açılır, insan/hak incelemesi kaydedilir; teknik test öğrenci videosu sayılmaz. **Ek (kullanıcı onayı, 20 Ekim 19:20):** basılı kitapçıkta soru başına karekod; karekod herkese açık video adresine değil, yetki ve izlenme kaydı tutan güvenli soru sayfasına gider. |
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
| A060 | Ödev takip akışını kapat | Öğretmen atar, öğrenci çözer/teslim eder, durum ve son tarih doğru görünür. **Ek (kullanıcı onayı, 20 Ekim 19:29):** öğrenci ödev sorularını çevrimiçi işaretler (ara kayıtla devam edebilir) ve teslim eder; teslimden önce cevap/çözüm/video asla görünmez; teslimden sonra soru soru kendi cevabı, doğru cevap, çözüm, video çözüm (A014) ve kazanım videosu (A067); yanlışlar "Yanlışlarım"a düşer (A059 girdisi); cevapların açılma zamanı varsayılan **son teslim tarihinden sonra**, öğretmen ödev bazında "teslimden hemen sonra" seçebilir; kâğıt+optik ödevde aynı inceleme optik okuma sonrası; öğretmen soru/kazanım bazında sınıf sonucu görür. Bulgu: sunucuda `/api/platform/foy/attempts` puanlama ucu var ama öğrenci çözme ekranı yok; teslim yalnız puan döndürüyor; sınav sonrası soru inceleme ekranı (StudentQuestionReview) yeniden kullanılabilir. |
| A061 | Yoklama akışını kapat | Yetkili kişi yoklama girer/düzeltir; öğrenci/veli kendi kaydını görür; geçmiş korunur. |
| A062 | Mini oyun öğrenme kaydını kapat | Oyun çalışır; istemcinin yolladığı keyfî skor akademik başarı sayılmaz; güvenilir kazanım kanıtı ayrılır. |
| A063 | Panel takvimini kapat | Rolün kendi sınav/ödev/föy/randevu/görevleri tarih ve yetkiyle görünür; saat dilimi ve çakışma açıktır. |
| A064 | Rehberlik RBA akışını kapat | Yetkili rehber test/yanıt/değerlendirme sürecini tamamlar; hassas kayıt ve veli görünürlüğü sınırlandırılır. |
| A065 | Nibiru rol tabanlı yardımını kapat | Öğrenci/veli/öğretmen/kurum kendi kapsamındaki veriyle yanıt alır; veri olmayan yerde uydurma cevap verilmez. |
| A066 | Nibiru ses akışını kapat | Mikrofon/yazı/sesli yanıt gerçek örnekte çalışır; sağlayıcı hatası görünür; ücretli ses izinsiz açılmaz. |
| A067 | YouTube kaynak bağını kapat | Kazanım/soruya uygun yetkili video bağlantısı açılır; bağlantı ve içerik kaynağı kontrol edilir. **Ek (20 Ekim 19:20):** kazanım videosu soru/kazanım sayfasından ve karekod sayfasından açılabilir. |
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
| A078 | Mobil/PWA/tahta erişimini kapat | Ana iş akışları hedef cihazlarda okunur/tıklanır; fiziksel kitap bağlantıları doğru içeriğe gider. **Ek (20 Ekim 19:20):** etkileşimli akıllı tahta / z-kitap modu — soru soru tam ekran, kalem, şıkları ve cevabı göster/gizle, çözüm videosunu tahtada oynatma; yazdırılan kitapçıkla aynı soru verisi. |
| A079 | app güvenlik ve veri yaşam döngüsünü kapat | Rol/tenant izolasyonu, oturum iptali, dosya erişimi ve süreli veri temizliği kanıtlanır; gerekli kalıcı kimlikler silinmez. |
| A081 | Ölçekli soru üretimini kapat (değişiklik kaydı, 19 Ekim 21:04; 20 Ekim 10:09 güncelleme: hedef sabit sayı değil, kalite kapısı gevşetilmeden sürdürülebilen azami hız; bağımsız kontrol geçiş oranı ve insan onay oranı düşerse hız düşer; yalnız 2027–2028 resmî MEB kazanımı) | İlk hedef: günde 5.000–10.000 soru, 31 Aralık 2026'ya kadar 300.000–500.000 soru, 2027–2028 Maarif 5–12. sınıf. Paralel üretim, Queue sınırı (S015 ile ortak) çözümü, kazanım başına sınırın kontrollü yükseltilmesi ve benzer-soru filtresi; A007'de ölçülen soru başına maliyetle onaylı bütçe. Ölçüm yoksa hazır denmez; insan onayı otomatik verilmez. **Ek (20 Ekim 10:41, A008'den taşındı):** bağımsız kontrol bulguları saklanır ve toplu onay ekranında şüpheli sorular üstte gösterilir; A007'deki kaçırılmış bilimsel hata sınıfı için olgusal doğruluk kontrolü. |
| A082 | Dışarıdan toplu soru aktarımını kapat (değişiklik kaydı, 20 Ekim 10:09) | Süper Admin Excel/CSV/JSON ile toplu yükler; önizleme ve satır bazlı hata listesi; her soru 2027–2028 resmî kazanım koduna bağlanmak zorunda (bulunamayan/yanlış sınıf reddedilir); kaynak etiketi zorunlu (ör. Claude, yayınevi, öğretmen); dışarıdan gelen her soru REVIEW kuyruğuna düşer ve A008 toplu onay ekranında görünür; tekrar yükleme kopya üretmez; benzer soru uyarısı. Sıra: kullanıcı kararı B (20 Ekim 10:41) → A009 → A081 → A082. |
| A083 | Studio test oluşturma deneyimini kapat (değişiklik kaydı, kullanıcı onayı 20 Ekim 19:20) | MEB/Maarif seçimi; sınıf → ders → ünite → konu → kazanım aşamalı seçim (kod yazmadan); her kazanımda onaylı soru stoku görünür ve yetersizlik oluşturmadan önce uyarılır; zorluk karışımı yüzde olarak (ölçülmüş zorluk varsa onunla, yoksa editoryal tahmin olduğu açıkça yazılır); şablonlar (konu tarama, deneme, ödev, telafi) kaydedilebilir; önizlemede soru değiştirme aynı kazanımdan yapılır; test kütüphanesi kart görünümü, Testlerim/Favoriler ve ders filtreleri; optik okuma soru sınırı açıkça gösterilir. Görsel tasarım D001'de. |
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

### A002 kapanışı — 19 Ekim 19:49

Durum: BİTTİ — **kullanıcı kabulüyle**. Kullanıcı "A002 bitmiş olmalı, A003'e geç" kararını verdi. Kod, test, merge ve production dağıtımı kanıtlı; iki alan adının health'i ready. Altı rolün tek tek giriş/panel/yetkisiz URL/çıkış kanıtı bu kayıtta **yoktur**; K002 son regresyonunda zorunlu olarak yeniden doğrulanacak.
Not: Production D1 okuması bu oturumda güvenlik sınıflandırıcısınca engellendi; engelden önce geçen tek salt-okuma toplam sorgusu `yildiz-sinav-v1-db` içinde altı rolün her birinde aktif hesap olduğunu gösterdi (kişisel alan okunmadı). Canlı Worker'ın bağlı olduğu D1'in hangisi olduğu doğrulanmadı.
Sıradaki ID: A003 — AKTİF.

### A003 kapanışı — 19 Ekim 19:51

Durum: BİTTİ — değişikliksiz, madde 4'e göre mevcut güncel kanıtla; kullanıcı canlı panel kontrolünü beklemeden ilerleme talimatı verdi.
Kanıt: main `84e93b8` üzerinde ilgili 4 test dosyası / 47 test PASS (`question-agent-dispatch-plan`, `question-agent-pilot-budget`, `question-runtime-readiness`, `question-team`).
- UNLIMITED görünür: `worker/lib/question-team.ts` `budget.mode=UNLIMITED, cap=null`; `QuestionTeam.tsx` "Sınırsız" gösterir.
- Eski tüketim korunur: migration testi tüketimi değiştirmeden taşır; sınırsız mod ömür boyu tüketimi sıfırlamaz.
- İptal iade etmez: `noRefund:true`; başarısız işler iade edilmez testi.
- Görev/inceleme sınırları: iş başına 10, sınırsız modda dağıtım başına 50; inceleme kapasitesi yoksa dağıtım reddedilir.
Canlı kanıt: 19 Ekim 18:29 production dağıtım günlüğü UNLIMITED, cap null, rezervasyon 0, tarihsel cap 50 (A001 kaydı).
Eksik: Süper Admin `/question-team` canlı ekran kanıtı alınmadı → K002 kontrol listesine eklendi.
Kod/ayar değişmedi; diğer alan adı etkilenmedi.
Sıradaki ID: A004 — AKTİF.

### A004 kapanışı — 19 Ekim 19:55

Durum: BİTTİ — değişikliksiz, madde 4'e göre mevcut güncel kanıtla.
Kaynak kaydı: `data/app-question-scope-2028.json` → 2027–2028, 77 program, 2.916 çıktı, 2 engelli kapsam: TUR 5. sınıf `CONFLICTING_THEME_CODE:T.O.5.20`; DİN 12. sınıf `EMPTY_OUTCOME_SECTION`. Engelliler `sourceIssues` olarak panelde ayrı gösterilir.
Doğrulama kuralı: `worker/lib/question-branch-readiness.ts` her program için yıl/sınıf/program sürümü, MEB yetkisi, `verified=1` ve aynı kaynak URL'si; her çıktı için ders/sınıf, `active`, `official` ve aynı yıl/sınıftaki aktif öğrenme düğümü eşleşmesini arar; sayı birebir tutmazsa "aktarılmadı" der.
Test: `question-branch-readiness`, `curriculum-import`, `curriculum-publication-acceptance` 3 dosya / 28 test PASS; kaynak parmak izi node testi PASS.
Canlı kanıt: 19 Ekim 18:29 production dağıtım günlüğü 388 resmî kaynağın yeniden doğrulandığını ve 77 kapsam / 2.916 çıktının aktarıldığını gösterir (A001 kaydı).
Eksik: Süper Admin branş kapsamı ekranının canlı görüntüsü alınmadı → K002 kontrol listesi.
Kod/ayar değişmedi.
Sıradaki ID: A005 — AKTİF.

### A005 kapanışı — 19 Ekim 20:55

Durum: BİTTİ. Kullanıcı 19:58'de önerilen A seçeneğini ("devam edelim") onayladı.
Önceki durum: production'da `QUESTION_AGENT_SERVICE_ACTOR_ID` tanımlı değildi; panel "servis aktörü doğrulanmadı" gösteriyordu.
Değişiklik — PR #268, merge `ffbc8f95b5bb01e0ad57eb444c290faacd59a255` (kullanıcı tarafından squash merge; otomatik merge sınıflandırıcıca engellendi):
- `migrations/0115_question_agent_service_actor.sql`: `svc-soru-ajani` SUPER_ADMIN servis hesabı; rastgele, bilinmeyen şifre malzemesi; `INSERT OR IGNORE` (sonradan pasifleştirme korunur).
- `worker/lib/auth.ts`, `worker/index.ts`: `svc-` önekli hesaplar login, `createSession` ve `getAuthUser` katmanlarında reddedilir (genel INVALID_CREDENTIALS). app ve sonuc aynı yolu kullanır.
- `wrangler.production.jsonc`: `QUESTION_AGENT_SERVICE_ACTOR_ID=svc-soru-ajani`.
Etkilenmemesi gerekenler: insan girişleri (sentetik insan admin testi geçer), sonuc akışları, kota/inceleme sınırları. İnceleme kapasitesi 0 olduğundan üretim başlamaz.
Test: 4 yeni test, mutasyon kontrollü (koruma kaldırılınca 2 test kırıldı). Tüm paket 215 dosya / 1.107 test PASS; typecheck ve build PASS. PR CI run 39290996606 SUCCESS.
Dağıtım: Deploy App Production Only run 39291874533 SUCCESS — "Apply production D1 migrations", "Read-only production smoke acceptance", "Verify super admin question scope deployment" SUCCESS. Genel production akışı 39291874590 `[app-only]` nedeniyle SKIPPED. Main CI 39291874514 SUCCESS.
Canlı: 20:55 sonrası app ve sonuc `/api/health` → ready/production.
Bilinen ilgisiz: Result Provider Isolation Probe (staging ortamı kaydı) Queue sınırı nedeniyle FAILURE — S015.
Geri dönüş: Kullanıcılar ekranından `svc-soru-ajani` pasifleştirilir (zamanlayıcı anında durur) veya ayar kaldırılıp yeniden dağıtılır; migration veri silmez.
Eksik: Süper Admin `/question-team` ekranında "servis aktörü doğrulandı" görüntüsü alınmadı → K002 kontrol listesi.
Sıradaki ID: A006 — AKTİF.

### A006 — BEKLİYOR, 19 Ekim 20:56

Kabul ölçütü: gerçek sorumlu ve sürdürülebilir kapasite belirlenir; sıfır/dolu kuyruk üretimi durdurur; kapasite uydurulmaz.
Mevcut durum (kod): kapasite `QUESTION_PILOT_REVIEW_AVAILABLE` (true/false) ve `QUESTION_PILOT_REVIEW_SLOTS` (kuyrukta aynı anda bekleyebilecek soru) ile yönetilir; production'da ikisi de tanımsız → inceleme kapalı, kapasite 0, ajan üretmez (doğru davranış). Paket 10 soru olduğundan hazır olma için en az 10 slot gerekir; kuyruk dolunca `REVIEW_QUEUE_FULL` ile durur.
Engel: inceleyici kişi/rol, haftalık gerçekçi inceleme sayısı ve başlangıç branş/sınıf kapsamı kullanıcıdan gelmedi. Kullanıcı "devam" dedi; değerler uydurulmadı.
Önerilen varsayılan (kullanıcı onayı bekliyor): inceleyici yildizyayin (Süper Admin), 10 slot, başlangıç 8. sınıf matematik.
Not: kapasite açılınca model maliyeti başlar; bütçe UNLIMITED olduğundan tek fren inceleme kapasitesidir.
Sıradaki iş açılmadı.

### A006 — kararlar, 19 Ekim 20:58–21:06

Kullanıcı kararları: inceleyici yildizyayin; toplu + tek tek onay (A008'e eklendi); kuyruk sınırı 10.000; kapsam 2027–2028 yeni Maarif, 5–12. sınıfların tamamı (LGS 8, YKS 12 dahil; 1–4. sınıf kayıtta yok); hedef günde 5–10 bin / aralık sonuna 300–500 bin soru → A081 olarak A009'un arkasına alındı.
Kontrol: `data/app-question-scope-2028.json` 8. sınıf 6 ders / 391 çıktı, 12. sınıf 11 ders / 333 çıktı içerir (A004'te aktarıldı). 8 ve 12'yi dışlayan tek neden koddaki sabit sınıf listesiydi.
Uyarı kaydı: kullanıcıya günde binlerce sorunun bir saatte incelenmesinin soru başına ~1 saniye ettiği ve kalite riski açıkça bildirildi; kullanıcı onay sorumluluğunu üstlendi. Soru başına onay kaydı ve RESTRICTED kapısı korunur.
PR #269: `QUESTION_PILOT_REVIEW_AVAILABLE=true`, `QUESTION_PILOT_REVIEW_SLOTS=10000`; pilot sınıflar `PILOT_GRADES` 5–12 tek sabitte. 1.110 test, typecheck, build PASS. Dağıtım sonrası zamanlayıcı 15 dakikada 1 soru üretir; otomatik onay yok.

### A006 — dağıtım, 20 Ekim 09:54

PR #269 merge `f7bfcafa8fbcd710465ea302466c798884f3eaed` (kullanıcı, 19 Ekim 21:24). Deploy App Production Only run 39302449287: kullanıcı onayı 20 Ekim sabahı; SUCCESS 06:54 UTC. Adımlar: migrations, read-only smoke, Süper Admin kapsam doğrulaması, müfredat/kota adımı, "Inspect question runtime without provider calls or data changes" SUCCESS. Genel akış 39302449185 SKIPPED (`[app-only]`). 09:57 sonrası app ve sonuc health ready/production.
Kapanış için eksik: Süper Admin `/question-team` ekranında inceleme açık, kapasite 10.000, servis aktörü doğrulandı ve zamanlayıcı hazır görüntüsü; ilk 15 dakikalık zamanlayıcı turunda kuyruğa giren soru. Bu oturumdan dağıtım günlüğü indirme ve production D1 okuması engelli olduğundan kanıt kullanıcı ekranından alınacak.

### A006 kapanışı — 20 Ekim 10:12

Durum: BİTTİ. Kullanıcı Süper Admin `/question-team` ekranı (10:12): "Otomatik soru yürütme · 2027-2028: Açık. Zamanlayıcı koşulları uygun. İncelemede 0 soru; kalan kuyruk kapasitesi 10000." Engel nedeni yok (servis aktörü doğrulandı → A005 eksik panel kanıtı da tamamlandı). Görev tablosu: Soru üretimi `@cf/zai-org/glm-4.7-flash` Çalışıyor, 1 aktif iş; Bilimsel/editoryal kontrol `@cf/nvidia/nemotron-3-120b-a12b` Hazır; özgünlük/hak kontrolü insan incelemesine destek.
10:00 ekranı: Üretim kotası Sınırsız, 0 rezerve → A003 eksik panel kanıtı tamamlandı.
Kod bulgusu: zamanlayıcı bir turda iş açar, sonraki turda çalıştırır → 30 dakikada 1 soru, günde ~48. A081 için temel ölçüm.
Mevcut manuel ekleme bulgusu (A082 gerekçesi): Studio'da tekil ekleme var; toplu aktarım yok; kazanım bağlantısı zorunlu değil; OWNED telifli manuel soru incelemesiz APPROVED oluyor.
Sıradaki ID: A007 — AKTİF (ilk soru üretimde).

### A007 kapanışı — 20 Ekim 10:20

Durum: BİTTİ. Kanıt kullanıcı ekranlarından (10:16, 10:19):
- Otonom zamanlayıcı (servis aktörü `svc-soru-ajani`) 2027–2028 doğrulanmış çıktı seçti: iş `qgj_d06865a7-d4b4-4beb-96f0-594a8964f188`, DKAB.5.1.3 "Allah'ın (cc) güzel isimleri hakkında bilgi toplayabilme", Editoryal V1, 1/1 taslak, 1/3 deneme → "Taslaklar hazır".
- Soru `q_0c622500-5d9e-4466-8eee-eb658a8f5563` kalıcı inceleme listesinde (content-center), 4 seçenekli, cevap işaretli, kazanım ve sürüm geçmişi paneliyle.
- Sonraki iş `qgj_4d984341-…` DKAB.5.5.3 kuyrukta (zamanlayıcı bir turda açar, sonraki turda çalıştırır).
Not: madde 7 gereği kabul ölçütündeki "Süper Admin seçer" adımı otonom akışta servis aktörüyle karşılandı; manuel görev ekranı (Görevi kaydet) mevcut, ayrıca kullanılmadı.

**Kalite bulgusu (A008 ve A081 girdisi):** soru kökü "ağaçtan düşen yaprağın her zaman belirli bir açıyla ve belirli bir noktada yere indiği" gözlemine dayanıyor — bilimsel olarak yanlış (yaprak düşüşü düzensizdir) ve Fen ile çelişir. Kazanım "bilgi toplayabilme" iken soru yorumlatıyor (kısmi uyum). Hata bağımsız kontrol modelinden (`nemotron-3-120b-a12b`) geçti → otomatik kontrol bilimsel doğruluk hatasını kaçırabiliyor. Öneri: RET veya DÜZELTME (ör. mevsimlerin düzenli döngüsü). İnsan kararı A008'de verilecek. A081'de ölçekleme öncesi bu tür hatalar için ek kontrol (alanlar arası olgusal doğruluk) değerlendirilecek.
Ekran ölçeği nedeniyle seçenek metinleri ve kontrol notları okunamadı.
Sıradaki ID: A008 — AKTİF.

### A008 — PR hazır, 20 Ekim

Önceki durum: tekil onay var ve sağlam (sürüm/kazanım bağlamı fence, RESTRICTED engeli, şık/cevap ve medya bütünlüğü); her AI onayı için 3 gerekçe (20–1000 karakter) soru başına zorunlu → yavaş. Toplu seçim yok.
PR #270 (CI run 39387246365 SUCCESS): `POST /api/question-bank-standard/review-batch` (Süper Admin, istek başına ≤50; APPROVED/REJECTED(not zorunlu)/DRAFT). Her öğe değişmemiş tekil kapıdan geçer; her soruya `reviewed_by/reviewed_at` ve `review_checks_json.review={mode:BATCH,batchId}` yazılır. Soru listesinde seçim kutusu, tümünü seç, toplu işlem başına bir kez kontrol listesi/gerekçe, 50'lik parçalı gönderim, işlenmeyenler nedenleriyle. Tekil ekran değişmedi.
Test: 5 API + 4 UI (mutasyon kontrollü); 217 dosya / 1.119 test, typecheck, build PASS.
Açık karar: "şüpheli sorular üstte" — bağımsız kontrol geçen sorular için bulgu saklamıyor; kullanıcıya A008 alt kaydı mı, A081'e taşıma mı soruldu.
Kapanış için kalan: merge → production dağıtımı → kullanıcının gerçek ekranda toplu ve tekil karar kanıtı (ör. A007 sorusu `q_0c622500-…` RET/DÜZELTME).

### Kullanıcı kararları — 20 Ekim 10:41

"B DEVAM ET": (1) "şüpheli sorular üstte" A008'den A081'e taşındı; A008 kabul ölçütü buna göre güncellendi. (2) Sıra A009 → A081 → A082.

### A008 — dağıtım, 20 Ekim 10:55

PR #270 merge `92e570e4c5bcf030b2363a20b87a19563ad5992c` (kullanıcı). Deploy App Production Only run 39389265147 SUCCESS 07:55 UTC (Verify release, Deploy, D1 migrations, read-only smoke, Süper Admin kapsam doğrulaması). 10:56 sonrası app ve sonuc health ready/production.
Kapanış için kalan: kullanıcının gerçek ekranda tekil/toplu RET veya DÜZELTME (A007 sorusu) ve toplu ONAY kanıtı.
Açık öneri (kullanıcı kararı bekliyor): A009 → A081 sonrası genel işlere (A010…) geçmek; A082 ihtiyaç olunca öne alınır.

### A008 kapanışı — 20 Ekim 10:59

Durum: BİTTİ. Kullanıcı ekranı (10:58, content-center): "Hızlı inceleme" paneli canlıda; A007 sorusu `q_0c622500-…` insan kararıyla **Reddedildi** (RESTRICTED değil; öğrenciye açılmaz). Sayaçlar: toplam 13, onaylı 12, kitapta kullanılabilir 12.
Seçenekler okundu: A "rastgele oluştuğunu…", B "yaprağın düşüşünü sadece rüzgârın etkisiyle açıklamak", C (doğru) "en doğru, en faydalı ve en güzel şekilde yaratıldığını…", D "tamamen tesadüfe atıf". **Ek bulgu (A081):** B bilimsel olarak doğru bir açıklama olduğu hâlde çeldirici yapılmış; din-fen alanları arası çelişki. Olgusal doğruluk kontrolüne örnek vaka.
Toplu işlemler API+UI testleriyle kanıtlı; canlı toplu ONAY incelemede soru olmadığından yapılamadı → K002 kontrol listesi.
**A009 girdisi:** 10:15–10:58 arasında yeni AI sorusu görünmüyor (toplam 13 = 12 eski onaylı + 1 reddedilen). Kuyruktaki DKAB.5.5.3 işi 10:45'e kadar üretilmiş olmalıydı.
Sıradaki ID: A009 — AKTİF.

### A009 — hata kaydı ve düzeltme PR'ı, 20 Ekim 11:01–11:20

Gözlem (kullanıcı ekranı 11:01): DKAB.5.5.3 işi `qgj_4d984341-…` 45+ dakikadır "Kuyrukta", 0/3 deneme; 10:15'ten beri yeni AI sorusu yok.
Kök neden (koddan; production günlüğü/D1 okunamadı): (1) zamanlayıcı rezervasyonu yazıp iş üstlenilmeden dönerse sonraki turlarda `INSERT OR IGNORE` 0 satır → "skipped" → kalıcı duruş, kuyrukta iş olduğu için yeni iş de açılmaz; (2) süresi dolmuş RUNNING iş kuyruk tamamlayıcısını kalıcı engeller; (3) tur sonucu görünmediği için duruş sessizdi.
PR #271 (CI run 39391258185 SUCCESS): `reserveScheduledJob` (rezerve edilmiş ama üstlenilmemiş iş mevcut rezervasyonla devam eder; tetikleyici çift saymaz; claim çift çalıştırmayı önler); `PENDING_JOB_SQL` (yalnız kuyruktaki/canlı kiralı iş bekleyen sayılır); runner istisnası yakalanır; migration 0116 `question_scheduler_status` ve panelde "Son tur" satırı. 5 yeni test (mutasyon kontrollü), 218 dosya / 1.124 test, typecheck, build PASS.
Kapanış için kalan: merge → dağıtım → panelde "Son tur … bir soru üretim işi çalıştırıldı" ve DKAB.5.5.3'ün "Taslaklar hazır" olması; ardından birkaç turda yeni işlerin kopyasız ilerlediğinin görülmesi.

### A009 — ara gözlem ve dağıtım, 20 Ekim 11:24–16:19

Düzeltme öncesi kullanıcı ekranı (11:24): DKAB.5.5.3 sonunda çalıştı → 1/3 deneme, **Hata GENERATION_OUTPUT_INVALID** (model çıktısı doğrulamadan geçmedi; kalite kapısı çalışıyor). Yeni iş DKAB.5.5.2 `qgj_dc5db16f-…` kuyrukta. Yani o gecikme kalıcı kilitlenme değildi; gecikmenin kesin nedeni kanıtlanamadı. Koddaki iki kilitlenme açığı yine de gerçektir ve düzeltildi; "Son tur" satırı bundan sonra nedeni gösterecek.
A081 girdisi: başarısız iş (FAILED) kazanımı otomatik yeniden denenmez (kuyruk tamamlayıcı FAILED kazanımları dışlar); ölçekte başarısızlık oranı ve yeniden deneme politikası ele alınmalı.
PR #271 merge `618caf3e0ac8418e152787e5d9fa3f9b02bedc0f` (08:24 UTC). Deploy App Production Only run 39393190947: kullanıcı onayı 16:16 civarı; SUCCESS 13:18 UTC (Deploy, D1 migrations — 0116 dahil, read-only smoke). 16:20 app ve sonuc health ready/production.
Kapanış için kalan: panelde "Son tur" satırı ve birkaç tur boyunca işlerin kopyasız ilerlediği.

### A009 kapanışı — 20 Ekim 16:36

Durum: BİTTİ. Kanıt (kullanıcı ekranları): 16:20'de (düzeltme 16:18'de canlı) DKAB.5.5.2 `qgj_dc5db16f-…` ~5 saattir Kuyrukta, 0/3 deneme → kilitlenme production'da yaşandı. Düzeltme sonrası ilk tur (16:30) işi çalıştırdı: 16:36'da 1/3 deneme, **Hata GENERATION_QUALITY_REJECTED** (bağımsız kalite kontrolü reddetti). Her işte tek deneme; kopya iş/soru yok. Kapasite/duraklatma kuralları testlerle (A005/A006/A009) kanıtlı.
**A081 girdisi — verim:** ilk 3 otonom iş: 1 taslak (insan incelemesinde bilimsel hata nedeniyle RET), 1 GENERATION_OUTPUT_INVALID, 1 GENERATION_QUALITY_REJECTED → kabul edilen soru 0/3. Üretici `@cf/zai-org/glm-4.7-flash`, kontrol `@cf/nvidia/nemotron-3-120b-a12b`. Ölçeklemeden önce üretici kalitesi/verimi iyileştirilmeli; başarısız kazanımlar otomatik yeniden denenmiyor.
Sıradaki ID: A081 — AKTİF.

### A081 — 1. aşama PR'ı, 20 Ekim 16:38–17:20

Kullanıcı kararı (16:38 "devam"): güçlü modelle karşılaştırma ve model başına ~20 iş onaylandı.
PR #272 (CI run 39434454267 SUCCESS): işler `glm-4.7-flash` ve `gpt-oss-120b` arasında belirlenimli bölünür (izin listesi; kontrol modeli kendini değerlendiremez); kullanılan model işe yazılır (migration 0117; dağıtım Worker'ı migration'dan önce yayınladığı için kayıt hatası üretimi durdurmaz); üretici ve kontrol modeline alanlar arası olgusal doğruluk kuralı (yaprak örneği); zamanlayıcı yeni işi aynı turda çalıştırır (15 dakikada 1); panelde model karşılaştırma tablosu. 219 dosya / 1.129 test, typecheck, build PASS.
Ölçüt (kullanıcıya sunulacak): model başına ~20 biten iş sonrası kontrol geçme oranı, insan onay oranı ve gerçekleşen maliyet; seçilen model ile 2. aşamaya (paralel üretim, kuyruk altyapısı, S015) geçilir. Şüpheli sıralama ve başarısız kazanımları yeniden deneme bu aşamada henüz yok.

### A081 — 1. aşama canlıda, 20 Ekim 17:19

PR #272 merge `1086e4e1466f8b33403605aa0c7130be177cd732` (kullanıcı, 17:01). Deploy App Production Only run 39435511265 SUCCESS 14:19 UTC (Deploy, D1 migrations — 0117 dahil, read-only smoke). 17:42 app ve sonuc health ready/production.
Ölçüm dönemi başladı: 15 dakikada 1 iş, modeller sırayla. Karar noktası: model başına ~20 biten iş (yaklaşık 21 Ekim sabahı) → kullanıcı panel tablosu ve gerçekleşen maliyetle model seçimi → 2. aşama.

### A081 — inceleme sinyalleri ve yeniden deneme PR'ı, 20 Ekim 18:10

PR #273 (CI run 39442757663 SUCCESS): denetim kaydında zaten saklanan bağımsız kontrol puanları (6 boyut × 0–4) Süper Admin soru listesine taşındı; incelemedeki sorular en zayıftan güçlüye sıralanır (kapatılabilir), 3+ puan eksikte "şüpheli" etiketi; başarısız kazanım 3 başarısızlığa kadar yeni işle yeniden denenir, denenmemiş kazanımlar önce gelir. 9 yeni test; 221 dosya / 1.134 test, typecheck, build PASS. Şema değişikliği yok.
A081'de kalan: model seçimi (ölçüm sonucu, kullanıcı kararı) → 2. aşama paralel üretim ve kuyruk altyapısı (S015 Queue sınırı) → hedef hız ölçümü.

### Kullanıcı kararı — 20 Ekim 17:58 (A)

Madde 8'e zaman bekleyen ölçüm istisnası eklendi. A081 BEKLİYOR (ÖLÇÜM): PR #272 karşılaştırması 17:19'da başladı, PR #273 (inceleme sinyalleri/yeniden deneme) merge edildi, dağıtım onayı bekliyor. Ölçüm sonucu gelince A081'e öncelikle dönülür (model seçimi → paralel üretim). A082 genel işlerden sonraya alındı (ihtiyaç olunca öne alınabilir). Aktif iş: A010.

### A010 kapanışı — 20 Ekim 18:05

Durum: BİTTİ — değişikliksiz, madde 4 (yeterli güncel kanıt).
Canlı kanıt (kullanıcı ekranları 20 Ekim 10:12–16:36): `/question-team` görev tablosu (model, durum, aktif iş, Duraklat), "Otomatik soru yürütme" satırı, Son 50 üretim işi tablosu gerçek durum/hata kodlarıyla (GENERATION_OUTPUT_INVALID, GENERATION_QUALITY_REJECTED), deneme sayıları, Çalıştır/İptal/Paketi düzelt işlemleri, Görevi kaydet formu.
Test kanıtı (main `735eabe`): `question-team` (sürüme bağlı duraklatma, eski kontrol reddi, değiştirilemez olay kaydı, eksik kontrolde kapalı başarısızlık, sürdürmenin otomatik yürütmeyi açmaması, gerçek kapasite/kuyruk), `question-team-ui` (rol kapısı, sürüme bağlı duraklat), `question-generation-jobs` (değiştirilemez manuel istek, idempotent tekrar, odak/öncelik bağlama, rol reddi), `question-task-focus` → 5 dosya / 17 test PASS. A009 ile "Son tur" satırı, A081 ile model karşılaştırması eklendi.
Eksik: canlı duraklat→sürdür denemesi (model ölçümünü bölmemek için) → K002.
Sıradaki ID: A011 — AKTİF.

### A011 kapanışı — 20 Ekim 18:10

Durum: BİTTİ — değişikliksiz, madde 4. `QuestionCardIntelligence` + `worker/lib/question-card-intelligence.ts`: doğrulanmış kazanım kodu/başlığı, sınıf, program sürümü ve resmî kaynak bağlantısı; ön öğrenme yoksa "henüz eklenmemiş" + not; zorluk "editoryal tahmin, ölçülmüş zorluk yok"; "Boş alanlar tahminle doldurulmaz". Canlı: kullanıcı ekranı 20 Ekim 10:19 (`content-center?questionId=q_0c622500-…`) bölümler görünür. Test: `question-card-intelligence` (doğrulanmış bağlamı tam okur, yokluk/sıfır ayrımı), `question-card-intelligence-ui` (eski yanıt gösterilmez, hata açık) → 3 test PASS.
Sıradaki ID: A012.

### A012 kapanışı — 20 Ekim 18:10

Durum: BİTTİ — değişikliksiz, madde 4. Aynı kart: son beş yıl yalnız doğrulanmış ve pencere içi kayıtlardan; açık doğrulanmış yıllar arası eşdeğerlik dışında eşleştirme yok; kayıt yoksa "Veri yok"/"doğrulanmış kayıt yok" (sıfır değil); olasılık için yüzde üretilmez, eski manuel olasılık iddiaları tahmin sayılmaz. Canlı: 10:19 ekranında LGS/YKS "Veri yok". Test: "counts only in-window verified facts and explicit verified cross-year equivalences; enforces role" PASS.
Sıradaki ID: A013 — AKTİF.

### A013 — BEKLİYOR (VERİ), 20 Ekim 18:15

Kabul ölçütü "branşa uygun gerçek örnekler" gerektirir. Kod/test: tablo/sütun grafik vektör, sıfır tabanlı, tam etiketli (`question-data-visual` 3 test); kontrol modeli görsel tutarlılığı puanlar. Gerçek görselli soru örneği henüz yok (bugünkü AI soruları metin; 12 eski onaylı sorunun görsel durumu bilinmiyor, kullanıcıdan ekran istendi). Genel fotoğraf/kişi/olay görseli üretimi yok; bu tür görseller yalnız manuel yüklemeyle gelir ve telif alanına bağlıdır — hak doğrulama örneği de bekleniyor.
Kullanıcı talimatı (18:03 "sıradaki işi yap") ile madde 8 için açık onay: A013 bekletildi, A014'e geçildi. Gerçek görselli örnek gelince A013'e dönülür.

### A014 — BEKLİYOR (VERİ+KARAR), 20 Ekim 18:06

Bulgu: otonom video `prepareAutonomousQuestionVideo` üç nedenle çalışmıyor: (1) seslendirme ücretli sağlayıcıya bağlı, `NIBIRU_PAID_VOICE_ENABLED` production'da açık değil → NARRATION_PROVIDER_NOT_ENABLED; (2) 2027–2028 onaylı AI kaynağı yok → NO_APPROVED_SOURCE; (3) "Question video render production" iş akışı `vars.QUESTION_PRODUCTION_VIDEO_AUTOMATION` kapalı olduğu için zamanlanmış çalışmalarda SKIPPED (workflow_dispatch ile elle çalışabilir). Ücretsiz CAPTIONS (altyazılı) mod manuel istekte mevcut.
Kullanıcı kararı (18:06 "B"): A014 bekletildi; kanıt için onaylı 2027–2028 sorusu ve ses/ücret kararı beklenir (ücretli ses kararı A066 ile ortak). Önerilen ücretsiz kanıt yolu: onaylı bir soru için altyazılı video + render iş akışını elle çalıştırma.
Sıradaki ID: A015 — AKTİF.

### A015 kapanışı — 20 Ekim 18:15

Durum: BİTTİ — değişikliksiz, madde 4.
- Görülen soru engeli: `eligibleCoachMiniTestQuestions(...,'NEW')` yalnız yeni, doğrulanmış, kendi kurum kapsamındaki soruları seçer; görülenler yalnız 'REPEAT' modunda (test "selects only new verified current tenant questions and permits seen questions only in repeat mode").
- Açık tekrar ve bilgilendirme: `CoachPlanCard`/`OutcomeMiniTestCatalog` tekrar için onay kutusu zorunlu; "Bu test daha önce gördüğün soruları içerir. Sonuç tekrar çalışması olarak kaydedilir."; tekrar puanı ustalık/ödev tamamlamaya sayılmaz (test).
- Yetersizlik: "Yeni soru bekleniyor / Tekrar için yeterli soru yok — N uygun soru bulundu; en az M gerekiyor" (`NEW_QUESTIONS_REQUIRED`).
Test: coach-mini-test-selection, mini-test-catalog, mini-test-list, mini-test-novelty-migration, coach-mini-frozen-evidence, coach-mini-atomic-submission → 6 dosya / 14 test PASS.
Eksik: canlı öğrenci hesabıyla deneme (test öğrencisi yok) → K002.
Sıradaki ID: A016 — AKTİF.

### A016 — güvenlik açığı ve düzeltme PR'ı, 20 Ekim 18:40

Önceki durum: onay+telif filtresi, sınıf/ders filtresi, eksik stokta belge oluşturmama vardı. Bulgu: **Studio seçimi sorunun sahibine bakmıyordu** — kurum X kitapçığı kurum Y'nin özel sorularını içerebiliyor, soru kimliğiyle doğrudan istenebiliyordu (soru listesinde filtre var, Studio'da yok). Kazanım kapsamı ve yıl filtresi yoktu; Studio seçimi için test yoktu.
PR #274 (CI run 39446697639 SUCCESS): seçim her zaman platform + yalnız ilgili kurumun soruları; isteğe bağlı eğitim yılı ve ≤30 doğrulanmış kazanım kodu (bilinmeyen kodlar hata mesajında); Studio formuna alanlar. 3 yeni test (kurum filtresi mutasyon kontrollü), 222 dosya / 1.137 test, typecheck, build PASS.
Not (ayrı alt kayıt adayı): `questionIds` ile 200'e kadar kimlik tek sorguda bağlanabiliyor; D1 100 parametre sınırını aşabilir — önceden var olan risk, A016 kapsamında değiştirilmedi.
Kapanış için kalan: merge → dağıtım → canlı Studio belgesi oluşturma kanıtı.

### Kayıt ve dağıtım notları — 20 Ekim 18:34–18:45

PR #267 (takip kaydı v5) main'e squash merge `ee611e624707c24968b71c3a25911ad92fc5cce8`; bu sürüm (v6) main üzerinden yeni dalda tutulur. PR #273 (inceleme sinyalleri/yeniden deneme) Deploy App Production Only run 39443428526 SUCCESS.

### A016 kapanışı — 20 Ekim 18:45

Durum: BİTTİ. PR #274 merge `63d6c00bd3dfaed738057759ea76490dd4fd5475` (kullanıcı). Deploy App Production Only run 39449611468 SUCCESS 15:37 UTC (Deploy, D1 migrations, read-only smoke). 18:45 app ve sonuc health ready/production. Kurum izolasyonu, yıl ve kazanım kapsamı 3 testle (kurum filtresi mutasyon kontrollü); onay/telif ve eksik stok davranışı korunur.
Eksik: canlı Studio belgesi oluşturma ekranı → K002.
Sıradaki ID: A017 — AKTİF.

### A017 — PDF motoru ve markalama, 20 Ekim 18:44–19:20

Bulgu: eski Studio PDF Türkçe harfleri bozuyor, kökü 3 satırda ve şıkları ~25 karakterde sessizce kesiyor, sayfa geçmiyor (8. sorudan sonra üst üste), görsel basmıyor, AI sorularını reddediyor, cevap anahtarı ve arayüzde indirme düğmesi yok. Kullanıcı yeniden yapımı onayladı (A, 18:44).
Kullanıcı kararları (19:01): kurum logosu+adı sol üst, ANUNEX sağ üst (kurum kaldırabilir), AI sorularının yanında Nibiru işareti (kapatılabilir). Örnek PDF'ler gönderildi; kullanıcı onayladı (19:20).
PR #275: pdf-lib + gömülü DejaVu alt kümesi; iki sütun gerçek sayfalama; tam kök/şık; PNG/JPEG görsel, TABLE ve BAR_CHART; basılamayan durumda soru numarası+nedenle 409; optik sayfa komut ve geometri birebir; ayrı personel cevap anahtarı; kurum baskı logosu yükleme; indirme düğmeleri. 224 dosya / 1.143 test, typecheck, build PASS; Worker 1,28 MiB gzip.
Bilinen sınır: optik sayfa başlığındaki Türkçe karakterler A035'te.

### Değişiklik kayıtları — 20 Ekim 19:20 (kullanıcı onayı)

A083 eklendi (Studio test oluşturma deneyimi); Studio işleriyle birlikte A018'in hemen arkasında ele alınır. A014'e karekod, A067'ye karekod/kazanım sayfası, A078'e etkileşimli tahta modu ekleri yazıldı. Kaynak: kullanıcının paylaştığı örnek soru havuzu ekranlarıyla karşılaştırma.

### A017 — dağıtım ve alt kayıt, 20 Ekim 19:20–19:50

PR #275 merge `348c1c8cb239b7a5ec227e4c78939c25e12dfd48`; Deploy App Production Only run 39457513276 SUCCESS 16:35 UTC.
**Alt kayıt A017.1 (canlı hata, kullanıcı ekranı 19:38):** Süper Admin Studio'da "Taslak oluştur"a bastığında yalnız sayfa üstünde "Kurum kapsamı gereklidir." çıktı; formda kurum seçimi ve düğme yanında geri bildirim yoktu. PR #276 (CI run 39460247056 SUCCESS): Süper Admin için zorunlu kurum seçimi; düğme pasifken nedeni; oluşturuluyor/başarı/sunucu hatası düğmenin altında; logo yükleme seçilen kuruma göre ve yerinde onaylı. 3 yeni UI testi; 225 dosya / 1.146 test, typecheck, build PASS.
A018 ön incelemesi (kod değiştirilmedi): Studio optik şablon/gönderim uçları var ama arayüzde okutma ekranı yok; kitapçık balonu sunucuda doğrulanmıyor; cevaplar soru kimliğiyle bekleniyor (sıra eşlemesi istemciye bırakılmış); aynı öğrencinin ikinci okutması `INSERT OR IGNORE` ile sessizce yok sayılırken yanıt yeni puanı döndürüyor; optik sayfa ~42 soruyu taşıyor, Studio 200'e kadar izin veriyor.
Kapanış için kalan: #276 merge+dağıtım → kullanıcının Studio'dan belge oluşturup Kitapçık A ve Cevap anahtarı PDF'ini indirdiği ekran.

### A017 — BEKLİYOR, 20 Ekim 19:53

PR #276 merge `ef9918611069a618100e2c8f6bbbb3d2079645b6` (kullanıcı); Deploy App Production Only run 39460942171 production onayı bekliyor — kullanıcının "yine aynı" gözlemi bu nedenle. Kullanıcı talimatı ("sıradaki işleme geçelim") ile madde 8 için açık onay: A017 bekletildi, A018 başladı. Kapanış: dağıtım onayı + Studio'dan belge oluşturma ve Kitapçık A / Cevap anahtarı PDF ekranı.

### A018 — bulgular ve PR, 20 Ekim 19:55–20:40

Studio optik zinciri hiç kullanılmamıştı (arayüzde okutma ekranı yoktu). Okutma ekranı yapılırken ölçümle bulunan kusurlar:
1. Kamera köşe kareleri sayfa dolgusu rengindeydi (render: RGB 240,245,255) → okuyucu bulamıyordu; Studio optiği hiç okunamazdı. Düz siyah yapıldı.
2. Şablon alt köşe hedefleri 274,3 mm, çizim 280,1 mm → alt satırlarda kayma. Hedefler çizimden hesaplanıyor.
3. Kalın başlık sol üst karenin arama kutusuna giriyordu → aşağı alındı.
4. A/B kitapçık balonları şablonda yoktu → okunabilir bölge eklendi.
5. Optik sayfa 44 soru; Studio 200'e izin veriyordu → optikli belgede >44 reddedilir; optiksiz PDF'te optik sayfa yok.
6. Kitapçık istemciden alınıyor, cevaplar soru kimliğiyle bekleniyordu → sıra numarasıyla, sunucuda eşleme; okunan kitapçık uyuşmazsa 409; boş/çift işarette öğretmen onayı.
7. İkinci okutma sessizce üzerine yazıyordu (kitapçık kodu güncellenmeden) → ALREADY_SCANNED; gerekçeli değiştirme ve denetim kaydı.
8. Süper Admin okutmasında öğrencinin belge kurumuna aidiyeti kontrol edilmiyordu → tüm rollerde aktif kayıt zorunlu.
Doğrulama: gerçek PDF optik sayfası 150 dpi'da işaretlenip uygulamanın okuma motoruyla okutuldu: 14/14 + boş + kitapçık B birebir; eğik/bulanık/küçük-karanlık/kenar boşluklu görüntülerde de birebir.
PR #277 (CI run 39463280222 SUCCESS): 12 yeni test (gerçek motorla sentetik 44 soruluk okuma, eski hedeflerle kırıldığı doğrulandı); 228 dosya / 1.158 test, typecheck, build PASS.
Not: önceden üretilmiş PDF şablonları eski geometride; dağıtım sonrası PDF yeniden indirilince güncellenir.
Kapanış için kalan: merge+dağıtım → gerçek basılı optiğin telefonla okutulması (A036 fiziksel kanıtıyla ortak; sentetik test fiziksel kanıt sayılmaz).

### A017.1 canlı kanıt ve A083 girdisi — 20 Ekim 20:20

Kullanıcı ekranı (20:20): Studio formunda Süper Admin için "Kurum (zorunlu)" seçimi ve "Baskı görünümü" bölümü canlıda; "Taslak oluştur" sonrası düğme altında "İstenen 2 soruya uygun soru havuzu bulunamadı; yalnız 0 soru seçilebildi." → A017.1 düzeltmesi canlıda doğrulandı.
Neden 0: "Ders kodu" serbest metin alanına `00001` girilmiş (iç kimlik bekleniyor, ör. `sub_math`); sınıf 5. Havuzda 19 soru, 12 onaylı; AI soruları REVIEW'da. **A083 girdisi:** ders serbest metin olmamalı (listeden seçim); seçim sırasında onaylı stok sayısı gösterilmeli; 0 sonuçta hangi filtrenin daralttığı söylenmeli.
A017 hâlâ: Studio'dan gerçek belge + PDF indirme kanıtı (kullanıcıya sınıf/ders boş bırakarak deneme önerildi).
